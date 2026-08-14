import type {
  AdapterContext,
  AdapterResult,
  KitchenTicket,
  PrintAdapter,
} from "../../domain/integrations";

export type MockPrintBehavior = (
  ticket: KitchenTicket,
  context: AdapterContext,
) => AdapterResult | Promise<AdapterResult>;

type SuccessfulPrint = Extract<AdapterResult, { ok: true }>;

type RecordedPrint = {
  orderId: string;
  copyNumber: number;
  result: SuccessfulPrint;
};

export class MockPrintAdapter implements PrintAdapter {
  readonly provider = "mock_print";
  private readonly successfulPrints = new Map<string, RecordedPrint>();

  constructor(private readonly behavior?: MockPrintBehavior) {}

  async print(ticket: KitchenTicket, context: AdapterContext): Promise<AdapterResult> {
    const existing = this.successfulPrints.get(context.idempotencyKey);
    if (existing) {
      if (existing.orderId !== ticket.order.id || existing.copyNumber !== ticket.copyNumber) {
        return {
          ok: false,
          retryable: false,
          code: "IDEMPOTENCY_KEY_REUSED",
          message: "The print idempotency key was already used for another ticket.",
        };
      }

      return { ...existing.result, duplicate: true };
    }

    const result = this.behavior
      ? await this.behavior(ticket, context)
      : {
          ok: true as const,
          externalId: `MOCK-PRINT-${ticket.order.orderNumber}-COPY-${ticket.copyNumber}`,
        };

    if (result.ok) {
      this.successfulPrints.set(context.idempotencyKey, {
        orderId: ticket.order.id,
        copyNumber: ticket.copyNumber,
        result,
      });
    }

    return result;
  }
}
