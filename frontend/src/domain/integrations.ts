import type { AdminOrderDetail } from "./order";

export type IntegrationKind = "pos" | "kitchen_print";

export type IntegrationJobStatus =
  | "queued"
  | "processing"
  | "retry_scheduled"
  | "succeeded"
  | "manual_action_required"
  | "dead_letter"
  | "cancelled";

export type IntegrationState = {
  kind: IntegrationKind;
  status: IntegrationJobStatus;
  provider: string;
  attemptCount: number;
  lastError?: string;
};

export type AdapterResult =
  | { ok: true; externalId?: string; duplicate?: boolean }
  | { ok: false; retryable: boolean; code: string; message: string };

export type AdapterContext = {
  jobId: string;
  idempotencyKey: string;
  restaurantId: string;
};

export type CanonicalPosOrder = Pick<
  AdminOrderDetail,
  | "id"
  | "orderNumber"
  | "requestedFor"
  | "customerName"
  | "customerPhone"
  | "lines"
  | "totals"
> & { tender: "PREPAID_ONLINE" };

export interface PosAdapter {
  readonly provider: string;
  pushOrder(
    order: CanonicalPosOrder,
    context: AdapterContext,
  ): Promise<AdapterResult>;
}

export type KitchenTicket = {
  restaurantName: string;
  order: CanonicalPosOrder;
  placedAt: string;
  orderNotes?: string;
  copyNumber: number;
};

export interface PrintAdapter {
  readonly provider: string;
  print(
    ticket: KitchenTicket,
    context: AdapterContext,
  ): Promise<AdapterResult>;
}
