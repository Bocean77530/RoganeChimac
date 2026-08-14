import type {
  AdapterContext,
  AdapterResult,
  CanonicalPosOrder,
  PosAdapter,
} from "../../domain/integrations";

export type MockPosBehavior = (
  order: CanonicalPosOrder,
  context: AdapterContext,
) => AdapterResult | Promise<AdapterResult>;

type SuccessfulDispatch = Extract<AdapterResult, { ok: true }>;

type RecordedDispatch = {
  orderId: string;
  result: SuccessfulDispatch;
};

export class MockPosAdapter implements PosAdapter {
  readonly provider = "mock_pos";
  private readonly successfulDispatches = new Map<string, RecordedDispatch>();

  constructor(private readonly behavior?: MockPosBehavior) {}

  async pushOrder(order: CanonicalPosOrder, context: AdapterContext): Promise<AdapterResult> {
    const existing = this.successfulDispatches.get(context.idempotencyKey);
    if (existing) {
      if (existing.orderId !== order.id) {
        return {
          ok: false,
          retryable: false,
          code: "IDEMPOTENCY_KEY_REUSED",
          message: "The POS idempotency key was already used for another order.",
        };
      }

      return { ...existing.result, duplicate: true };
    }

    const result = this.behavior
      ? await this.behavior(order, context)
      : { ok: true as const, externalId: createMockExternalId(order.orderNumber) };

    if (result.ok) {
      this.successfulDispatches.set(context.idempotencyKey, {
        orderId: order.id,
        result,
      });
    }

    return result;
  }
}

function createMockExternalId(orderNumber: string): string {
  const safeOrderNumber = orderNumber.replace(/[^a-z0-9-]/gi, "-").toUpperCase();
  return `MOCK-POS-${safeOrderNumber}`;
}
