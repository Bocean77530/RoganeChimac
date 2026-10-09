import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabase } from "@/db/client.server";
import { paymentConfirmationPollInterval, trackingPollInterval } from "@/lib/order-polling";
import { createPendingOrder } from "../orders.server";
import {
  claimLocalPrintJob,
  listLocalPrintJobs,
  listMerchantPrintJobs,
  reportLocalPrintJob,
  retryLocalPrintJob,
} from "../local-print-jobs.server";
import { applyNormalizedPaymentEvent, preparePaymentAttempt } from "../payment-persistence.server";
import { quoteOrder } from "../pricing.server";
import { signTableCode } from "../table-codes.server";
import { transitionOrderStatus } from "../order-transitions.server";
import { recordCounterPayment, updateMerchantOrder } from "../merchant-orders.server";
import { resolveTableEntry } from "../table-entry.server";
import { getPublicOrder } from "../public-orders.server";
import {
  placardDirectory,
  runTableCommand,
  signProvisionedTable,
} from "../../../scripts/tables.mjs";
import { runWorker } from "../../../printing/worker.mjs";

const testUrl = process.env.TEST_DATABASE_URL;
const safeTestUrl = (() => {
  if (!testUrl) return false;
  const url = new URL(testUrl);
  return (
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname) &&
    url.pathname === "/dine_in_phase1_test"
  );
})();
const suite = safeTestUrl ? describe : describe.skip;
const migrationFolder = fileURLToPath(new URL("../../../drizzle/", import.meta.url));
const restaurantId = randomUUID();
const otherRestaurantId = randomUUID();
const slotId = randomUUID();
const oldQuoteId = randomUUID();
const oldOrderId = randomUUID();
const oldPaymentId = randomUUID();
const oldJobId = randomUUID();
const tableId = randomUUID();
const secret = "dine-in-phase-one-table-code-secret-123456";
let client: pg.Client;

async function applyMigration(name: string) {
  const source = readFileSync(`${migrationFolder}/${name}`, "utf8");
  for (const statement of source.split("--> statement-breakpoint")) {
    if (statement.trim()) await client.query(statement);
  }
}

async function quoteTable(tableCode: string, restaurantSlug = "phase1") {
  return quoteOrder({
    restaurantSlug,
    fulfillment: { type: "dine_in", mode: "table", tableCode },
    paymentMethod: "pay_at_counter",
    lines: [
      {
        clientLineId: randomUUID(),
        menuItemId: "bibimbap",
        quantity: 2,
        modifierOptionIds: [],
        notes: "No onion",
      },
    ],
  });
}

suite("dine-in phase one against a disposable local PostgreSQL database", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = testUrl;
    process.env.DINE_IN_TABLE_CODE_SECRET = secret;
    process.env.PRINT_V2_CREATED_AFTER = "2020-01-01T00:00:00.000Z";
    process.env.ORDER_TRACKING_TOKEN_SECRET = "phase-one-tracking-secret-at-least-32-characters";
    process.env.ADMIN_ACCESS_TOKEN = "phase-two-admin-token-at-least-24-chars";
    client = new pg.Client({ connectionString: testUrl });
    await client.connect();
    await client.query("DROP SCHEMA public CASCADE");
    await client.query("CREATE SCHEMA public");
    for (const name of [
      "0000_nice_titania.sql",
      "0001_complete_warpath.sql",
      "0002_fast_wrecker.sql",
    ]) {
      await applyMigration(name);
    }

    // Existing pickup, payment and integration data are present before the new migration.
    await client.query(
      `INSERT INTO restaurants (id, slug, name, address_line_1, suburb, phone)
       VALUES ($1, 'phase1', 'Phase One Test', '1 Test Street', 'Canberra', '0400000000')`,
      [restaurantId],
    );
    await client.query(
      `INSERT INTO pickup_slots (id, restaurant_id, starts_at, ends_at, capacity)
       VALUES ($1, $2, now() + interval '2 hours', now() + interval '2 hours 15 minutes', 4)`,
      [slotId, restaurantId],
    );
    await client.query(
      `INSERT INTO order_quotes (id, restaurant_id, pickup_slot_id, request_hash, lines_snapshot,
         subtotal_cents, total_cents, expires_at)
       VALUES ($1, $2, $3, $4, '[]'::jsonb, 1000, 1000, now() + interval '1 hour')`,
      [oldQuoteId, restaurantId, slotId, "a".repeat(64)],
    );
    await client.query(
      `INSERT INTO orders (id, restaurant_id, quote_id, pickup_slot_id, order_number,
         tracking_token_hash, customer_name, customer_phone, customer_email, terms_version,
         terms_accepted_at, subtotal_cents, total_cents, requested_for, payment_due_at)
       VALUES ($1, $2, $3, $4, 'RC-OLDORDER', $5, 'Old Guest', '0400000000',
         'old@example.com', 'v1', now(), 1000, 1000,
         now() + interval '2 hours', now() + interval '30 minutes')`,
      [oldOrderId, restaurantId, oldQuoteId, slotId, "b".repeat(64)],
    );
    await client.query(
      `INSERT INTO payments (id, order_id, attempt_number, provider, amount_cents, expires_at)
       VALUES ($1, $2, 1, 'stripe', 1000, now() + interval '30 minutes')`,
      [oldPaymentId, oldOrderId],
    );
    await client.query(
      `INSERT INTO integration_jobs (id, restaurant_id, order_id, kind, provider, idempotency_key, payload, next_attempt_at)
       VALUES ($1, $2, $3, 'kitchen_print', 'local_worker', 'old-print-job', '{"schemaVersion":1}', now())`,
      [oldJobId, restaurantId, oldOrderId],
    );

    const newMigration = readdirSync(migrationFolder).find((name) => /^0003_.*\.sql$/.test(name));
    if (!newMigration) throw new Error("Dine-in migration 0003 is missing");
    await applyMigration(newMigration);
    const phaseTwoMigration = readdirSync(migrationFolder).find((name) =>
      /^0004_.*\.sql$/.test(name),
    );
    if (!phaseTwoMigration) throw new Error("Dine-in migration 0004 is missing");
    await applyMigration(phaseTwoMigration);

    await client.query(
      "UPDATE restaurants SET dine_in_enabled = true, pickup_booking_days = 2, pickup_prep_minutes = 0 WHERE id = $1",
      [restaurantId],
    );
    await client.query(
      `INSERT INTO restaurants (id, slug, name, address_line_1, suburb, phone, dine_in_enabled)
       VALUES ($1, 'phase1-other', 'Other Restaurant', '2 Test Street', 'Canberra', '0400000001', true)`,
      [otherRestaurantId],
    );
    await client.query(
      `INSERT INTO restaurant_tables (id, restaurant_id, code, label)
       VALUES ($1, $2, 'T07', 'Table 7')`,
      [tableId, restaurantId],
    );
    const categoryId = randomUUID();
    await client.query(
      `INSERT INTO menu_categories (id, restaurant_id, slug, name) VALUES ($1, $2, 'mains', 'Mains')`,
      [categoryId, restaurantId],
    );
    await client.query(
      `INSERT INTO menu_items (id, restaurant_id, category_id, slug, name, description, image_key, price_cents)
       VALUES ($1, $2, $3, 'bibimbap', 'Bibimbap', 'Rice bowl', 'bibimbap', 1500)`,
      [randomUUID(), restaurantId, categoryId],
    );
    for (let day = 0; day < 7; day++) {
      await client.query(
        `INSERT INTO business_hours (id, restaurant_id, day_of_week, opens_at, closes_at)
         VALUES ($1, $2, $3, '00:00', '23:59')`,
        [randomUUID(), restaurantId, day],
      );
    }
  }, 30_000);

  afterAll(async () => {
    await closeDatabase();
    if (client) await client.end();
  });

  it("preserves old rows and defaults them to pickup/online", async () => {
    const result = await client.query(
      `SELECT q.fulfillment_method AS quote_method, q.payment_method AS quote_payment,
              o.fulfillment_method AS order_method, o.payment_method AS order_payment,
              o.pickup_slot_id, p.id AS payment_id, j.id AS job_id, j.payload_version
       FROM orders o JOIN order_quotes q ON q.id = o.quote_id
       JOIN payments p ON p.order_id = o.id
       JOIN integration_jobs j ON j.order_id = o.id
       WHERE o.id = $1`,
      [oldOrderId],
    );
    expect(result.rows[0]).toMatchObject({
      quote_method: "pickup",
      quote_payment: "online",
      order_method: "pickup",
      order_payment: "online",
      pickup_slot_id: slotId,
      payment_id: oldPaymentId,
      job_id: oldJobId,
      payload_version: 1,
    });
  });

  it("rejects forged, foreign, inactive and rotated table codes", async () => {
    const token = signTableCode({ restaurantId, tableId, tokenVersion: 1 });
    await client.query("UPDATE restaurants SET dine_in_enabled = false WHERE id = $1", [
      restaurantId,
    ]);
    expect(await quoteTable(token)).toMatchObject({
      ok: false,
      error: { code: "ORDERING_DISABLED" },
    });
    await client.query("UPDATE restaurants SET dine_in_enabled = true WHERE id = $1", [
      restaurantId,
    ]);
    expect((await quoteTable(token)).ok).toBe(true);
    expect((await quoteTable(token.replace(tableId, otherRestaurantId))).ok).toBe(false);
    expect((await quoteTable(token, "phase1-other")).ok).toBe(false);
    await client.query("UPDATE restaurant_tables SET active = false WHERE id = $1", [tableId]);
    expect((await quoteTable(token)).ok).toBe(false);
    await client.query(
      "UPDATE restaurant_tables SET active = true, token_version = 2 WHERE id = $1",
      [tableId],
    );
    expect((await quoteTable(token)).ok).toBe(false);
    expect((await quoteTable(signTableCode({ restaurantId, tableId, tokenVersion: 2 }))).ok).toBe(
      true,
    );
    expect(
      await quoteOrder({
        restaurantSlug: "phase1",
        fulfillment: { type: "dine_in", mode: "table", tableCode: token },
        paymentMethod: "online",
        lines: [
          {
            clientLineId: randomUUID(),
            menuItemId: "bibimbap",
            quantity: 1,
            modifierOptionIds: [],
          },
        ],
      }),
    ).toMatchObject({ ok: false, error: { code: "TABLE_CODE_INVALID" } });
  });

  it("submits one unpaid table order and exactly two v2 jobs without reserving pickup capacity", async () => {
    const code = signTableCode({ restaurantId, tableId, tokenVersion: 2 });
    const quote = await quoteTable(code);
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    expect(quote.data.fulfillment).toMatchObject({ type: "dine_in", tableLabel: "Table 7" });
    const attemptId = randomUUID();
    const input = {
      quoteId: quote.data.quoteId,
      attemptId,
      customer: { name: "Table Guest", phone: "0400000000", email: "table@example.com" },
      notes: "No peanuts",
      termsAccepted: true as const,
      termsVersion: "v1",
    };
    const before = await client.query("SELECT reserved_count FROM pickup_slots WHERE id = $1", [
      slotId,
    ]);
    const first = await createPendingOrder(input);
    const second = await createPendingOrder(input);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.data.id).toBe(second.data.id);
    expect(first.data).toMatchObject({
      status: "submitted",
      paymentStatus: "unpaid",
      fulfillment: { type: "dine_in", tableLabel: "Table 7" },
    });
    const jobs = await client.query(
      "SELECT payload_version, payload, idempotency_key FROM integration_jobs WHERE order_id = $1 ORDER BY idempotency_key",
      [first.data.id],
    );
    expect(jobs.rows).toHaveLength(2);
    expect(jobs.rows.map((row) => row.payload.destination)).toEqual(["front", "kitchen"]);
    for (const row of jobs.rows) {
      expect(row.payload_version).toBe(2);
      expect(row.payload).toMatchObject({
        schemaVersion: 2,
        method: "dine_in",
        table: { id: tableId, label: "Table 7" },
        payment: { method: "pay_at_counter", status: "unpaid" },
        items: [{ quantity: 2, name: "Bibimbap", notes: "No onion" }],
        orderNotes: "No peanuts",
        totals: { totalCents: 3000 },
      });
    }
    const workerVisible = await listLocalPrintJobs();
    expect(workerVisible.filter((job) => job.orderId === first.data.id)).toHaveLength(2);
    await client.query("UPDATE integration_jobs SET status = 'succeeded' WHERE id = $1", [
      oldJobId,
    ]);
    expect(
      (await listLocalPrintJobs()).filter((job) => job.orderId === first.data.id),
    ).toHaveLength(2);
    const after = await client.query("SELECT reserved_count FROM pickup_slots WHERE id = $1", [
      slotId,
    ]);
    expect(after.rows[0].reserved_count).toBe(before.rows[0].reserved_count);
    const stripe = await preparePaymentAttempt({
      orderId: first.data.id,
      provider: "stripe",
      livemode: false,
    });
    expect(stripe).toMatchObject({ ok: false, error: { code: "PAYMENT_NOT_CONFIRMED" } });
    const accepted = await transitionOrderStatus({
      orderId: first.data.id,
      expectedVersion: 1,
      toStatus: "accepted",
      actorType: "admin",
    });
    expect(accepted.ok).toBe(true);
    const stillTwo = await client.query("SELECT id FROM integration_jobs WHERE order_id = $1", [
      first.data.id,
    ]);
    expect(stillTwo.rows).toHaveLength(2);
  });

  it("rejects a quote if the table token is rotated before submission", async () => {
    const quote = await quoteTable(signTableCode({ restaurantId, tableId, tokenVersion: 2 }));
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    await client.query("UPDATE restaurant_tables SET token_version = 3 WHERE id = $1", [tableId]);
    const result = await createPendingOrder({
      quoteId: quote.data.quoteId,
      attemptId: randomUUID(),
      customer: { name: "Table Guest", phone: "0400000000", email: "table@example.com" },
      termsAccepted: true,
      termsVersion: "v1",
    });
    expect(result).toMatchObject({ ok: false, error: { code: "TABLE_CODE_INVALID" } });
  });

  it("returns one order and two jobs for concurrent retries of the same attempt", async () => {
    const quote = await quoteTable(signTableCode({ restaurantId, tableId, tokenVersion: 3 }));
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    const input = {
      quoteId: quote.data.quoteId,
      attemptId: randomUUID(),
      customer: { name: "Table Guest", phone: "0400000000", email: "table@example.com" },
      termsAccepted: true as const,
      termsVersion: "v1",
    };
    const [first, second] = await Promise.all([
      createPendingOrder(input),
      createPendingOrder(input),
    ]);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.data.id).toBe(second.data.id);
    const jobs = await client.query("SELECT id FROM integration_jobs WHERE order_id = $1", [
      first.data.id,
    ]);
    expect(jobs.rows).toHaveLength(2);
  });

  it("returns a consumed quote error when distinct attempts race for the same quote", async () => {
    const quote = await quoteTable(signTableCode({ restaurantId, tableId, tokenVersion: 3 }));
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    const input = {
      quoteId: quote.data.quoteId,
      attemptId: randomUUID(),
      customer: { name: "Table Guest", phone: "0400000000", email: "table@example.com" },
      termsAccepted: true as const,
      termsVersion: "v1",
    };
    const results = await Promise.all([
      createPendingOrder(input),
      createPendingOrder({ ...input, attemptId: randomUUID() }),
    ]);
    const winners = results.filter((result) => result.ok);
    const losers = results.filter((result) => !result.ok);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0]).toMatchObject({ ok: false, error: { code: "QUOTE_ALREADY_CONSUMED" } });
    const orders = await client.query("SELECT id FROM orders WHERE quote_id = $1", [
      quote.data.quoteId,
    ]);
    expect(orders.rows).toHaveLength(1);
    const jobs = await client.query("SELECT id FROM integration_jobs WHERE order_id = $1", [
      orders.rows[0].id,
    ]);
    expect(jobs.rows).toHaveLength(2);
  });

  it("keeps pickup on pending payment and reserves exactly one slot", async () => {
    const quote = await quoteOrder({
      restaurantSlug: "phase1",
      fulfillment: { type: "pickup", mode: "asap" },
      lines: [
        { clientLineId: randomUUID(), menuItemId: "bibimbap", quantity: 1, modifierOptionIds: [] },
      ],
    });
    expect(quote.ok).toBe(true);
    if (!quote.ok || quote.data.fulfillment.type !== "pickup") return;
    const slot = quote.data.fulfillment.slotId;
    const before = await client.query("SELECT reserved_count FROM pickup_slots WHERE id = $1", [
      slot,
    ]);
    const order = await createPendingOrder({
      quoteId: quote.data.quoteId,
      attemptId: randomUUID(),
      customer: { name: "Pickup Guest", phone: "0400000000", email: "pickup@example.com" },
      termsAccepted: true,
      termsVersion: "v1",
    });
    expect(order.ok).toBe(true);
    if (!order.ok) return;
    expect(order.data).toMatchObject({
      status: "pending_payment",
      paymentStatus: "pending",
      fulfillment: { type: "pickup" },
    });
    const after = await client.query("SELECT reserved_count FROM pickup_slots WHERE id = $1", [
      slot,
    ]);
    expect(after.rows[0].reserved_count).toBe(before.rows[0].reserved_count + 1);
    const jobs = await client.query("SELECT id FROM integration_jobs WHERE order_id = $1", [
      order.data.id,
    ]);
    expect(jobs.rows).toHaveLength(0);
    const payment = await preparePaymentAttempt({
      orderId: order.data.id,
      provider: "stripe",
      livemode: false,
    });
    expect(payment.ok).toBe(true);
    const paidEvent = {
      provider: "stripe",
      providerEventId: randomUUID(),
      type: "payment.succeeded" as const,
      eventCreatedAt: new Date().toISOString(),
      orderId: order.data.id,
      money: { currency: "AUD" as const, amountCents: order.data.totals.totalCents },
      livemode: false,
    };
    const applied = await applyNormalizedPaymentEvent(paidEvent);
    expect(applied.ok).toBe(true);
    const printed = await client.query(
      "SELECT payload_version, payload FROM integration_jobs WHERE order_id = $1 AND provider = 'local_worker' ORDER BY idempotency_key",
      [order.data.id],
    );
    expect(printed.rows).toHaveLength(2);
    expect(
      printed.rows.every((row) => row.payload_version === 1 && row.payload.method === "pickup"),
    ).toBe(true);
    expect(
      (await listLocalPrintJobs()).filter((job) => job.orderId === order.data.id),
    ).toHaveLength(2);
    await client.query("UPDATE orders SET payment_status = 'pending' WHERE id = $1", [
      order.data.id,
    ]);
    expect((await listLocalPrintJobs()).some((job) => job.orderId === order.data.id)).toBe(false);
    await client.query("UPDATE orders SET payment_status = 'paid' WHERE id = $1", [order.data.id]);
    await client.query("UPDATE orders SET payment_status = 'partially_refunded' WHERE id = $1", [
      order.data.id,
    ]);
    expect(
      (await listLocalPrintJobs()).filter((job) => job.orderId === order.data.id),
    ).toHaveLength(2);
    await client.query("UPDATE orders SET payment_status = 'paid' WHERE id = $1", [order.data.id]);
    expect(
      (await applyNormalizedPaymentEvent({ ...paidEvent, providerEventId: randomUUID() })).ok,
    ).toBe(true);
    const afterDuplicate = await client.query(
      "SELECT id FROM integration_jobs WHERE order_id = $1 AND provider = 'local_worker'",
      [order.data.id],
    );
    expect(afterDuplicate.rows).toHaveLength(2);
  });

  it("resolves signed table codes and rate limits repeated lookup", async () => {
    const code = signTableCode({ restaurantId, tableId, tokenVersion: 3 });
    expect(await resolveTableEntry({ restaurantSlug: "phase1", tableCode: code })).toMatchObject({
      ok: true,
      data: { tableId, tableLabel: "Table 7" },
    });
    expect(
      await resolveTableEntry({ restaurantSlug: "phase1", tableCode: `${code.slice(0, -1)}x` }),
    ).toMatchObject({ ok: false, error: { code: "TABLE_CODE_INVALID" } });
    const before = Number(
      (await client.query("SELECT count(*) AS count FROM table_code_rate_limits")).rows[0].count,
    );
    for (let index = 0; index < 40; index++) {
      await resolveTableEntry({
        restaurantSlug: `unknown-${index}`,
        tableCode: `bad-${index}-${"a".repeat(42)}`,
      });
    }
    const after = Number(
      (await client.query("SELECT count(*) AS count FROM table_code_rate_limits")).rows[0].count,
    );
    expect(after).toBe(before);

    const throttledTableId = randomUUID();
    await client.query(
      "INSERT INTO restaurant_tables (id, restaurant_id, code, label) VALUES ($1, $2, 'T99', 'Table 99')",
      [throttledTableId, restaurantId],
    );
    const throttledCode = signTableCode({
      restaurantId,
      tableId: throttledTableId,
      tokenVersion: 1,
    });
    for (let index = 0; index < 30; index++) {
      expect(
        (await resolveTableEntry({ restaurantSlug: "phase1", tableCode: throttledCode })).ok,
      ).toBe(true);
    }
    expect(
      await resolveTableEntry({ restaurantSlug: "phase1", tableCode: throttledCode }),
    ).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
  });

  it("keeps dine-in online unprinted until verified payment and never creates a POS job", async () => {
    const quote = await quoteOrder({
      restaurantSlug: "phase1",
      fulfillment: {
        type: "dine_in",
        mode: "table",
        tableCode: signTableCode({ restaurantId, tableId, tokenVersion: 3 }),
      },
      paymentMethod: "online",
      lines: [
        {
          clientLineId: randomUUID(),
          menuItemId: "bibimbap",
          quantity: 1,
          modifierOptionIds: [],
          notes: "No onion",
        },
      ],
    });
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    const order = await createPendingOrder({
      quoteId: quote.data.quoteId,
      attemptId: randomUUID(),
      customer: { name: "Online Guest", phone: "0400000000", email: "online@example.com" },
      notes: "No peanuts",
      termsAccepted: true,
      termsVersion: "v1",
    });
    expect(order).toMatchObject({
      ok: true,
      data: {
        status: "pending_payment",
        paymentStatus: "pending",
        fulfillment: { type: "dine_in", tableLabel: "Table 7" },
      },
    });
    if (!order.ok) return;
    expect(
      (await client.query("SELECT id FROM integration_jobs WHERE order_id = $1", [order.data.id]))
        .rows,
    ).toHaveLength(0);
    expect(
      await updateMerchantOrder({
        adminToken: process.env.ADMIN_ACCESS_TOKEN!,
        orderId: order.data.id,
        expectedVersion: 1,
        toStatus: "cancelled",
      }),
    ).toMatchObject({ ok: false, error: { code: "INVALID_STATUS_TRANSITION" } });
    expect(
      (await preparePaymentAttempt({ orderId: order.data.id, provider: "stripe", livemode: false }))
        .ok,
    ).toBe(true);
    const event = {
      provider: "stripe",
      providerEventId: randomUUID(),
      type: "payment.failed" as "payment.failed" | "payment.succeeded",
      eventCreatedAt: new Date().toISOString(),
      orderId: order.data.id,
      money: { currency: "AUD" as const, amountCents: order.data.totals.totalCents },
      livemode: false,
    };
    expect((await applyNormalizedPaymentEvent(event)).ok).toBe(true);
    const failedView = await getPublicOrder({ trackingToken: order.data.trackingToken });
    expect(failedView).toMatchObject({
      ok: true,
      data: { status: "pending_payment", paymentStatus: "failed" },
    });
    if (failedView.ok) {
      expect(trackingPollInterval(failedView.data)).toBe(10_000);
      expect(paymentConfirmationPollInterval(failedView.data)).toBe(10_000);
    }
    expect(
      (await client.query("SELECT id FROM integration_jobs WHERE order_id = $1", [order.data.id]))
        .rows,
    ).toHaveLength(0);
    const concurrentSuccesses = await Promise.all(
      [1, 2].map(() =>
        applyNormalizedPaymentEvent({
          ...event,
          providerEventId: randomUUID(),
          type: "payment.succeeded",
        }),
      ),
    );
    expect(concurrentSuccesses.map((result) => result.ok)).toEqual([true, true]);
    const paidView = await getPublicOrder({ trackingToken: order.data.trackingToken });
    expect(paidView).toMatchObject({ ok: true, data: { status: "paid", paymentStatus: "paid" } });
    if (paidView.ok) expect(paymentConfirmationPollInterval(paidView.data)).toBe(false);
    const jobs = await client.query(
      "SELECT kind, payload_version, payload FROM integration_jobs WHERE order_id = $1 ORDER BY idempotency_key",
      [order.data.id],
    );
    expect(jobs.rows).toHaveLength(2);
    expect(
      jobs.rows.every((row) => row.kind === "kitchen_print" && row.payload_version === 2),
    ).toBe(true);
    expect(jobs.rows.map((row) => row.payload.destination)).toEqual(["front", "kitchen"]);
    expect(jobs.rows[0].payload).toMatchObject({
      table: { id: tableId, label: "Table 7" },
      payment: { method: "online", status: "paid", label: "PAID ONLINE" },
      orderNotes: "No peanuts",
    });
    expect(jobs.rows[0].payload.payment.paidAt).toEqual(expect.any(String));
    expect(
      (
        await applyNormalizedPaymentEvent({
          ...event,
          providerEventId: randomUUID(),
          type: "payment.succeeded",
        })
      ).ok,
    ).toBe(true);
    expect(
      (await client.query("SELECT id FROM integration_jobs WHERE order_id = $1", [order.data.id]))
        .rows,
    ).toHaveLength(2);
    expect(
      (await listLocalPrintJobs()).filter((job) => job.orderId === order.data.id),
    ).toHaveLength(2);
  });

  it("records one audited counter payment without creating extra print jobs", async () => {
    const quote = await quoteTable(signTableCode({ restaurantId, tableId, tokenVersion: 3 }));
    if (!quote.ok) throw new Error("quote failed");
    const order = await createPendingOrder({
      quoteId: quote.data.quoteId,
      attemptId: randomUUID(),
      customer: { name: "Counter Guest", phone: "0400000000", email: "counter@example.com" },
      termsAccepted: true,
      termsVersion: "v1",
    });
    if (!order.ok) throw new Error("order failed");
    const input = {
      adminToken: process.env.ADMIN_ACCESS_TOKEN!,
      orderId: order.data.id,
      idempotencyKey: randomUUID(),
      method: "cash" as const,
      operatorName: "Staff One",
    };
    const results = await Promise.all([recordCounterPayment(input), recordCounterPayment(input)]);
    expect(results.map((result) => result.ok)).toEqual([true, true]);
    expect((await recordCounterPayment({ ...input, idempotencyKey: randomUUID() })).ok).toBe(false);
    const records = await client.query(
      "SELECT method, amount_cents, operator_name FROM counter_payment_records WHERE order_id = $1",
      [order.data.id],
    );
    expect(records.rows).toHaveLength(1);
    expect(records.rows[0]).toMatchObject({
      method: "cash",
      amount_cents: order.data.totals.totalCents,
      operator_name: "Staff One",
    });
    expect(
      (await client.query("SELECT id FROM integration_jobs WHERE order_id = $1", [order.data.id]))
        .rows,
    ).toHaveLength(2);
  });

  it("leaves an expired dine-in online order without print jobs", async () => {
    const quote = await quoteOrder({
      restaurantSlug: "phase1",
      fulfillment: {
        type: "dine_in",
        mode: "table",
        tableCode: signTableCode({ restaurantId, tableId, tokenVersion: 3 }),
      },
      paymentMethod: "online",
      lines: [
        { clientLineId: randomUUID(), menuItemId: "bibimbap", quantity: 1, modifierOptionIds: [] },
      ],
    });
    if (!quote.ok) throw new Error("quote failed");
    const order = await createPendingOrder({
      quoteId: quote.data.quoteId,
      attemptId: randomUUID(),
      customer: { name: "Expired Guest", phone: "0400000000", email: "expired@example.com" },
      termsAccepted: true,
      termsVersion: "v1",
    });
    if (!order.ok) throw new Error("order failed");
    expect(
      (await preparePaymentAttempt({ orderId: order.data.id, provider: "stripe", livemode: false }))
        .ok,
    ).toBe(true);
    const expired = await applyNormalizedPaymentEvent({
      provider: "stripe",
      providerEventId: randomUUID(),
      type: "session.expired",
      eventCreatedAt: new Date().toISOString(),
      orderId: order.data.id,
      livemode: false,
    });
    expect(expired).toMatchObject({ ok: true, data: { orderStatus: "expired" } });
    expect(
      (await client.query("SELECT id FROM integration_jobs WHERE order_id = $1", [order.data.id]))
        .rows,
    ).toHaveLength(0);
  });

  it("cancels only unclaimed unpaid table jobs", async () => {
    const quote = await quoteTable(signTableCode({ restaurantId, tableId, tokenVersion: 3 }));
    if (!quote.ok) throw new Error("quote failed");
    const order = await createPendingOrder({
      quoteId: quote.data.quoteId,
      attemptId: randomUUID(),
      customer: { name: "Cancel Guest", phone: "0400000000", email: "cancel@example.com" },
      termsAccepted: true,
      termsVersion: "v1",
    });
    if (!order.ok) throw new Error("order failed");
    await client.query(
      "UPDATE integration_jobs SET status = 'processing' WHERE order_id = $1 AND idempotency_key LIKE '%:kitchen'",
      [order.data.id],
    );
    const result = await updateMerchantOrder({
      adminToken: process.env.ADMIN_ACCESS_TOKEN!,
      orderId: order.data.id,
      expectedVersion: 1,
      toStatus: "cancelled",
    });
    expect(result.ok).toBe(true);
    const jobs = await client.query(
      "SELECT status FROM integration_jobs WHERE order_id = $1 ORDER BY idempotency_key",
      [order.data.id],
    );
    expect(jobs.rows.map((row) => row.status)).toEqual(["cancelled", "processing"]);
    expect((await listLocalPrintJobs()).some((job) => job.orderId === order.data.id)).toBe(false);
  });

  it("claims v2 destinations independently, rejects unknown jobs, and retries only a failed ticket", async () => {
    await client.query(
      "UPDATE integration_jobs SET status = 'succeeded' WHERE provider = 'local_worker' AND status IN ('queued', 'retry_scheduled')",
    );
    const quote = await quoteTable(signTableCode({ restaurantId, tableId, tokenVersion: 3 }));
    if (!quote.ok) throw new Error("quote failed");
    const order = await createPendingOrder({
      quoteId: quote.data.quoteId,
      attemptId: randomUUID(),
      customer: { name: "Print Guest", phone: "0400000000", email: "print@example.com" },
      termsAccepted: true,
      termsVersion: "v1",
    });
    if (!order.ok) throw new Error("order failed");
    await client.query("UPDATE integration_jobs SET max_attempts = 1 WHERE order_id = $1", [
      order.data.id,
    ]);
    await client.query(
      `INSERT INTO integration_jobs
         (id, restaurant_id, order_id, kind, provider, idempotency_key,
          payload_version, payload, next_attempt_at)
       VALUES ($1, $2, $3, 'kitchen_print', 'local_worker', $4, 99,
               '{"schemaVersion":99,"method":"dine_in","destination":"kitchen","items":[]}'::jsonb, now())`,
      [randomUUID(), restaurantId, order.data.id, `unsupported:${randomUUID()}`],
    );
    expect(
      (await listLocalPrintJobs()).filter((job) => job.orderId === order.data.id),
    ).toHaveLength(2);
    const merchant = await listMerchantPrintJobs(process.env.ADMIN_ACCESS_TOKEN!);
    expect(merchant.some((job) => job.orderId === order.data.id && !job.supported)).toBe(true);

    const [first, second] = await Promise.all([claimLocalPrintJob(), claimLocalPrintJob()]);
    expect(first?.id).toBeTruthy();
    expect(second?.id).toBeTruthy();
    expect(first?.id).not.toBe(second?.id);
    expect([first?.destination, second?.destination].sort()).toEqual(["front", "kitchen"]);
    expect(await claimLocalPrintJob()).toBeNull();
    if (!first || !second) return;
    const accepted = await reportLocalPrintJob(first.id, {
      leaseToken: first.leaseToken!,
      result: "queued",
      queueName: "Brother",
      spoolerJobId: "Brother-123",
    });
    expect(accepted).toMatchObject({ ok: true, job: { status: "succeeded" } });
    expect(
      await reportLocalPrintJob(first.id, {
        leaseToken: first.leaseToken!,
        result: "queued",
        queueName: "Brother",
        spoolerJobId: "Brother-123",
      }),
    ).toMatchObject({ ok: true });
    expect(
      await reportLocalPrintJob(first.id, {
        leaseToken: first.leaseToken!,
        result: "queued",
        queueName: "Brother",
        spoolerJobId: "Brother-999",
      }),
    ).toMatchObject({ ok: false, status: 409 });
    expect(
      await reportLocalPrintJob(second.id, {
        leaseToken: second.leaseToken!,
        result: "failed",
        queueName: "Broken",
        error: "lp rejected the ticket",
      }),
    ).toMatchObject({ ok: true, job: { status: "manual_action_required" } });
    expect(await retryLocalPrintJob(second.id, "Checked paper; safe to retry")).toMatchObject({
      ok: true,
      job: { status: "queued" },
    });
    const retry = await claimLocalPrintJob();
    expect(retry?.id).toBe(second.id);
    expect(retry?.destination).toBe(second.destination);
    expect(await claimLocalPrintJob()).toBeNull();
    expect(
      await reportLocalPrintJob(second.id, {
        leaseToken: second.leaseToken!,
        result: "queued",
        queueName: "Brother",
        spoolerJobId: "Brother-stale",
      }),
    ).toMatchObject({ ok: false, status: 404 });
  });

  it("provisions two tables, rotates one code, and deactivates the other", async () => {
    const rendered: Array<{ table: { code: string; token_version: number } }> = [];
    const environment = {
      ...process.env,
      DATABASE_URL: testUrl!,
      DINE_IN_TABLE_CODE_SECRET: secret,
      APP_BASE_URL: "https://example.test",
    };
    const render = async (input: { table: { code: string; token_version: number } }) => {
      rendered.push(input);
    };
    const created = await runTableCommand(
      ["create", "--restaurant", "phase1", "--tables", "T20:Table 20,T21:Table 21"],
      environment,
      () => {},
      render,
    );
    expect(created).toHaveLength(2);
    expect(rendered.map((entry) => entry.table.code)).toEqual(["T20", "T21"]);
    const oldCode = signProvisionedTable(
      { restaurantId, tableId: created[0].id, tokenVersion: 1 },
      secret,
    );
    expect(await resolveTableEntry({ restaurantSlug: "phase1", tableCode: oldCode })).toMatchObject(
      {
        ok: true,
        data: { tableLabel: "Table 20" },
      },
    );
    const rotated = await runTableCommand(
      ["rotate", "--restaurant", "phase1", "--code", "T20"],
      environment,
      () => {},
      render,
    );
    expect(rotated[0].token_version).toBe(2);
    expect(await resolveTableEntry({ restaurantSlug: "phase1", tableCode: oldCode })).toMatchObject(
      {
        ok: false,
        error: { code: "TABLE_CODE_INVALID" },
      },
    );
    const newCode = signProvisionedTable(
      { restaurantId, tableId: created[0].id, tokenVersion: 2 },
      secret,
    );
    expect(await resolveTableEntry({ restaurantSlug: "phase1", tableCode: newCode })).toMatchObject(
      {
        ok: true,
      },
    );
    await runTableCommand(
      ["deactivate", "--restaurant", "phase1", "--code", "T21"],
      environment,
      () => {},
      render,
    );
    expect(
      await resolveTableEntry({
        restaurantSlug: "phase1",
        tableCode: signProvisionedTable(
          { restaurantId, tableId: created[1].id, tokenVersion: 1 },
          secret,
        ),
      }),
    ).toMatchObject({ ok: false, error: { code: "TABLE_CODE_INVALID" } });
  });

  it("isolates same-code placards and rejects flat legacy files and stale renders", async () => {
    const output = await mkdtemp(join(tmpdir(), "rogane-placards-test-"));
    const environment = {
      ...process.env,
      DATABASE_URL: testUrl!,
      DINE_IN_TABLE_CODE_SECRET: secret,
      APP_BASE_URL: "https://example.test",
    };
    const render = async (input: {
      table: { id: string; token_version: number };
      restaurant: { id: string };
      output: string;
    }) => {
      const directory = placardDirectory(
        input.output,
        input.restaurant.id,
        input.table.id,
        input.table.token_version,
      );
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, "placard.svg"), "<svg/>");
      await writeFile(join(directory, "placard.pdf"), "%PDF-fake");
    };
    try {
      const first = await runTableCommand(
        [
          "create",
          "--restaurant",
          "phase1",
          "--tables",
          "T01:Table 01,t01:Lower 01",
          "--out",
          output,
        ],
        environment,
        () => {},
        render,
      );
      const other = await runTableCommand(
        ["create", "--restaurant", "phase1-other", "--tables", "T01:Other 01", "--out", output],
        environment,
        () => {},
        render,
      );
      const directories = [
        ...first.map((table) => placardDirectory(output, restaurantId, table.id, 1)),
        placardDirectory(output, otherRestaurantId, other[0].id, 1),
      ];
      expect(new Set(directories.map((path) => path.toLowerCase())).size).toBe(3);
      for (const directory of directories)
        await expect(access(join(directory, "placard.pdf"))).resolves.toBeUndefined();
      await writeFile(join(output, "t88.PDF"), "old flat placard");
      await expect(
        runTableCommand(
          ["create", "--restaurant", "phase1", "--tables", "T88:Legacy 88", "--out", output],
          environment,
          () => {},
          render,
        ),
      ).rejects.toThrow(/Legacy code-only placard/);
      expect(
        (
          await client.query(
            "SELECT id FROM restaurant_tables WHERE restaurant_id = $1 AND code = 'T88'",
            [restaurantId],
          )
        ).rows,
      ).toHaveLength(0);
      await expect(
        runTableCommand(
          ["create", "--restaurant", "phase1", "--tables", "T89:Different table", "--out", output],
          environment,
          () => {},
          render,
        ),
      ).rejects.toThrow(/Legacy code-only placard/);
      await rm(join(output, "t88.PDF"));

      const staleRender = async (input: {
        table: { id: string; token_version: number };
        restaurant: { id: string };
        output: string;
      }) => {
        await render(input);
        await client.query(
          "UPDATE restaurant_tables SET token_version = token_version + 1 WHERE id = $1",
          [input.table.id],
        );
      };
      await expect(
        runTableCommand(
          ["create", "--restaurant", "phase1", "--tables", "T33:Table 33", "--out", output],
          environment,
          () => {},
          staleRender,
        ),
      ).rejects.toThrow(/changed while rendering/);
      const stale = await client.query(
        "SELECT id FROM restaurant_tables WHERE restaurant_id = $1 AND code = 'T33'",
        [restaurantId],
      );
      await expect(
        access(placardDirectory(output, restaurantId, stale.rows[0].id, 1)),
      ).rejects.toThrow();
    } finally {
      await rm(output, { recursive: true, force: true });
    }
  });

  it("does not back-print old v2 jobs and keeps v1 active when the v2 cutoff is absent", async () => {
    await client.query(
      "UPDATE integration_jobs SET status = 'succeeded' WHERE provider = 'local_worker' AND status IN ('queued', 'retry_scheduled')",
    );
    const createTableOrder = async () => {
      const quote = await quoteTable(signTableCode({ restaurantId, tableId, tokenVersion: 3 }));
      if (!quote.ok) throw new Error("quote failed");
      const order = await createPendingOrder({
        quoteId: quote.data.quoteId,
        attemptId: randomUUID(),
        customer: { name: "Cutoff Guest", phone: "0400000000", email: "cutoff@example.com" },
        termsAccepted: true,
        termsVersion: "v1",
      });
      if (!order.ok) throw new Error("order failed");
      return order.data.id;
    };
    const oldOrderId = await createTableOrder();
    await client.query(
      "UPDATE integration_jobs SET created_at = now() - interval '1 day' WHERE order_id = $1",
      [oldOrderId],
    );
    const newOrderId = await createTableOrder();
    const original = process.env.PRINT_V2_CREATED_AFTER;
    try {
      delete process.env.PRINT_V2_CREATED_AFTER;
      const pickup = await client.query(
        `SELECT id FROM integration_jobs WHERE payload_version = 1
         AND jsonb_typeof(payload->'items') = 'array' LIMIT 1`,
      );
      expect(pickup.rows).toHaveLength(1);
      await client.query("UPDATE integration_jobs SET status = 'queued' WHERE id = $1", [
        pickup.rows[0].id,
      ]);
      expect((await listLocalPrintJobs()).map((job) => job.id)).toContain(pickup.rows[0].id);
      expect((await listLocalPrintJobs()).some((job) => job.orderId === newOrderId)).toBe(false);
      const unconfigured = await listMerchantPrintJobs(process.env.ADMIN_ACCESS_TOKEN!);
      expect(unconfigured.find((job) => job.orderId === oldOrderId)?.skipReason).toBe(
        "v2_cutoff_not_configured",
      );
      await client.query("UPDATE integration_jobs SET status = 'succeeded' WHERE id = $1", [
        pickup.rows[0].id,
      ]);
      process.env.PRINT_V2_CREATED_AFTER = new Date(Date.now() - 60_000).toISOString();
      const visible = await listLocalPrintJobs();
      expect(visible.filter((job) => job.orderId === oldOrderId)).toHaveLength(0);
      expect(visible.filter((job) => job.orderId === newOrderId)).toHaveLength(2);
      const configured = await listMerchantPrintJobs(process.env.ADMIN_ACCESS_TOKEN!);
      expect(configured.find((job) => job.orderId === oldOrderId)?.skipReason).toBe(
        "v2_created_before_cutoff",
      );
      const [first, second] = await Promise.all([claimLocalPrintJob(), claimLocalPrintJob()]);
      expect(first?.orderId).toBe(newOrderId);
      expect(second?.orderId).toBe(newOrderId);
      expect(await claimLocalPrintJob()).toBeNull();
      const oldJobs = await client.query(
        "SELECT status FROM integration_jobs WHERE order_id = $1",
        [oldOrderId],
      );
      expect(oldJobs.rows.map((row) => row.status)).toEqual(["queued", "queued"]);
      process.env.PRINT_V2_CREATED_AFTER = "invalid";
      expect((await listLocalPrintJobs()).some((job) => job.orderId === oldOrderId)).toBe(false);
      expect(
        (await listMerchantPrintJobs(process.env.ADMIN_ACCESS_TOKEN!)).find(
          (job) => job.orderId === oldOrderId,
        )?.skipReason,
      ).toBe("v2_cutoff_invalid");
    } finally {
      if (original) process.env.PRINT_V2_CREATED_AFTER = original;
      else delete process.env.PRINT_V2_CREATED_AFTER;
    }
  });

  it("requires a manual decision before requeueing an expired print lease", async () => {
    await client.query(
      "UPDATE integration_jobs SET status = 'succeeded' WHERE provider = 'local_worker' AND status IN ('queued', 'retry_scheduled')",
    );
    const quote = await quoteTable(signTableCode({ restaurantId, tableId, tokenVersion: 3 }));
    if (!quote.ok) throw new Error("quote failed");
    const order = await createPendingOrder({
      quoteId: quote.data.quoteId,
      attemptId: randomUUID(),
      customer: { name: "Lease Guest", phone: "0400000000", email: "lease@example.com" },
      termsAccepted: true,
      termsVersion: "v1",
    });
    if (!order.ok) throw new Error("order failed");
    const leased = await claimLocalPrintJob();
    expect(leased?.orderId).toBe(order.data.id);
    if (!leased) return;
    await client.query(
      "UPDATE integration_jobs SET lease_expires_at = now() - interval '1 second' WHERE id = $1",
      [leased.id],
    );
    expect((await listLocalPrintJobs()).some((job) => job.id === leased.id)).toBe(false);
    expect(
      (await listMerchantPrintJobs(process.env.ADMIN_ACCESS_TOKEN!)).find(
        (job) => job.id === leased.id,
      )?.canRetry,
    ).toBe(true);
    expect(await retryLocalPrintJob(leased.id, "Verified no paper was printed")).toMatchObject({
      ok: true,
      job: { status: "queued" },
    });
    expect(
      await reportLocalPrintJob(leased.id, {
        leaseToken: leased.leaseToken!,
        result: "queued",
        queueName: "Brother",
        spoolerJobId: "Brother-too-late",
      }),
    ).toMatchObject({ ok: false, status: 404 });
  });

  it("runs a simulated v1 pickup plus v2 table order through the local worker", async () => {
    await client.query(
      "UPDATE integration_jobs SET status = 'succeeded' WHERE provider = 'local_worker' AND status IN ('queued', 'retry_scheduled')",
    );
    const oldPickup = await client.query(
      `SELECT id FROM integration_jobs WHERE provider = 'local_worker' AND payload_version = 1
       AND jsonb_typeof(payload->'items') = 'array' ORDER BY created_at LIMIT 2`,
    );
    expect(oldPickup.rows).toHaveLength(2);
    await client.query("UPDATE integration_jobs SET status = 'queued' WHERE id = ANY($1::uuid[])", [
      oldPickup.rows.map((row) => row.id),
    ]);
    const quote = await quoteTable(signTableCode({ restaurantId, tableId, tokenVersion: 3 }));
    if (!quote.ok) throw new Error("quote failed");
    const tableOrder = await createPendingOrder({
      quoteId: quote.data.quoteId,
      attemptId: randomUUID(),
      customer: { name: "Final Guest", phone: "0400000000", email: "final@example.com" },
      termsAccepted: true,
      termsVersion: "v1",
    });
    if (!tableOrder.ok) throw new Error("order failed");
    const submitted: Array<{ queue: string; path: string; title: string }> = [];
    await runWorker({
      once: true,
      api: {
        list: async () => [],
        claim: claimLocalPrintJob,
        report: async (id, result) => {
          const response = await reportLocalPrintJob(
            id,
            result as Parameters<typeof reportLocalPrintJob>[1],
          );
          if (!response.ok) throw new Error(response.error);
          return response.job;
        },
      },
      queues: { kitchen: "KitchenQueue", front: "FrontQueue" },
      savePdf: async (job) => `/private/tmp/${job.id}.pdf`,
      submit: async (queue, path, title) => {
        submitted.push({ queue, path, title });
        return `${queue}-${submitted.length}`;
      },
      wait: async () => {},
      log: () => {},
    });
    expect(submitted).toHaveLength(4);
    expect(submitted.filter((entry) => entry.queue === "KitchenQueue")).toHaveLength(2);
    expect(submitted.filter((entry) => entry.queue === "FrontQueue")).toHaveLength(2);
    expect(submitted.every((entry) => entry.path.endsWith(".pdf"))).toBe(true);
    const result = await client.query(
      `SELECT status, external_id FROM integration_jobs
       WHERE id = ANY($1::uuid[]) OR order_id = $2`,
      [oldPickup.rows.map((row) => row.id), tableOrder.data.id],
    );
    expect(result.rows).toHaveLength(4);
    expect(result.rows.every((row) => row.status === "succeeded" && row.external_id)).toBe(true);
  });
});
