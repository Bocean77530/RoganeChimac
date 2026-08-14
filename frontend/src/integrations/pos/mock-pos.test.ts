import { describe, expect, it } from "vitest";

import type { AdapterContext, CanonicalPosOrder } from "../../domain/integrations";
import { MockPosAdapter } from "./mock-pos.server.ts";

const order: CanonicalPosOrder = {
  id: "order-1",
  orderNumber: "ST-1001",
  requestedFor: "2026-08-14T10:30:00.000Z",
  customerName: "Alex Kim",
  customerPhone: "0400000000",
  tender: "PREPAID_ONLINE",
  lines: [],
  totals: { currency: "AUD", subtotalCents: 2_000, discountCents: 0, totalCents: 2_000 },
};

const context: AdapterContext = {
  jobId: "job-1",
  idempotencyKey: "pos:order-1:v1",
  restaurantId: "restaurant-1",
};

describe("MockPosAdapter", () => {
  it("deduplicates successful POS pushes", async () => {
    const adapter = new MockPosAdapter();

    const first = await adapter.pushOrder(order, context);
    const duplicate = await adapter.pushOrder(order, context);

    expect(first).toEqual({ ok: true, externalId: "MOCK-POS-ST-1001" });
    expect(duplicate).toEqual({
      ok: true,
      externalId: "MOCK-POS-ST-1001",
      duplicate: true,
    });
  });

  it("does not cache retryable failures", async () => {
    let attempt = 0;
    const adapter = new MockPosAdapter(() => {
      attempt += 1;
      return attempt === 1
        ? { ok: false, retryable: true, code: "MOCK_TIMEOUT", message: "Timed out" }
        : { ok: true, externalId: "MOCK-POS-ST-1001" };
    });

    expect((await adapter.pushOrder(order, context)).ok).toBe(false);
    expect((await adapter.pushOrder(order, context)).ok).toBe(true);
    expect(attempt).toBe(2);
  });
});
