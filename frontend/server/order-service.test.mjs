import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, webcrypto } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { DatabaseSync } from "node:sqlite";
import { createOrderApi } from "./api.mjs";
import { openOrderStore } from "./order-service.mjs";
import { randomUuid } from "../src/lib/random-uuid.ts";
import { clearCheckoutAttempt, getOrCreateCheckoutAttempt } from "../src/lib/checkout-attempt.ts";

test("browser IDs work without crypto.randomUUID on LAN HTTP", () => {
  // Models the Crypto surface exposed by browsers in a non-secure context.
  const insecureContextCrypto = { getRandomValues: (array) => webcrypto.getRandomValues(array) };
  const values = Array.from({ length: 1000 }, () => randomUuid(insecureContextCrypto));
  assert.equal(new Set(values).size, values.length);
  for (const value of values) {
    assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  }
});

test("checkout retry keeps its key across reload and clears it after success", () => {
  const values = new Map();
  const storage = {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => values.set(name, value),
    removeItem: (name) => values.delete(name),
  };
  let created = 0;
  const makeId = () => {
    created++;
    return randomUuid({ getRandomValues: (array) => webcrypto.getRandomValues(array) });
  };
  const first = getOrCreateCheckoutAttempt("same order", storage, makeId);
  const afterReload = getOrCreateCheckoutAttempt("same order", storage, makeId);
  assert.equal(first, afterReload);
  assert.equal(created, 1);
  const changed = getOrCreateCheckoutAttempt("changed order", storage, makeId);
  assert.notEqual(changed, first);
  clearCheckoutAttempt(first, storage); // An old response cannot erase a newer attempt.
  assert.equal(getOrCreateCheckoutAttempt("changed order", storage, makeId), changed);
  clearCheckoutAttempt(changed, storage);
  assert.notEqual(getOrCreateCheckoutAttempt("changed order", storage, makeId), changed);
  assert.equal(created, 3);
});

test("order API persists, reprices, validates and protects orders", async () => {
  const dir = mkdtempSync(join(tmpdir(), "seoul-order-test-"));
  const file = join(dir, "orders.sqlite");
  let store = openOrderStore(file);
  const server = createOrderApi(store);
  const input = {
    customer: {
      name: "Demo Customer",
      phone: "0412345678",
      email: "demo@example.com",
      notes: "No peanuts",
    },
    method: "pickup",
    scheduledFor: null,
    deliveryAddress: "",
    promoCode: "SEOUL10",
    lines: [
      {
        itemId: "spicy-pork",
        name: "Fake cheap dish",
        basePrice: 1,
        quantity: 1,
        notes: "Extra hot",
        modifiers: [{ groupId: "spice", optionId: "medium", priceDelta: -99999 }],
      },
    ],
  };
  const request = (method, url, headers = {}, body = "") =>
    new Promise((resolve) => {
      const req = Readable.from([body]);
      Object.assign(req, { method, url, headers });
      const res = {
        writeHead(status) {
          this.status = status;
        },
        end(value) {
          resolve({ status: this.status, body: JSON.parse(value) });
        },
      };
      server.emit("request", req, res);
    });
  const post = (body, key) =>
    request("POST", "/api/orders", { "idempotency-key": key }, JSON.stringify(body));
  try {
    const key = randomUuid({ getRandomValues: (array) => webcrypto.getRandomValues(array) });
    const first = await post(input, key);
    assert.equal(first.status, 201);
    assert.match(first.body.id, /^[0-9a-f-]{36}$/);
    assert.match(first.body.orderNumber, /^ST-[0-9A-F]{10}$/);
    assert.equal(first.body.status, "pending_payment");
    assert.equal(first.body.paidAt, null);
    assert.equal(first.body.lines[0].name, "Spicy Pork Bulgogi");
    assert.equal(first.body.lines[0].basePrice, 2190);
    assert.equal(first.body.lines[0].modifiers[0].priceDelta, 0);
    assert.equal(first.body.totals.total, 1971);
    assert.equal(first.body.customer.notes, "No peanuts");

    const replay = await post(input, key);
    assert.equal(replay.body.id, first.body.id);
    assert.equal((await post({ ...input, promoCode: null }, key)).status, 409);
    const forbidden = await request("GET", `/api/orders/${first.body.orderNumber}`);
    assert.equal(forbidden.status, 404);
    const found = await request("GET", `/api/orders/${first.body.orderNumber}`, {
      "x-order-token": first.body.accessToken,
    });
    assert.equal(found.status, 200);
    assert.equal(found.body.id, first.body.id);

    assert.equal(
      (
        await post(
          { ...input, lines: [{ itemId: "spicy-pork", quantity: 1, modifiers: [] }] },
          randomUUID(),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await post(
          { ...input, lines: [{ itemId: "unknown", quantity: 1, modifiers: [] }] },
          randomUUID(),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await post(
          { ...input, lines: [{ itemId: "spicy-pork", quantity: 21, modifiers: [] }] },
          randomUUID(),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await post(
          { ...input, customer: { ...input.customer, notes: "a".repeat(301) } },
          randomUUID(),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await post(
          { ...input, method: "delivery", deliveryAddress: "123 Test Street" },
          randomUUID(),
        )
      ).status,
      400,
    );
    assert.equal((await post({ ...input, promoCode: 10 }, randomUUID())).status, 400);
    assert.equal(
      (await post({ ...input, method: "delivery", deliveryAddress: 42 }, randomUUID())).status,
      400,
    );

    store.close();
    store = openOrderStore(file);
    assert.equal(store.get(first.body.orderNumber, first.body.accessToken)?.id, first.body.id);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("demo payment creates exactly two durable, immutable print jobs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "seoul-payment-test-"));
  const file = join(dir, "orders.sqlite");
  let store = openOrderStore(file);
  const server = createOrderApi(store, {
    demoPaymentEnabled: true,
    printWorkerToken: "worker-secret",
  });
  const disabledServer = createOrderApi(store, { demoPaymentEnabled: false });
  const request = (target, method, url, headers = {}, body = undefined) =>
    new Promise((resolve) => {
      const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
      Object.assign(req, { method, url, headers });
      target.emit("request", req, {
        writeHead(status) {
          this.status = status;
        },
        end(value) {
          resolve({ status: this.status, body: JSON.parse(value) });
        },
      });
    });
  const input = {
    customer: {
      name: "Demo Customer",
      phone: "0412345678",
      email: "demo@example.com",
      notes: "No peanuts",
    },
    method: "delivery",
    scheduledFor: "+60",
    deliveryAddress: "123 Test Street, Melbourne",
    promoCode: "SEOUL10",
    lines: [
      {
        itemId: "spicy-pork",
        name: "Fake",
        basePrice: 1,
        quantity: 2,
        notes: "Extra hot",
        modifiers: [{ groupId: "spice", optionId: "medium", priceDelta: -1000 }],
      },
    ],
  };
  const workerJobs = async () =>
    request(server, "GET", "/api/print-jobs", { authorization: "Bearer worker-secret" });
  try {
    const created = await request(
      server,
      "POST",
      "/api/orders",
      { "idempotency-key": randomUUID() },
      input,
    );
    assert.equal(created.status, 201);
    const number = created.body.orderNumber;
    const token = created.body.accessToken;
    const paymentPath = `/api/orders/${number}/demo-payment`;
    const pay = (result, headers = { "x-order-token": token }, target = server) =>
      request(target, "POST", paymentPath, headers, { result });
    assert.equal((await workerJobs()).body.jobs.length, 0);
    assert.equal((await pay("success", { "x-order-token": token }, disabledServer)).status, 503);
    assert.equal((await pay("success", { "x-order-token": "wrong" })).status, 404);
    assert.equal((await pay("unknown")).status, 400);
    assert.equal(
      (
        await request(
          server,
          "POST",
          paymentPath,
          { "x-order-token": token },
          { result: "success", total: 1 },
        )
      ).status,
      400,
    );
    assert.equal((await workerJobs()).body.jobs.length, 0);

    const failed = await pay("failure");
    assert.equal(failed.status, 200);
    assert.equal(failed.body.status, "payment_failed");
    assert.equal(failed.body.paidAt, null);
    assert.equal((await workerJobs()).body.jobs.length, 0);

    const concurrent = await Promise.all([pay("success"), pay("success"), pay("success")]);
    assert.ok(
      concurrent.every((response) => response.status === 200 && response.body.status === "paid"),
    );
    const paidAt = concurrent[0].body.paidAt;
    assert.ok(paidAt);
    assert.ok(concurrent.every((response) => response.body.paidAt === paidAt));
    const jobsResponse = await workerJobs();
    assert.equal(jobsResponse.status, 200);
    const jobs = jobsResponse.body.jobs;
    assert.equal(jobs.length, 2);
    assert.deepEqual(jobs.map((job) => job.destination).sort(), ["front", "kitchen"]);
    assert.ok(jobs.every((job) => job.status === "pending" && job.orderId === created.body.id));
    const kitchen = jobs.find((job) => job.destination === "kitchen").payload;
    const front = jobs.find((job) => job.destination === "front").payload;
    assert.equal(kitchen.schemaVersion, 1);
    assert.equal(kitchen.orderNumber, number);
    assert.equal(kitchen.orderId, created.body.id);
    assert.equal(kitchen.placedAt, created.body.placedAt);
    assert.equal(kitchen.paidAt, paidAt);
    assert.equal(kitchen.estimatedFor, new Date(Date.parse(paidAt) + 60 * 60_000).toISOString());
    assert.equal(kitchen.method, "delivery");
    assert.equal(kitchen.deliveryAddress, "123 Test Street, Melbourne");
    assert.equal(kitchen.orderNotes, "No peanuts");
    assert.equal(kitchen.items[0].quantity, 2);
    assert.equal(kitchen.items[0].name, "Spicy Pork Bulgogi");
    assert.equal(kitchen.items[0].koreanName, "제육볶음");
    assert.equal(kitchen.items[0].options[0].name, "Medium");
    assert.equal(kitchen.items[0].notes, "Extra hot");
    assert.equal(kitchen.customer, undefined);
    assert.equal(front.paymentLabel, "DEMO PAID");
    assert.equal(front.customer.name, "Demo Customer");
    assert.equal(front.customer.phone, "0412345678");
    assert.equal(front.customer.deliveryAddress, "123 Test Street, Melbourne");
    assert.equal(front.deliveryAddress, "123 Test Street, Melbourne");
    assert.equal(front.items[0].lineTotalCents, 4380);
    assert.equal(front.totals.totalCents, 4632);
    assert.equal(front.totals.currency, "AUD");

    assert.equal((await request(server, "GET", "/api/print-jobs")).status, 401);
    assert.equal(
      (await request(server, "GET", "/api/print-jobs", { authorization: "Bearer wrong" })).status,
      401,
    );
    assert.equal((await request(disabledServer, "GET", "/api/print-jobs")).status, 503);
    const lateFailure = await pay("failure");
    assert.equal(lateFailure.body.status, "paid");
    assert.equal(lateFailure.body.paidAt, paidAt);
    assert.equal((await workerJobs()).body.jobs.length, 2);

    store.close();
    store = openOrderStore(file);
    assert.equal(store.get(number, token).status, "paid");
    assert.equal(store.listPrintJobs().length, 2);
    const replay = store.simulatePayment(number, token, "success");
    assert.equal(replay.paidAt, paidAt);
    assert.deepEqual(
      store.listPrintJobs().map((job) => job.id),
      jobs.map((job) => job.id),
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("older stage-1 database is migrated without losing orders", () => {
  const dir = mkdtempSync(join(tmpdir(), "seoul-migrate-test-"));
  const file = join(dir, "orders.sqlite");
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE orders (
    id TEXT PRIMARY KEY, order_number TEXT NOT NULL UNIQUE, access_token TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status = 'pending_payment'), placed_at TEXT NOT NULL,
    data_json TEXT NOT NULL
  );`);
  const id = randomUUID();
  const number = "ST-1234567890";
  const token = "old-access-token";
  const snapshot = {
    method: "pickup",
    scheduledFor: null,
    deliveryAddress: "",
    customer: {
      name: "Old Customer",
      phone: "0412345678",
      email: "old@example.com",
      notes: "Old note",
    },
    lines: [
      {
        itemId: "rice",
        name: "Steamed Rice",
        koreanName: null,
        basePrice: 350,
        quantity: 1,
        notes: "",
        modifiers: [],
      },
    ],
    totals: { subtotal: 350, deliveryFee: 0, discount: 0, total: 350, itemCount: 1 },
  };
  old
    .prepare("INSERT INTO orders VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(
      id,
      number,
      token,
      randomUUID(),
      "hash",
      "pending_payment",
      new Date().toISOString(),
      JSON.stringify(snapshot),
    );
  old.close();
  const store = openOrderStore(file);
  try {
    assert.equal(store.get(number, token).status, "pending_payment");
    assert.equal(store.get(number, token).paidAt, null);
    assert.equal(store.simulatePayment(number, token, "success").status, "paid");
    assert.equal(store.listPrintJobs().length, 2);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("stage-1 database without a status check gains paid_at", () => {
  const dir = mkdtempSync(join(tmpdir(), "seoul-add-column-test-"));
  const file = join(dir, "orders.sqlite");
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE orders (
    id TEXT PRIMARY KEY, order_number TEXT NOT NULL UNIQUE, access_token TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL,
    status TEXT NOT NULL, placed_at TEXT NOT NULL, data_json TEXT NOT NULL
  );`);
  old.close();
  const store = openOrderStore(file);
  try {
    const order = store.create(
      {
        customer: { name: "Demo Customer", phone: "0412345678", email: "demo@example.com" },
        method: "pickup",
        scheduledFor: null,
        deliveryAddress: "",
        promoCode: null,
        lines: [{ itemId: "rice", quantity: 1, modifiers: [] }],
      },
      randomUUID(),
    );
    assert.equal(order.status, "pending_payment");
    assert.equal(store.get(order.orderNumber, order.accessToken).paidAt, null);
    assert.equal(
      store.simulatePayment(order.orderNumber, order.accessToken, "success").status,
      "paid",
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
