import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { catalog } from "../src/lib/menu-catalog.ts";
import { restaurant } from "../src/lib/restaurant.ts";

const menu = new Map(catalog.map((item) => [item.id, item]));
const problem = (message, status = 400) => Object.assign(new Error(message), { status });
const isText = (value, min, max) =>
  typeof value === "string" && value.trim().length >= min && value.trim().length <= max;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const progressSteps = {
  pickup: ["received", "preparing", "ready_for_pickup", "completed"],
  delivery: ["received", "preparing", "preparing_delivery", "out_for_delivery", "completed"],
};

function buildPrintPayloads(row, paidAt) {
  const order = JSON.parse(row.data_json);
  const minutes = order.scheduledFor
    ? Number(order.scheduledFor.slice(1))
    : order.method === "pickup"
      ? restaurant.ordering.pickupPrepMinutes
      : restaurant.ordering.deliveryEtaMinutes;
  const estimatedFor = new Date(Date.parse(paidAt) + minutes * 60_000).toISOString();
  const items = order.lines.map((line) => ({
    itemId: line.itemId,
    quantity: line.quantity,
    name: line.name,
    koreanName: line.koreanName ?? null,
    options: line.modifiers.map((option) => ({
      groupName: option.groupName,
      name: option.name,
    })),
    notes: line.notes,
  }));
  const common = {
    schemaVersion: 1,
    orderId: row.id,
    orderNumber: row.order_number,
    placedAt: row.placed_at,
    paidAt,
    estimatedFor,
    method: order.method,
    deliveryAddress: order.deliveryAddress,
    scheduledFor: order.scheduledFor,
    orderNotes: order.customer.notes,
  };
  return {
    kitchen: { ...common, destination: "kitchen", items },
    front: {
      ...common,
      destination: "front",
      paymentLabel: "DEMO PAID",
      customer: {
        name: order.customer.name,
        phone: order.customer.phone,
        deliveryAddress: order.deliveryAddress,
      },
      items: items.map((item, index) => {
        const line = order.lines[index];
        const unitPriceCents =
          line.basePrice + line.modifiers.reduce((sum, option) => sum + option.priceDelta, 0);
        return { ...item, unitPriceCents, lineTotalCents: unitPriceCents * line.quantity };
      }),
      totals: {
        currency: "AUD",
        subtotalCents: order.totals.subtotal,
        deliveryFeeCents: order.totals.deliveryFee,
        discountCents: order.totals.discount,
        totalCents: order.totals.total,
      },
    },
  };
}

export function validateOrder(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw problem("Invalid order");
  const { customer, lines } = input;
  if (!customer || typeof customer !== "object") throw problem("Customer details are required");
  if (!isText(customer.name, 2, 80)) throw problem("Name must be 2–80 characters");
  if (!isText(customer.phone, 8, 20)) throw problem("Phone must be 8–20 characters");
  if (!isText(customer.email, 3, 120) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim()))
    throw problem("Valid email is required");
  if (customer.notes != null && !isText(customer.notes, 0, 300))
    throw problem("Order notes are too long");
  if (input.method !== "pickup" && input.method !== "delivery")
    throw problem("Invalid order method");
  if (input.scheduledFor != null && !["+30", "+60", "+90", "+120"].includes(input.scheduledFor))
    throw problem("Invalid scheduled time");
  const deliveryAddress =
    input.method === "delivery" && typeof input.deliveryAddress === "string"
      ? input.deliveryAddress.trim()
      : "";
  if (input.method === "delivery" && !isText(deliveryAddress, 5, 200))
    throw problem("Delivery address must be 5–200 characters");
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > 50)
    throw problem("Order must contain 1–50 lines");

  let subtotal = 0;
  let itemCount = 0;
  const normalizedLines = lines.map((line) => {
    if (!line || typeof line !== "object") throw problem("Invalid order line");
    const item = menu.get(line.itemId);
    if (!item || item.soldOut) throw problem("A selected dish is unavailable");
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 20)
      throw problem("Quantity must be 1–20");
    if (line.notes != null && !isText(line.notes, 0, 300)) throw problem("Dish notes are too long");
    if (!Array.isArray(line.modifiers)) throw problem("Invalid dish options");
    const selections = new Map();
    const modifiers = line.modifiers.map((selected) => {
      const group = item.modifiers?.find((entry) => entry.id === selected?.groupId);
      const option = group?.options.find((entry) => entry.id === selected?.optionId);
      if (!group || !option) throw problem(`Invalid option for ${item.name}`);
      const seen = selections.get(group.id) ?? new Set();
      if (seen.has(option.id)) throw problem(`Duplicate option for ${item.name}`);
      seen.add(option.id);
      selections.set(group.id, seen);
      return {
        groupId: group.id,
        groupName: group.name,
        optionId: option.id,
        name: option.name,
        priceDelta: option.priceDelta ?? 0,
      };
    });
    for (const group of item.modifiers ?? []) {
      const count = selections.get(group.id)?.size ?? 0;
      const min = group.min ?? (group.required ? 1 : 0);
      const max = group.max ?? (group.required ? 1 : group.options.length);
      if (count < min || count > max)
        throw problem(`Please select valid ${group.name} for ${item.name}`);
    }
    const unitPrice = item.price + modifiers.reduce((sum, option) => sum + option.priceDelta, 0);
    subtotal += unitPrice * line.quantity;
    itemCount += line.quantity;
    return {
      lineId: randomUUID(),
      itemId: item.id,
      name: item.name,
      koreanName: item.koreanName,
      basePrice: item.price,
      quantity: line.quantity,
      notes: line.notes?.trim() ?? "",
      modifiers,
    };
  });
  if (itemCount > 100) throw problem("Order cannot exceed 100 items");
  if (input.method === "delivery" && subtotal < restaurant.ordering.deliveryMinimum)
    throw problem("Order is below the delivery minimum");
  if (input.promoCode != null && typeof input.promoCode !== "string") {
    throw problem("Invalid promo code");
  }
  const promoCode = input.promoCode?.trim().toUpperCase() || null;
  if (promoCode && (promoCode !== "SEOUL10" || subtotal < 2000))
    throw problem("Invalid or ineligible promo code");
  const discount = promoCode ? Math.round(subtotal * 0.1) : 0;
  const deliveryFee = input.method === "delivery" ? restaurant.ordering.deliveryFee : 0;
  return {
    method: input.method,
    scheduledFor: input.scheduledFor ?? null,
    deliveryAddress,
    promoCode,
    customer: {
      name: customer.name.trim(),
      phone: customer.phone.trim(),
      email: customer.email.trim(),
      notes: customer.notes?.trim() ?? "",
    },
    lines: normalizedLines,
    totals: {
      subtotal,
      deliveryFee,
      discount,
      total: subtotal - discount + deliveryFee,
      itemCount,
    },
  };
}

export function openOrderStore(
  file = process.env.ORDER_DB_PATH || resolve("data/orders.sqlite"),
  options = {},
) {
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  const now = options.now ?? Date.now;
  const leaseMs = options.leaseMs ?? 120_000;
  const nowIso = () => new Date(now()).toISOString();
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  const ordersSql = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'orders'")
    .get()?.sql;
  const createOrdersSql = `CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number TEXT NOT NULL UNIQUE,
      access_token TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      request_hash TEXT NOT NULL,
      status TEXT NOT NULL,
      placed_at TEXT NOT NULL,
      data_json TEXT NOT NULL,
      paid_at TEXT,
      fulfillment_status TEXT,
      fulfillment_updated_at TEXT
    );`;
  if (ordersSql && /CHECK\s*\(\s*status\s*=\s*'pending_payment'\s*\)/i.test(ordersSql)) {
    // Early stage-1 databases constrained status to pending_payment.
    db.exec("BEGIN IMMEDIATE");
    try {
      const hadPaidAt = db
        .prepare("PRAGMA table_info(orders)")
        .all()
        .some((column) => column.name === "paid_at");
      db.exec(createOrdersSql.replace("orders (", "orders_new ("));
      db.exec(`INSERT INTO orders_new (id, order_number, access_token, idempotency_key, request_hash, status, placed_at, data_json, paid_at)
        SELECT id, order_number, access_token, idempotency_key, request_hash, status, placed_at, data_json, ${hadPaidAt ? "paid_at" : "NULL"} FROM orders;
        DROP TABLE orders;
        ALTER TABLE orders_new RENAME TO orders;
        COMMIT;`);
    } catch (error) {
      db.exec("ROLLBACK");
      db.close();
      throw error;
    }
  } else {
    db.exec(createOrdersSql);
    const hasPaidAt = db
      .prepare("PRAGMA table_info(orders)")
      .all()
      .some((column) => column.name === "paid_at");
    if (!hasPaidAt) db.exec("ALTER TABLE orders ADD COLUMN paid_at TEXT");
  }
  const orderColumns = new Set(db.prepare("PRAGMA table_info(orders)").all().map((column) => column.name));
  if (!orderColumns.has("fulfillment_status"))
    db.exec("ALTER TABLE orders ADD COLUMN fulfillment_status TEXT");
  if (!orderColumns.has("fulfillment_updated_at"))
    db.exec("ALTER TABLE orders ADD COLUMN fulfillment_updated_at TEXT");
  db.exec(`UPDATE orders SET fulfillment_status = 'received',
    fulfillment_updated_at = COALESCE(paid_at, placed_at)
    WHERE status = 'paid' AND fulfillment_status IS NULL`);
  db.exec(`CREATE TABLE IF NOT EXISTS print_jobs (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id),
      destination TEXT NOT NULL CHECK (destination IN ('kitchen', 'front')),
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      lease_token TEXT,
      lease_until TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      queue_name TEXT,
      spooler_job_id TEXT,
      queued_at TEXT,
      last_error TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_retry_reason TEXT,
      UNIQUE(order_id, destination)
    );`);
  const jobColumns = new Set(
    db
      .prepare("PRAGMA table_info(print_jobs)")
      .all()
      .map((column) => column.name),
  );
  const additions = {
    lease_token: "TEXT",
    lease_until: "TEXT",
    attempt_count: "INTEGER NOT NULL DEFAULT 0",
    updated_at: "TEXT",
    queue_name: "TEXT",
    spooler_job_id: "TEXT",
    queued_at: "TEXT",
    last_error: "TEXT",
    retry_count: "INTEGER NOT NULL DEFAULT 0",
    last_retry_reason: "TEXT",
  };
  for (const [column, type] of Object.entries(additions)) {
    if (!jobColumns.has(column)) db.exec(`ALTER TABLE print_jobs ADD COLUMN ${column} ${type}`);
  }
  db.exec(`UPDATE print_jobs SET updated_at = created_at WHERE updated_at IS NULL;
    CREATE INDEX IF NOT EXISTS print_jobs_status_created_idx ON print_jobs(status, created_at);`);
  db.exec(`CREATE TABLE IF NOT EXISTS print_job_retries (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES print_jobs(id),
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL
  );`);
  const insert = db.prepare(`INSERT INTO orders
    (id, order_number, access_token, idempotency_key, request_hash, status, placed_at, data_json, paid_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`);
  const byKey = db.prepare("SELECT * FROM orders WHERE idempotency_key = ?");
  const byNumber = db.prepare("SELECT * FROM orders WHERE order_number = ?");
  const updatePaid = db.prepare(`UPDATE orders SET status = 'paid', paid_at = ?,
    fulfillment_status = 'received', fulfillment_updated_at = ? WHERE id = ?`);
  const updateFailed = db.prepare(
    "UPDATE orders SET status = 'payment_failed', paid_at = NULL WHERE id = ?",
  );
  const insertJob = db.prepare(`INSERT INTO print_jobs
    (id, order_id, destination, status, created_at, payload_json, updated_at)
    VALUES (?, ?, ?, 'pending', ?, ?, ?)`);
  const jobs = db.prepare("SELECT * FROM print_jobs ORDER BY created_at, destination");
  const jobById = db.prepare("SELECT * FROM print_jobs WHERE id = ?");
  const nextJob = db.prepare(
    "SELECT * FROM print_jobs WHERE status = 'pending' ORDER BY created_at, destination LIMIT 1",
  );
  const claimJob =
    db.prepare(`UPDATE print_jobs SET status = 'leased', lease_token = ?, lease_until = ?,
    attempt_count = attempt_count + 1, updated_at = ? WHERE id = ? AND status = 'pending'`);
  const queuedJob = db.prepare(`UPDATE print_jobs SET status = 'queued_to_os', queue_name = ?,
    spooler_job_id = ?, queued_at = ?, updated_at = ?, last_error = NULL WHERE id = ?`);
  const failedJob = db.prepare(`UPDATE print_jobs SET status = 'failed', queue_name = ?,
    last_error = ?, updated_at = ? WHERE id = ?`);
  const retryJob = db.prepare(`UPDATE print_jobs SET status = 'pending', lease_token = NULL,
    lease_until = NULL, retry_count = retry_count + 1, last_retry_reason = ?, updated_at = ?
    WHERE id = ?`);
  const recordRetry = db.prepare(
    "INSERT INTO print_job_retries (id, job_id, reason, created_at) VALUES (?, ?, ?, ?)",
  );
  const retriesByJob = db.prepare(
    "SELECT reason, created_at FROM print_job_retries WHERE job_id = ? ORDER BY created_at",
  );
  const expireLeases = () => {
    const at = nowIso();
    db.prepare(
      `UPDATE print_jobs SET status = 'uncertain', lease_token = NULL, lease_until = NULL,
      last_error = 'Lease expired before delivery was confirmed', updated_at = ?
      WHERE status = 'leased' AND lease_until <= ?`,
    ).run(at, at);
  };
  const publicJob = (row) => ({
    id: row.id,
    orderId: row.order_id,
    destination: row.destination,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    leaseUntil: row.lease_until,
    attemptCount: row.attempt_count,
    retryCount: row.retry_count,
    lastRetryReason: row.last_retry_reason,
    queueName: row.queue_name,
    spoolerJobId: row.spooler_job_id,
    queuedAt: row.queued_at,
    lastError: row.last_error,
    payload: JSON.parse(row.payload_json),
  });
  const publicOrder = (row) => ({
    ...JSON.parse(row.data_json),
    id: row.id,
    orderNumber: row.order_number,
    accessToken: row.access_token,
    status: row.status,
    placedAt: row.placed_at,
    paidAt: row.paid_at,
    fulfillmentStatus: row.fulfillment_status,
    fulfillmentUpdatedAt: row.fulfillment_updated_at,
  });
  return {
    create(input, key) {
      if (
        typeof key !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)
      )
        throw problem("Valid Idempotency-Key header is required");
      // Use client input for replay detection; random line IDs are excluded.
      const requestHash = hash(JSON.stringify(input));
      const existing = byKey.get(key);
      if (existing) {
        if (existing.request_hash !== requestHash)
          throw problem("Idempotency key was reused for a different order", 409);
        return publicOrder(existing);
      }
      const normalized = validateOrder(input);
      for (let attempt = 0; attempt < 5; attempt++) {
        const id = randomUUID();
        const number = `ST-${randomBytes(5).toString("hex").toUpperCase()}`;
        const token = randomBytes(24).toString("hex");
        const placedAt = new Date().toISOString();
        try {
          insert.run(
            id,
            number,
            token,
            key,
            requestHash,
            "pending_payment",
            placedAt,
            JSON.stringify(normalized),
          );
          return {
            ...normalized,
            id,
            orderNumber: number,
            accessToken: token,
            status: "pending_payment",
            placedAt,
            paidAt: null,
            fulfillmentStatus: null,
            fulfillmentUpdatedAt: null,
          };
        } catch (error) {
          if (error.code !== "ERR_SQLITE_ERROR" || !String(error.message).includes("UNIQUE"))
            throw error;
          const replay = byKey.get(key);
          if (replay) {
            if (replay.request_hash !== requestHash)
              throw problem("Idempotency key was reused for a different order", 409);
            return publicOrder(replay);
          }
        }
      }
      throw problem("Could not create a unique order", 500);
    },
    get(number, token) {
      if (
        typeof number !== "string" ||
        !/^ST-[0-9A-F]{10}$/.test(number) ||
        typeof token !== "string"
      )
        return null;
      const row = byNumber.get(number);
      return row?.access_token === token ? publicOrder(row) : null;
    },
    simulatePayment(number, token, result) {
      if (result !== "success" && result !== "failure") throw problem("Invalid simulation result");
      db.exec("BEGIN IMMEDIATE");
      try {
        const row = byNumber.get(number);
        if (!row || row.access_token !== token) throw problem("Order not found", 404);
        if (row.status === "paid") {
          db.exec("COMMIT");
          return publicOrder(row);
        }
        if (result === "failure") {
          updateFailed.run(row.id);
        } else {
          const paidAt = new Date().toISOString();
          const payloads = buildPrintPayloads(row, paidAt);
          updatePaid.run(paidAt, paidAt, row.id);
          for (const destination of ["kitchen", "front"]) {
            insertJob.run(
              randomUUID(),
              row.id,
              destination,
              paidAt,
              JSON.stringify(payloads[destination]),
              paidAt,
            );
          }
        }
        const updated = publicOrder(byNumber.get(number));
        db.exec("COMMIT");
        return updated;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    listMerchantOrders() {
      return db.prepare("SELECT * FROM orders WHERE status = 'paid' ORDER BY paid_at DESC").all()
        .map((row) => {
          const { accessToken, ...order } = publicOrder(row);
          return order;
        });
    },
    updateFulfillment(number, nextStatus) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const row = byNumber.get(number);
        if (!row || row.status !== "paid") throw problem("Paid order not found", 404);
        const method = JSON.parse(row.data_json).method;
        const steps = progressSteps[method];
        const current = steps.indexOf(row.fulfillment_status);
        if (typeof nextStatus !== "string" || steps[current + 1] !== nextStatus)
          throw problem("Select the next valid order status", 409);
        const updatedAt = nowIso();
        db.prepare(`UPDATE orders SET fulfillment_status = ?, fulfillment_updated_at = ?
          WHERE id = ?`).run(nextStatus, updatedAt, row.id);
        const { accessToken, ...order } = publicOrder(byNumber.get(number));
        db.exec("COMMIT");
        return order;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    listPrintJobs() {
      return jobs.all().map(publicJob);
    },
    claimPrintJob() {
      db.exec("BEGIN IMMEDIATE");
      try {
        expireLeases();
        const row = nextJob.get();
        if (!row) {
          db.exec("COMMIT");
          return null;
        }
        const leaseToken = randomBytes(24).toString("hex");
        const leaseUntil = new Date(now() + leaseMs).toISOString();
        claimJob.run(leaseToken, leaseUntil, nowIso(), row.id);
        const claimed = publicJob(jobById.get(row.id));
        db.exec("COMMIT");
        return { ...claimed, leaseToken };
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    reportPrintJob(id, input) {
      if (!input || typeof input !== "object" || !["queued", "failed"].includes(input.result))
        throw problem("Invalid print result");
      if (!isText(input.leaseToken, 1, 200)) throw problem("Lease token is required");
      if (!isText(input.queueName, 1, 200)) throw problem("Queue name is required");
      if (input.result === "queued" && !isText(input.spoolerJobId, 1, 200))
        throw problem("Spooler job ID is required");
      if (input.result === "failed" && !isText(input.error, 1, 500))
        throw problem("Failure reason is required");
      const queueName = input.queueName.trim();
      const spoolerJobId = input.result === "queued" ? input.spoolerJobId.trim() : null;
      const failure = input.result === "failed" ? input.error.trim() : null;
      expireLeases();
      db.exec("BEGIN IMMEDIATE");
      try {
        const row = jobById.get(id);
        if (!row) throw problem("Print job not found", 404);
        if (row.lease_token !== input.leaseToken || row.lease_token === null)
          throw problem("Invalid or expired lease token", 409);
        if (row.status === "queued_to_os" || row.status === "failed") {
          const sameReport =
            row.queue_name === queueName &&
            (row.status === "queued_to_os"
              ? input.result === "queued" && row.spooler_job_id === spoolerJobId
              : input.result === "failed" && row.last_error === failure);
          if (!sameReport) throw problem("Conflicting print report", 409);
          db.exec("COMMIT");
          return publicJob(row);
        }
        if (row.status !== "leased" || row.lease_until <= nowIso())
          throw problem("Lease is no longer active", 409);
        const at = nowIso();
        if (input.result === "queued") queuedJob.run(queueName, spoolerJobId, at, at, id);
        else failedJob.run(queueName, failure, at, id);
        const updated = publicJob(jobById.get(id));
        db.exec("COMMIT");
        return updated;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    retryPrintJob(id, reason) {
      if (!isText(reason, 5, 300)) throw problem("Retry reason must be 5–300 characters");
      expireLeases();
      db.exec("BEGIN IMMEDIATE");
      try {
        const row = jobById.get(id);
        if (!row) throw problem("Print job not found", 404);
        if (row.status !== "failed" && row.status !== "uncertain")
          throw problem("Only failed or uncertain jobs may be retried", 409);
        const at = nowIso();
        retryJob.run(reason.trim(), at, id);
        recordRetry.run(randomUUID(), id, reason.trim(), at);
        const updated = publicJob(jobById.get(id));
        db.exec("COMMIT");
        return updated;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    listPrintJobRetries(id) {
      return retriesByJob.all(id);
    },
    close() {
      db.close();
    },
  };
}
