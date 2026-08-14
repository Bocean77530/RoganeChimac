import type { Money } from "./common";

export type PaymentLaunch =
  | { kind: "embedded"; clientSecret: string }
  | { kind: "redirect"; url: string };

export type NormalizedPaymentEventType =
  | "payment.succeeded"
  | "payment.failed"
  | "session.expired"
  | "refund.created"
  | "refund.updated"
  | "refund.failed"
  | "ignored";

export type NormalizedPaymentEvent = {
  provider: string;
  providerEventId: string;
  type: NormalizedPaymentEventType;
  eventCreatedAt: string;
  orderId?: string;
  sessionId?: string;
  paymentIntentId?: string;
  refundId?: string;
  money?: Money;
  livemode: boolean;
};

export type PaymentSessionInput = {
  orderId: string;
  orderNumber: string;
  paymentAttempt: number;
  total: Money;
  itemCount: number;
  customerEmail: string;
  returnUrl: string;
  expiresAt: string;
  idempotencyKey: string;
};

export type PaymentSession = {
  provider: string;
  sessionId: string;
  launch: PaymentLaunch;
  expiresAt: string;
};

export interface PaymentProvider {
  readonly key: string;

  createSession(input: PaymentSessionInput): Promise<PaymentSession>;

  retrieveSession(sessionId: string): Promise<{
    sessionId: string;
    status: "open" | "complete" | "expired";
    paymentStatus: "unpaid" | "paid" | "no_payment_required";
    orderId?: string;
    total?: Money;
  }>;

  expireSession(input: {
    sessionId: string;
    idempotencyKey: string;
  }): Promise<void>;

  verifyAndNormalizeWebhook(input: {
    rawBody: string;
    signature: string;
  }): Promise<NormalizedPaymentEvent>;
}
