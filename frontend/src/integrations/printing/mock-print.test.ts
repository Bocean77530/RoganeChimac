import { describe, expect, it } from "vitest";

import type { AdapterContext, KitchenTicket } from "../../domain/integrations";
import { MockPrintAdapter } from "./mock-print.server.ts";

const ticket: KitchenTicket = {
  restaurantName: "Seoul Table",
  placedAt: "2026-08-14T09:30:00.000Z",
  copyNumber: 1,
  order: {
    id: "order-1",
    orderNumber: "ST-1001",
    requestedFor: "2026-08-14T10:00:00.000Z",
    customerName: "Alex Kim",
    customerPhone: "0400000000",
    tender: "PREPAID_ONLINE",
    lines: [],
    totals: { currency: "AUD", subtotalCents: 2_000, discountCents: 0, totalCents: 2_000 },
  },
};

const context: AdapterContext = {
  jobId: "job-1",
  idempotencyKey: "print:order-1:copy-1",
  restaurantId: "restaurant-1",
};

describe("MockPrintAdapter", () => {
  it("deduplicates a successful print", async () => {
    const adapter = new MockPrintAdapter();
    const first = await adapter.print(ticket, context);
    const duplicate = await adapter.print(ticket, context);

    expect(first.ok).toBe(true);
    expect(duplicate).toEqual({
      ok: true,
      externalId: "MOCK-PRINT-ST-1001-COPY-1",
      duplicate: true,
    });
  });

  it("rejects an idempotency key reused for a different copy", async () => {
    const adapter = new MockPrintAdapter();
    await adapter.print(ticket, context);
    const result = await adapter.print({ ...ticket, copyNumber: 2 }, context);

    expect(result).toEqual({
      ok: false,
      retryable: false,
      code: "IDEMPOTENCY_KEY_REUSED",
      message: "The print idempotency key was already used for another ticket.",
    });
  });
});
