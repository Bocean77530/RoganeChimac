import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { DatabaseSync } from "node:sqlite";
import { openOrderStore } from "./order-service.mjs";
import { createOrderApi } from "./api.mjs";

function makePaidOrder(store) {
  const order = store.create(
    {
      customer: {
        name: "Test Customer",
        phone: "0412345678",
        email: "test@example.com",
        notes: "No peanuts",
      },
      method: "delivery",
      scheduledFor: "+30",
      deliveryAddress: "123 Test Street, Melbourne",
      promoCode: null,
      lines: [
        {
          itemId: "spicy-pork",
          quantity: 2,
          notes: "Well done",
          modifiers: [{ groupId: "spice", optionId: "mild" }],
        },
      ],
    },
    randomUUID(),
  );
  store.simulatePayment(order.orderNumber, order.accessToken, "success");
  return order;
}

test("leases are exclusive, expiry is uncertain, ACK is idempotent and retries are audited", async () => {
  const dir = mkdtempSync(join(tmpdir(), "seoul-lease-test-"));
  const file = join(dir, "orders.sqlite");
  let clock = Date.parse("2026-10-07T12:00:00.000Z");
  const options = { now: () => clock, leaseMs: 1000 };
  const firstStore = openOrderStore(file, options);
  const secondStore = openOrderStore(file, options);
  try {
    makePaidOrder(firstStore);
    const [first, second] = await Promise.all([
      Promise.resolve().then(() => firstStore.claimPrintJob()),
      Promise.resolve().then(() => secondStore.claimPrintJob()),
    ]);
    assert.ok(first && second);
    assert.notEqual(first.id, second.id);
    assert.equal(firstStore.claimPrintJob(), null);
    assert.equal(first.attemptCount, 1);
    assert.equal(second.attemptCount, 1);
    assert.throws(
      () =>
        firstStore.reportPrintJob(first.id, {
          leaseToken: "bad",
          result: "queued",
          queueName: "Brother",
          spoolerJobId: "Brother-1",
        }),
      { status: 409 },
    );

    clock += 1001;
    assert.throws(
      () =>
        firstStore.reportPrintJob(first.id, {
          leaseToken: first.leaseToken,
          result: "queued",
          queueName: "Brother",
          spoolerJobId: "Brother-1",
        }),
      { status: 409 },
    );
    assert.ok(firstStore.listPrintJobs().every((job) => job.status === "uncertain"));
    assert.equal(firstStore.claimPrintJob(), null); // Unknown delivery is never auto-claimed.
    assert.throws(() => firstStore.retryPrintJob(first.id, "no"), { status: 400 });
    assert.equal(
      firstStore.retryPrintJob(first.id, "Checked OS queue; no matching ticket").retryCount,
      1,
    );
    const reLeased = secondStore.claimPrintJob();
    assert.equal(reLeased.id, first.id);
    assert.equal(reLeased.attemptCount, 2);
    assert.notEqual(reLeased.leaseToken, first.leaseToken);
    const queuedReport = {
      leaseToken: reLeased.leaseToken,
      result: "queued",
      queueName: "Brother",
      spoolerJobId: "Brother-42",
    };
    const queued = firstStore.reportPrintJob(reLeased.id, queuedReport);
    assert.equal(queued.status, "queued_to_os");
    assert.equal(queued.spoolerJobId, "Brother-42");
    clock += 2000;
    assert.equal(firstStore.reportPrintJob(reLeased.id, queuedReport).queuedAt, queued.queuedAt);
    assert.throws(
      () => firstStore.reportPrintJob(reLeased.id, { ...queuedReport, spoolerJobId: "Brother-43" }),
      { status: 409 },
    );
    assert.throws(() => firstStore.retryPrintJob(reLeased.id, "Please print again"), {
      status: 409,
    });

    assert.equal(
      firstStore.retryPrintJob(second.id, "Verified no OS queue entry").status,
      "pending",
    );
    const failureLease = secondStore.claimPrintJob();
    assert.equal(failureLease.id, second.id);
    const failedReport = {
      leaseToken: failureLease.leaseToken,
      result: "failed",
      queueName: "Missing_Printer",
      error: "lp rejected the ticket (exit 1)",
    };
    assert.equal(firstStore.reportPrintJob(second.id, failedReport).status, "failed");
    assert.equal(firstStore.reportPrintJob(second.id, failedReport).status, "failed");
    assert.equal(
      firstStore.listPrintJobs().find((job) => job.id === reLeased.id).status,
      "queued_to_os",
    );
    assert.equal(firstStore.claimPrintJob(), null);
    assert.equal(firstStore.retryPrintJob(second.id, "Corrected front queue name").retryCount, 2);
    const finalLease = secondStore.claimPrintJob();
    assert.equal(finalLease.id, second.id);
    assert.equal(finalLease.attemptCount, 3);
    assert.equal(
      firstStore.reportPrintJob(second.id, {
        leaseToken: finalLease.leaseToken,
        result: "queued",
        queueName: "Brother",
        spoolerJobId: "Brother-44",
      }).status,
      "queued_to_os",
    );
    assert.equal(firstStore.listPrintJobRetries(second.id).length, 2);
    assert.equal(firstStore.listPrintJobRetries(second.id)[1].reason, "Corrected front queue name");
  } finally {
    firstStore.close();
    secondStore.close();
  }
  const reopened = openOrderStore(file, options);
  try {
    assert.equal(reopened.listPrintJobs().length, 2);
    assert.ok(reopened.listPrintJobs().every((job) => job.status === "queued_to_os"));
    assert.deepEqual(
      reopened
        .listPrintJobs()
        .map((job) => job.attemptCount)
        .sort(),
      [2, 3],
    );
  } finally {
    reopened.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("worker claim, report and retry endpoints require the independent bearer token", async () => {
  const dir = mkdtempSync(join(tmpdir(), "seoul-worker-api-test-"));
  const store = openOrderStore(join(dir, "orders.sqlite"));
  const server = createOrderApi(store, {
    demoPaymentEnabled: true,
    printWorkerToken: "worker-secret",
  });
  const request = (method, path, token, body) =>
    new Promise((resolve) => {
      const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
      Object.assign(req, {
        method,
        url: path,
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      server.emit("request", req, {
        writeHead(status) {
          this.status = status;
        },
        end(value) {
          resolve({ status: this.status, body: JSON.parse(value) });
        },
      });
    });
  try {
    makePaidOrder(store);
    assert.equal((await request("POST", "/api/print-jobs/claim")).status, 401);
    assert.equal((await request("POST", "/api/print-jobs/claim", "wrong")).status, 401);
    const claimed = await request("POST", "/api/print-jobs/claim", "worker-secret");
    assert.equal(claimed.status, 200);
    assert.ok(claimed.body.job.leaseToken);
    const job = claimed.body.job;
    const path = `/api/print-jobs/${job.id}/report`;
    const report = {
      leaseToken: job.leaseToken,
      result: "queued",
      queueName: "Brother",
      spoolerJobId: "Brother-42",
    };
    assert.equal((await request("POST", path, "wrong", report)).status, 401);
    assert.equal(
      (await request("POST", path, "worker-secret", { ...report, leaseToken: "wrong" })).status,
      409,
    );
    assert.equal(
      (await request("POST", path, "worker-secret", report)).body.job.status,
      "queued_to_os",
    );
    assert.equal(
      (
        await request("POST", `/api/print-jobs/${job.id}/retry`, "worker-secret", {
          reason: "Try again please",
        })
      ).status,
      409,
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("existing stage-2 print jobs gain lease and retry columns without losing payloads", () => {
  const dir = mkdtempSync(join(tmpdir(), "seoul-job-migrate-test-"));
  const file = join(dir, "orders.sqlite");
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE orders (
    id TEXT PRIMARY KEY, order_number TEXT NOT NULL UNIQUE, access_token TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL, status TEXT NOT NULL,
    placed_at TEXT NOT NULL, data_json TEXT NOT NULL, paid_at TEXT
  );
  CREATE TABLE print_jobs (
    id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
    destination TEXT NOT NULL CHECK (destination IN ('kitchen', 'front')),
    status TEXT NOT NULL, created_at TEXT NOT NULL, payload_json TEXT NOT NULL,
    UNIQUE(order_id, destination)
  );`);
  const id = randomUUID();
  const orderId = randomUUID();
  const placedAt = "2026-10-07T12:00:00.000Z";
  old
    .prepare("INSERT INTO orders VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(
      orderId,
      "ST-1234567890",
      "access-token",
      randomUUID(),
      "request-hash",
      "paid",
      placedAt,
      "{}",
      placedAt,
    );
  old
    .prepare("INSERT INTO print_jobs VALUES (?, ?, ?, ?, ?, ?)")
    .run(
      id,
      orderId,
      "kitchen",
      "pending",
      placedAt,
      JSON.stringify({ schemaVersion: 1, destination: "kitchen", orderNumber: "ST-1234567890" }),
    );
  old.close();
  const store = openOrderStore(file);
  try {
    assert.equal(store.get("ST-1234567890", "access-token").fulfillmentStatus, "received");
    const job = store.listPrintJobs()[0];
    assert.equal(job.id, id);
    assert.equal(job.updatedAt, placedAt);
    assert.equal(job.attemptCount, 0);
    assert.equal(job.retryCount, 0);
    assert.equal(job.payload.orderNumber, "ST-1234567890");
    assert.equal(store.claimPrintJob().id, id);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
