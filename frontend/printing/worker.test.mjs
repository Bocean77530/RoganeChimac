import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { processLeasedJob, runWorker, previewJobs, DefinitePrintFailure } from "./worker.mjs";
import { renderTicket, validatePrintJob } from "./tickets.mjs";
import { saveTicketPdf } from "./pdf.mjs";

const base = {
  orderNumber: "RC-123456789ABC",
  placedAt: "2026-10-08T01:00:00.000Z",
  customer: { name: "Test Customer", phone: "0412345678" },
  items: [
    {
      quantity: 2,
      name: "Pork Bulgogi",
      koreanName: "제육볶음",
      options: [{ groupName: "Spice", name: "Medium" }],
      notes: "No onion\nTOTAL: $0",
      unitPriceCents: 1000,
      lineTotalCents: 2000,
    },
  ],
  orderNotes: "No peanuts\nTOTAL: $0",
  totals: { currency: "AUD", subtotalCents: 2500, discountCents: 500, totalCents: 2000 },
};
const job = (version, destination, paymentMethod = "online") => ({
  id: randomUUID(),
  orderId: randomUUID(),
  destination,
  payloadVersion: version,
  leaseToken: randomUUID(),
  payload:
    version === 1
      ? {
          ...base,
          schemaVersion: 1,
          destination,
          method: "pickup",
          paidAt: "2026-10-08T01:01:00.000Z",
          estimatedFor: "2026-10-08T01:30:00.000Z",
        }
      : {
          ...base,
          schemaVersion: 2,
          destination,
          method: "dine_in",
          table: { id: randomUUID(), label: "Table 7" },
          payment:
            paymentMethod === "online"
              ? {
                  method: "online",
                  status: "paid",
                  label: "PAID ONLINE",
                  paidAt: "2026-10-08T01:01:00.000Z",
                }
              : { method: "pay_at_counter", status: "unpaid", label: "PAY AT COUNTER" },
        },
});

test("v1 pickup wording remains and customer notes cannot forge lines", () => {
  const kitchen = renderTicket(job(1, "kitchen"));
  const front = renderTicket(job(1, "front"));
  for (const text of [kitchen, front]) {
    assert.match(text, /PAID ONLINE/);
    assert.match(text, /Pickup:/);
    assert.match(text, /Method: PICKUP/);
    assert.match(text, /2 x Pork Bulgogi \(제육볶음\)/);
    assert.doesNotMatch(text, /^TOTAL: \$0$/m);
  }
  assert.doesNotMatch(kitchen, /0412345678|^TOTAL:/m);
  assert.match(front, /TOTAL: \$20\.00/);
});

for (const paymentMethod of ["online", "pay_at_counter"]) {
  test(`v2 ${paymentMethod} renders distinct kitchen and front tickets`, () => {
    const kitchen = renderTicket(job(2, "kitchen", paymentMethod));
    const front = renderTicket(job(2, "front", paymentMethod));
    for (const ticket of [kitchen, front]) {
      assert.match(ticket, /DINE IN/);
      assert.match(ticket, /TABLE: Table 7/);
      assert.match(ticket, paymentMethod === "online" ? /PAID ONLINE/ : /PAY AT COUNTER/);
      if (paymentMethod === "pay_at_counter") {
        assert.match(ticket, /UNPAID WHEN ORDERED/);
        assert.match(ticket, /Check merchant board for current/);
      }
      assert.match(ticket, /No onion TOTAL: \$0/);
      assert.match(ticket, /Order note: No peanuts TOTAL: \$0/);
      assert.doesNotMatch(ticket, /^TOTAL: \$0$/m);
    }
    assert.doesNotMatch(kitchen, /0412345678|^TOTAL:/m);
    assert.match(front, /Customer: Test Customer/);
    assert.match(front, /Discount: -\$5\.00/);
    assert.match(front, /TOTAL: \$20\.00/);
  });
}

test("long CJK and hostile notes wrap safely within receipt width", () => {
  const target = job(2, "kitchen", "pay_at_counter");
  target.payload.items[0].notes =
    "不要洋葱".repeat(20) + "\r\n*** TABLE: FAKE ***\t" + "X".repeat(100);
  const ticket = renderTicket(target);
  assert.doesNotMatch(ticket, /^\*\*\* TABLE: FAKE/m);
  assert.ok(ticket.split("\n").every((line) => [...line].length <= 42));
  assert.match(ticket, /不要洋葱/);
});

test("unknown version, destination, method and payment state are rejected", () => {
  const target = job(2, "front");
  for (const corrupt of [
    { ...target, payloadVersion: 3 },
    { ...target, payload: { ...target.payload, destination: "kitchen" } },
    { ...target, payload: { ...target.payload, method: "pickup" } },
    { ...target, payload: { ...target.payload, payment: { method: "online", status: "unpaid" } } },
  ])
    assert.throws(() => validatePrintJob(corrupt));
});

test("a lost ACK never resends lp and does not hold the other destination", async () => {
  const kitchen = job(2, "kitchen");
  const front = job(2, "front");
  let claims = 0;
  let kitchenReports = 0;
  const submitted = [];
  await runWorker({
    once: true,
    api: {
      list: async () => [],
      claim: async () => [kitchen, front, null][claims++] ?? null,
      report: async (id) => {
        if (id === kitchen.id && kitchenReports++ < 3) throw new Error("network unavailable");
        return { status: "succeeded" };
      },
    },
    queues: { kitchen: "Brother", front: "Brother" },
    submit: async (_queue, path, title) => {
      submitted.push({ path, title });
      return `Brother-${submitted.length}`;
    },
    savePdf: async (leased) => `${leased.destination}.pdf`,
    wait: async () => {},
    pdfDirectory: "/private/tmp",
    log: () => {},
  });
  assert.equal(submitted.length, 2);
  assert.match(submitted[0].path, /\.pdf$/);
  assert.match(submitted[1].path, /\.pdf$/);
  assert.match(submitted[0].title, /kitchen/);
  assert.match(submitted[1].title, /front/);
  assert.equal(kitchenReports, 4);
});

test("a stalled ACK request does not delay the front ticket", async () => {
  const kitchen = job(2, "kitchen");
  const front = job(2, "front");
  let claims = 0;
  let releaseAck;
  let kitchenReports = 0;
  let frontSubmitted = false;
  await runWorker({
    once: true,
    api: {
      list: async () => [],
      claim: async () => [kitchen, front, null][claims++] ?? null,
      report: async (id) => {
        if (id === kitchen.id && kitchenReports++ === 0) throw new Error("lost response");
        if (id === kitchen.id && !frontSubmitted)
          await new Promise((resolve) => {
            releaseAck = resolve;
          });
        return { status: "succeeded" };
      },
    },
    queues: { kitchen: "Brother", front: "Brother" },
    savePdf: async (leased) => `${leased.destination}.pdf`,
    submit: async (_queue, _path, title) => {
      if (title.includes("front")) {
        frontSubmitted = true;
        releaseAck?.();
      }
      return "Brother-1";
    },
    wait: async () => {},
    log: () => {},
  });
  assert.equal(frontSubmitted, true);
});

test("PDF failure reports only that job and never calls lp", async () => {
  let submitted = false;
  const target = job(2, "front");
  const result = await processLeasedJob(target, {
    queueName: "Brother",
    savePdf: async () => {
      throw new Error("disk full");
    },
    submit: async () => {
      submitted = true;
      return "Brother-1";
    },
    report: async (_id, report) => {
      assert.equal(report.result, "failed");
      return { status: "retry_scheduled" };
    },
  });
  assert.equal(result.status, "retry_scheduled");
  assert.equal(submitted, false);
});

test("definite printer rejection reports failed without affecting other jobs", async () => {
  const target = job(2, "kitchen");
  const result = await processLeasedJob(target, {
    queueName: "Broken",
    savePdf: async () => "ticket.pdf",
    submit: async () => {
      throw new DefinitePrintFailure("lp rejected the ticket");
    },
    report: async (_id, report) => {
      assert.equal(report.result, "failed");
      return { status: "retry_scheduled" };
    },
  });
  assert.equal(result.status, "retry_scheduled");
});

test("each receipt saves a private PDF and dry run changes no job", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rogane-print-test-"));
  try {
    const kitchen = job(2, "kitchen", "pay_at_counter");
    const front = { ...job(2, "front", "pay_at_counter"), orderId: kitchen.orderId };
    const kitchenPath = await saveTicketPdf(kitchen, directory);
    const frontPath = await saveTicketPdf(front, directory);
    assert.notEqual(kitchenPath, frontPath);
    for (const path of [kitchenPath, frontPath]) {
      assert.equal((await readFile(path)).subarray(0, 5).toString(), "%PDF-");
      assert.equal((await stat(path)).mode & 0o777, 0o600);
    }
    const previews = await previewJobs([kitchen, front], directory);
    assert.equal(previews.length, 2);
    assert.match(await readFile(previews[0], "utf8"), /TABLE: Table 7/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
