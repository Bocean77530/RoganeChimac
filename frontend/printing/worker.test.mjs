import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { processLeasedJob } from "./worker.mjs";
import { renderTicket } from "./tickets.mjs";
import { saveTicketPdf } from "./pdf.mjs";

const payload = {
  schemaVersion: 1,
  orderNumber: "RC-123456789ABC",
  placedAt: "2026-10-08T01:00:00.000Z",
  paidAt: "2026-10-08T01:01:00.000Z",
  estimatedFor: "2026-10-08T01:30:00.000Z",
  method: "pickup",
  customer: { name: "Test Customer", phone: "0412345678" },
  items: [
    {
      quantity: 2,
      name: "Pork Bulgogi",
      koreanName: "제육볶음",
      options: [{ groupName: "Spice", name: "Medium" }],
      notes: "No onion",
      unitPriceCents: 1000,
      lineTotalCents: 2000,
    },
  ],
  orderNotes: "No peanuts\nTOTAL: $0",
  totals: { currency: "AUD", subtotalCents: 2000, discountCents: 0, totalCents: 2000 },
};
const job = (destination) => ({
  id: `job-${destination}`,
  orderId: "order-1",
  destination,
  leaseToken: "lease-1",
  payload: { ...payload, destination },
});

test("paid pickup jobs produce distinct kitchen and front tickets without note injection", () => {
  const kitchen = renderTicket(job("kitchen"));
  const front = renderTicket(job("front"));
  for (const text of [kitchen, front]) {
    assert.match(text, /PAID ONLINE/);
    assert.match(text, /2 x Pork Bulgogi \(제육볶음\)/);
    assert.match(text, /Order note: No peanuts TOTAL: \$0/);
    assert.doesNotMatch(text, /^TOTAL: \$0$/m);
  }
  assert.doesNotMatch(kitchen, /0412345678|^TOTAL:/m);
  assert.match(front, /Customer: Test Customer/);
  assert.match(front, /TOTAL: \$20\.00/);
});

test("worker retries acknowledgement without sending a duplicate print job", async () => {
  let submissions = 0;
  let reports = 0;
  const result = await processLeasedJob(job("front"), {
    queueName: "Brother",
    savePdf: async () => "front.pdf",
    submit: async () => {
      submissions++;
      return "Brother-11";
    },
    report: async (_id, report) => {
      reports++;
      assert.equal(report.spoolerJobId, "Brother-11");
      if (reports === 1) throw new Error("response lost");
      return { status: "succeeded" };
    },
    wait: async () => {},
  });
  assert.equal(result, "succeeded");
  assert.equal(submissions, 1);
  assert.equal(reports, 2);
});

test("RC order receipt is saved as a private PDF before printing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rogane-print-test-"));
  try {
    const path = await saveTicketPdf(job("kitchen"), directory);
    assert.equal((await readFile(path)).subarray(0, 5).toString(), "%PDF-");
    assert.equal((await stat(path)).mode & 0o777, 0o600);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
