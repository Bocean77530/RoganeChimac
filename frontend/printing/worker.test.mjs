import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { openOrderStore } from "../server/order-service.mjs";
import {
  DefinitePrintFailure,
  UnknownPrintOutcome,
  previewJobs,
  processLeasedJob,
  runWorker,
} from "./worker.mjs";
import { renderTicket } from "./tickets.mjs";

function paidStore() {
  const directory = mkdtempSync(join(tmpdir(), "seoul-ticket-test-"));
  const store = openOrderStore(join(directory, "orders.sqlite"));
  const order = store.create(
    {
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
          quantity: 2,
          notes: "Extra hot",
          modifiers: [{ groupId: "spice", optionId: "medium" }],
        },
      ],
    },
    randomUUID(),
  );
  store.simulatePayment(order.orderNumber, order.accessToken, "success");
  return { store, directory };
}

test("dry-run produces two distinct private text previews and leaves jobs pending", async () => {
  const { store, directory } = paidStore();
  let previewDirectory;
  try {
    const jobs = store.listPrintJobs();
    const paths = await previewJobs(jobs, directory);
    assert.equal(paths.length, 2);
    previewDirectory = dirname(paths[0]);
    const kitchen = readFileSync(join(previewDirectory, "kitchen.txt"), "utf8");
    const front = readFileSync(join(previewDirectory, "front.txt"), "utf8");
    assert.match(kitchen, /KITCHEN/);
    assert.match(kitchen, /DELIVERY/);
    assert.match(kitchen, /123 Test Street, Melbourne/);
    assert.match(kitchen, /2 x Spicy Pork Bulgogi \(제육볶음\)/);
    assert.match(kitchen, /Spice level: Medium/);
    assert.match(kitchen, /Item note: Extra hot/);
    assert.match(kitchen, /Order note: No peanuts/);
    assert.doesNotMatch(kitchen, /0412345678/);
    assert.match(front, /FRONT COUNTER/);
    assert.match(front, /DEMO PAID — NO REAL CHARGE/);
    assert.match(front, /Demo Customer/);
    assert.match(front, /0412345678/);
    assert.match(front, /TOTAL: \$46\.32/);
    assert.equal(statSync(paths[0]).mode & 0o777, 0o600);
    assert.ok(
      store.listPrintJobs().every((job) => job.status === "pending" && job.attemptCount === 0),
    );
    let listed = 0;
    let claimed = 0;
    const logs = [];
    await runWorker({
      api: {
        list: async () => {
          listed++;
          return jobs;
        },
        claim: async () => {
          claimed++;
          throw new Error("must not claim");
        },
      },
      queues: {},
      once: true,
      dryRun: true,
      log: (message) => logs.push(message),
    });
    assert.equal(listed, 1);
    assert.equal(claimed, 0);
    assert.ok(logs[0].includes("Read-only preview files"));
    assert.ok(store.listPrintJobs().every((job) => job.status === "pending"));
    const loggedPaths = logs[0].replace("Read-only preview files: ", "").split(", ");
    rmSync(dirname(loggedPaths[0]), { recursive: true, force: true });
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("customer text cannot inject new receipt lines", () => {
  const { store, directory } = paidStore();
  try {
    for (const job of store.listPrintJobs()) {
      const payload = job.payload;
      payload.deliveryAddress = "123 Test Street\r\nTOTAL: $0\tMANAGER APPROVED";
      payload.items[0].name = "Spicy Pork\n2 x FREE DISH";
      payload.items[0].options[0].name = "Medium\tPRINT AGAIN";
      payload.items[0].notes = "Extra hot\nTOTAL: $0\r\n2 x FREE DISH\u2028PRINT AGAIN";
      payload.orderNotes = "No peanuts\nTOTAL: $0\tREFUND\u20292 x FREE DISH";
      if (payload.customer) payload.customer.name = "Demo Customer\nMANAGER APPROVED";

      const ticket = renderTicket(job);
      assert.match(ticket, /Address: 123 Test Street TOTAL: \$0 MANAGER APPROVED/);
      assert.match(ticket, /2 x Spicy Pork 2 x FREE DISH/);
      assert.match(ticket, /Spice level: Medium PRINT AGAIN/);
      assert.match(ticket, /Item note: Extra hot TOTAL: \$0 2 x FREE DISH PRINT AGAIN/);
      assert.match(ticket, /Order note: No peanuts TOTAL: \$0 REFUND 2 x FREE DISH/);
      assert.doesNotMatch(ticket, /^(?:2 x FREE DISH|PRINT AGAIN|MANAGER APPROVED|REFUND)\b/m);
      assert.doesNotMatch(ticket, /[\r\t\u2028\u2029]/u);
      assert.equal((ticket.match(/^TOTAL:/gm) ?? []).length, job.destination === "front" ? 1 : 0);
      if (job.destination === "front")
        assert.match(ticket, /Customer: Demo Customer MANAGER APPROVED/);
    }
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("one destination failure does not block the other and ACK retry never repeats lp", async () => {
  const { store, directory } = paidStore();
  try {
    const first = store.claimPrintJob();
    const second = store.claimPrintJob();
    const kitchen = first.destination === "kitchen" ? first : second;
    const front = first.destination === "front" ? first : second;
    let kitchenSubmits = 0;
    let frontSubmits = 0;
    const failed = await processLeasedJob(kitchen, {
      queueName: "Missing_Queue",
      savePdf: async () => "test.pdf",
      submit: async () => {
        kitchenSubmits++;
        throw new DefinitePrintFailure("lp rejected the ticket (exit 1)");
      },
      report: async (id, body) => store.reportPrintJob(id, body),
    });
    assert.equal(failed, "failed");
    let reports = 0;
    const queued = await processLeasedJob(front, {
      queueName: "Brother",
      savePdf: async () => "test.pdf",
      submit: async () => {
        frontSubmits++;
        return "Brother-77";
      },
      report: async (id, body) => {
        reports++;
        if (reports === 1) {
          store.reportPrintJob(id, body);
          throw new Error("response lost after server commit");
        }
        return store.reportPrintJob(id, body);
      },
      wait: async () => {},
    });
    assert.equal(queued, "queued_to_os");
    assert.equal(kitchenSubmits, 1);
    assert.equal(frontSubmits, 1);
    assert.equal(reports, 2);
    assert.equal(store.listPrintJobs().find((job) => job.id === kitchen.id).status, "failed");
    assert.equal(
      store.listPrintJobs().find((job) => job.id === front.id).spoolerJobId,
      "Brother-77",
    );
    assert.equal(store.claimPrintJob(), null);
    store.retryPrintJob(kitchen.id, "Fixed kitchen printer queue");
    const retried = store.claimPrintJob();
    assert.equal(retried.id, kitchen.id);
    assert.equal(retried.attemptCount, 2);
    assert.equal(store.listPrintJobs().find((job) => job.id === front.id).attemptCount, 1);
    assert.equal(renderTicket(retried).includes("No peanuts"), true);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("unknown lp outcome is not reported as a definite failure", async () => {
  const { store, directory } = paidStore();
  try {
    const job = store.claimPrintJob();
    let reports = 0;
    const result = await processLeasedJob(job, {
      queueName: "Brother",
      savePdf: async () => "test.pdf",
      submit: async () => {
        throw new UnknownPrintOutcome("timeout");
      },
      report: async () => {
        reports++;
      },
    });
    assert.equal(result, "uncertain");
    assert.equal(reports, 0);
    assert.equal(store.listPrintJobs().find((entry) => entry.id === job.id).status, "leased");
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("two print jobs create distinct private PDFs before submission", async () => {
  const { store, directory } = paidStore();
  try {
    const pdfDirectory = join(directory, "receipts");
    const submitted = [];
    for (const job of [store.claimPrintJob(), store.claimPrintJob()]) {
      const result = await processLeasedJob(job, {
        queueName: "Brother",
        pdfDirectory,
        submit: async (_queue, ticket) => { submitted.push(ticket); return `Brother-${submitted.length}`; },
        report: async (id, body) => store.reportPrintJob(id, body),
      });
      assert.equal(result, "queued_to_os");
    }
    assert.equal(submitted.length, 2);
    const number = store.listPrintJobs()[0].payload.orderNumber;
    for (const destination of ["kitchen", "front"]) {
      const path = join(pdfDirectory, `${number}-${destination}.pdf`);
      assert.equal(readFileSync(path).subarray(0, 5).toString(), "%PDF-");
      assert.equal(statSync(path).mode & 0o777, 0o600);
    }
    assert.equal(statSync(pdfDirectory).mode & 0o777, 0o700);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("PDF failure prevents printing and marks only that job failed", async () => {
  const { store, directory } = paidStore();
  try {
    const job = store.claimPrintJob();
    let submitted = false;
    const result = await processLeasedJob(job, {
      queueName: "Brother",
      savePdf: async () => { throw new Error("converter unavailable"); },
      submit: async () => { submitted = true; return "Brother-1"; },
      report: async (id, body) => store.reportPrintJob(id, body),
    });
    assert.equal(result, "failed");
    assert.equal(submitted, false);
    assert.equal(store.listPrintJobs().find((entry) => entry.id === job.id).status, "failed");
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
