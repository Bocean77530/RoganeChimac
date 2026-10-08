import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createOrderApi } from "./api.mjs";
import { openOrderStore } from "./order-service.mjs";

const request = (server, method, url, headers = {}, body) => new Promise((resolveResponse) => {
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  Object.assign(req, { method, url, headers });
  server.emit("request", req, {
    writeHead(status) { this.status = status; },
    end(value) { resolveResponse({ status: this.status, body: JSON.parse(value) }); },
  });
});

test("merchant advances paid order and customer sees latest status on next lookup", async () => {
  const directory = mkdtempSync(join(tmpdir(), "seoul-merchant-test-"));
  const store = openOrderStore(join(directory, "orders.sqlite"));
  const server = createOrderApi(store, { demoPaymentEnabled: true, merchantToken: "merchant-secret" });
  const merchant = { authorization: "Bearer merchant-secret" };
  try {
    const created = await request(server, "POST", "/api/orders", { "idempotency-key": randomUUID() }, {
      customer: { name: "Demo Customer", phone: "0412345678", email: "demo@example.com", notes: "No peanuts" },
      method: "delivery", deliveryAddress: "123 Test Street, Melbourne", scheduledFor: null,
      lines: [{ itemId: "spicy-pork", quantity: 2, notes: "Extra hot", modifiers: [{ groupId: "spice", optionId: "medium" }] }],
    });
    const number = created.body.orderNumber;
    const token = created.body.accessToken;
    const list = () => request(server, "GET", "/api/merchant/orders", merchant);
    const update = (status) => request(server, "POST", `/api/merchant/orders/${number}/progress`, merchant, { status });
    const customer = () => request(server, "GET", `/api/orders/${number}`, { "x-order-token": token });
    assert.equal(created.body.fulfillmentStatus, null);
    assert.equal((await list()).body.orders.length, 0);
    assert.equal((await update("preparing")).status, 404);
    assert.equal((await request(server, "GET", "/api/merchant/orders")).status, 401);
    assert.equal((await request(server, "GET", "/api/merchant/orders", { authorization: "Bearer wrong" })).status, 401);
    const paid = await request(server, "POST", `/api/orders/${number}/demo-payment`, { "x-order-token": token }, { result: "success" });
    assert.equal(paid.body.fulfillmentStatus, "received");
    assert.equal((await list()).body.orders.length, 1);
    assert.equal((await list()).body.orders[0].accessToken, undefined);
    assert.equal((await update("out_for_delivery")).status, 409);
    for (const status of ["preparing", "preparing_delivery", "out_for_delivery", "completed"]) {
      assert.equal((await update(status)).status, 200);
      assert.equal((await customer()).body.fulfillmentStatus, status);
    }
    assert.equal((await update("preparing")).status, 409);
    assert.ok((await customer()).body.fulfillmentUpdatedAt);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("pickup has its own ready state and rejects delivery-only progress", () => {
  const directory = mkdtempSync(join(tmpdir(), "seoul-pickup-progress-"));
  const store = openOrderStore(join(directory, "orders.sqlite"));
  try {
    const order = store.create({
      customer: { name: "Demo Customer", phone: "0412345678", email: "demo@example.com" },
      method: "pickup", deliveryAddress: "", scheduledFor: null,
      lines: [{ itemId: "spicy-pork", quantity: 1, modifiers: [{ groupId: "spice", optionId: "medium" }] }],
    }, randomUUID());
    store.simulatePayment(order.orderNumber, order.accessToken, "success");
    assert.equal(store.updateFulfillment(order.orderNumber, "preparing").fulfillmentStatus, "preparing");
    assert.throws(() => store.updateFulfillment(order.orderNumber, "preparing_delivery"), { status: 409 });
    assert.equal(store.updateFulfillment(order.orderNumber, "ready_for_pickup").fulfillmentStatus, "ready_for_pickup");
    assert.equal(store.updateFulfillment(order.orderNumber, "completed").fulfillmentStatus, "completed");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
