import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabase } from "@/db/client.server";
import { paymentConfirmationPollInterval, trackingPollInterval } from "@/lib/order-polling";
import { createPendingOrder } from "../orders.server";
import { claimLocalPrintJob, listLocalPrintJobs } from "../local-print-jobs.server";
import { applyNormalizedPaymentEvent, preparePaymentAttempt } from "../payment-persistence.server";
import { quoteOrder } from "../pricing.server";
import { signTableCode } from "../table-codes.server";
import { transitionOrderStatus } from "../order-transitions.server";
import { recordCounterPayment, updateMerchantOrder } from "../merchant-orders.server";
import { resolveTableEntry } from "../table-entry.server";
import { getPublicOrder } from "../public-orders.server";

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
    expect(workerVisible.some((job) => job.orderId === first.data.id)).toBe(false);
    await client.query("UPDATE integration_jobs SET status = 'succeeded' WHERE id = $1", [
      oldJobId,
    ]);
    expect(await listLocalPrintJobs()).toHaveLength(0);
    expect(await claimLocalPrintJob()).toBeNull();
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
  });
});
