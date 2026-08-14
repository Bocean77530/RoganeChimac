import { describe, expect, it, vi } from "vitest";

import type { ServiceResult } from "@/domain/common";
import type { NormalizedPaymentEvent, PaymentSession } from "@/domain/payment";
import type {
  ApplyPaymentEventResult,
  PaymentAttemptView,
  PreparedPaymentAttempt,
} from "../payment-persistence.server";
import {
  createOrResumeCheckoutSession,
  type PaymentPersistencePort,
  type StripeCheckoutProviderPort,
} from "../payments.server";

const preparedAttempt: PreparedPaymentAttempt = {
  paymentId: "22222222-2222-4222-8222-222222222222",
  orderId: "11111111-1111-4111-8111-111111111111",
  orderNumber: "ST-ABC123",
  paymentAttempt: 2,
  total: { currency: "AUD", amountCents: 4_580 },
  itemCount: 3,
  customerEmail: "guest@example.com",
  expiresAt: "2026-08-14T11:30:00.000Z",
};

const embeddedSession: PaymentSession = {
  provider: "stripe",
  sessionId: "cs_test_order_1",
  launch: { kind: "embedded", clientSecret: "cs_test_order_1_secret_example" },
  expiresAt: preparedAttempt.expiresAt,
};

describe("createOrResumeCheckoutSession", () => {
  it("resumes the stored Stripe Session without creating another attempt", async () => {
    const existing = paymentAttempt({ sessionId: embeddedSession.sessionId });
    const persistence = persistencePort({
      getResumablePaymentAttempt: vi.fn(async () => success(existing)),
    });
    const provider = providerPort({
      retrieveSession: vi.fn(async () => ({
        sessionId: embeddedSession.sessionId,
        status: "open" as const,
        paymentStatus: "unpaid" as const,
        orderId: existing.orderId,
        total: existing.total,
      })),
      retrieveSessionForLaunch: vi.fn(async () => embeddedSession),
    });

    const result = await createOrResumeCheckoutSession(
      { orderId: existing.orderId },
      dependencies(provider, persistence),
    );

    expect(result).toEqual({
      ok: true,
      data: {
        orderId: existing.orderId,
        orderNumber: existing.orderNumber,
        session: embeddedSession,
      },
    });
    expect(provider.createSession).not.toHaveBeenCalled();
    expect(persistence.preparePaymentAttempt).not.toHaveBeenCalled();
    expect(persistence.attachPaymentSession).not.toHaveBeenCalled();
  });

  it("creates and attaches an AUD Embedded Checkout Session with a stable key", async () => {
    const persistence = persistencePort({
      getResumablePaymentAttempt: vi.fn(async () => success(null)),
      preparePaymentAttempt: vi.fn(async () => success(preparedAttempt)),
      attachPaymentSession: vi.fn(async () =>
        success(paymentAttempt({ sessionId: embeddedSession.sessionId })),
      ),
    });
    const provider = providerPort({
      createSession: vi.fn(async () => embeddedSession),
    });

    const result = await createOrResumeCheckoutSession(
      { orderId: preparedAttempt.orderId },
      dependencies(provider, persistence),
    );

    expect(result.ok).toBe(true);
    expect(provider.createSession).toHaveBeenCalledWith({
      orderId: preparedAttempt.orderId,
      orderNumber: preparedAttempt.orderNumber,
      paymentAttempt: 2,
      total: { currency: "AUD", amountCents: 4_580 },
      itemCount: 3,
      customerEmail: "guest@example.com",
      returnUrl: "https://pickup.example.com/order-confirmation?session_id={CHECKOUT_SESSION_ID}",
      expiresAt: preparedAttempt.expiresAt,
      idempotencyKey: "checkout-session:11111111-1111-4111-8111-111111111111:2",
    });
    expect(persistence.attachPaymentSession).toHaveBeenCalledWith({
      paymentId: preparedAttempt.paymentId,
      provider: "stripe",
      sessionId: embeddedSession.sessionId,
      expiresAt: embeddedSession.expiresAt,
      livemode: false,
    });
  });

  it("rejects a resumed Session whose server-side amount does not match", async () => {
    const existing = paymentAttempt({ sessionId: embeddedSession.sessionId });
    const persistence = persistencePort({
      getResumablePaymentAttempt: vi.fn(async () => success(existing)),
    });
    const provider = providerPort({
      retrieveSession: vi.fn(async () => ({
        sessionId: embeddedSession.sessionId,
        status: "open" as const,
        paymentStatus: "unpaid" as const,
        orderId: existing.orderId,
        total: { currency: "AUD" as const, amountCents: existing.total.amountCents + 1 },
      })),
    });

    await expect(
      createOrResumeCheckoutSession(
        { orderId: existing.orderId },
        dependencies(provider, persistence),
      ),
    ).rejects.toThrow("does not match its order");
    expect(provider.retrieveSessionForLaunch).not.toHaveBeenCalled();
  });
});

function paymentAttempt(overrides: Partial<PaymentAttemptView> = {}): PaymentAttemptView {
  return {
    ...preparedAttempt,
    provider: "stripe",
    sessionId: null,
    status: "pending",
    livemode: false,
    ...overrides,
  };
}

function providerPort(
  overrides: Partial<StripeCheckoutProviderPort> = {},
): StripeCheckoutProviderPort {
  return {
    createSession: vi.fn(async () => embeddedSession),
    retrieveSession: vi.fn(async () => ({
      sessionId: embeddedSession.sessionId,
      status: "open" as const,
      paymentStatus: "unpaid" as const,
      orderId: preparedAttempt.orderId,
      total: preparedAttempt.total,
    })),
    retrieveSessionForLaunch: vi.fn(async () => embeddedSession),
    ...overrides,
  };
}

function persistencePort(overrides: Partial<PaymentPersistencePort> = {}): PaymentPersistencePort {
  return {
    getResumablePaymentAttempt: vi.fn(async () => success(null)),
    preparePaymentAttempt: vi.fn(async () => success(preparedAttempt)),
    attachPaymentSession: vi.fn(async () => success(paymentAttempt())),
    applyNormalizedPaymentEvent: vi.fn(
      async (_event: NormalizedPaymentEvent): Promise<ServiceResult<ApplyPaymentEventResult>> =>
        success({ duplicate: false, posJobCreated: false }),
    ),
    ...overrides,
  };
}

function dependencies(provider: StripeCheckoutProviderPort, persistence: PaymentPersistencePort) {
  return {
    provider,
    persistence,
    appBaseUrl: "https://pickup.example.com/ignored-path",
    expectedLivemode: false,
  };
}

function success<T>(data: T): ServiceResult<T> {
  return { ok: true, data };
}
