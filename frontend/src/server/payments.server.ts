import "@tanstack/react-start/server-only";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { ServiceError, ServiceResult } from "@/domain/common";
import type { NormalizedPaymentEvent, PaymentSession } from "@/domain/payment";
import {
  STRIPE_PROVIDER,
  createStripePaymentProviderFromEnv,
  stripeCheckoutIdempotencyKey,
  type StripePaymentProvider,
} from "@/integrations/payments/stripe.server";
import {
  applyNormalizedPaymentEvent,
  attachPaymentSession,
  getResumablePaymentAttempt,
  preparePaymentAttempt,
  type ApplyPaymentEventResult,
  type PaymentAttemptView,
  type PreparedPaymentAttempt,
} from "./payment-persistence.server";

const orderIdSchema = z.object({
  orderId: z.string().uuid(),
});

export type StripeCheckoutSessionView = {
  orderId: string;
  orderNumber: string;
  session: PaymentSession;
};

export type PaymentPersistencePort = {
  getResumablePaymentAttempt(input: {
    orderId: string;
    provider: string;
  }): Promise<ServiceResult<PaymentAttemptView | null>>;
  preparePaymentAttempt(input: {
    orderId: string;
    provider: string;
    livemode: boolean;
  }): Promise<ServiceResult<PreparedPaymentAttempt>>;
  attachPaymentSession(input: {
    paymentId: string;
    provider: string;
    sessionId: string;
    expiresAt: string;
    livemode: boolean;
  }): Promise<ServiceResult<PaymentAttemptView>>;
  applyNormalizedPaymentEvent(
    event: NormalizedPaymentEvent,
  ): Promise<ServiceResult<ApplyPaymentEventResult>>;
};

export type StripeCheckoutProviderPort = Pick<
  StripePaymentProvider,
  "createSession" | "retrieveSession" | "retrieveSessionForLaunch"
>;

export type PaymentServiceDependencies = {
  provider: StripeCheckoutProviderPort;
  persistence: PaymentPersistencePort;
  appBaseUrl: string;
  expectedLivemode: boolean;
};

const defaultPersistence: PaymentPersistencePort = {
  getResumablePaymentAttempt,
  preparePaymentAttempt,
  attachPaymentSession,
  applyNormalizedPaymentEvent,
};

export const createOrResumeStripeCheckoutSession = createServerFn({
  method: "POST",
})
  .validator(orderIdSchema)
  .handler(({ data }) => requestStripeCheckoutSession(data));

export async function requestStripeCheckoutSession(input: {
  orderId: string;
}): Promise<ServiceResult<StripeCheckoutSessionView>> {
  try {
    return await createOrResumeCheckoutSession(input, requestDependencies());
  } catch (error) {
    console.error("Stripe Checkout Session request failed", safeError(error));
    return paymentProviderUnavailable();
  }
}

export async function createOrResumeCheckoutSession(
  input: { orderId: string },
  dependencies: PaymentServiceDependencies,
): Promise<ServiceResult<StripeCheckoutSessionView>> {
  const existing = await dependencies.persistence.getResumablePaymentAttempt({
    orderId: input.orderId,
    provider: STRIPE_PROVIDER,
  });
  if (!existing.ok) return existing;

  if (existing.data?.sessionId) {
    const resumed = await resumeSession(existing.data, dependencies.provider);
    if (resumed) return { ok: true, data: resumed };
  }

  const prepared = await dependencies.persistence.preparePaymentAttempt({
    orderId: input.orderId,
    provider: STRIPE_PROVIDER,
    livemode: dependencies.expectedLivemode,
  });
  if (!prepared.ok) return prepared;

  return createAndAttachSession(prepared.data, dependencies);
}

export async function processStripeWebhook(input: {
  rawBody: string;
  signature: string;
}): Promise<ServiceResult<ApplyPaymentEventResult>> {
  const provider = createStripePaymentProviderFromEnv({
    requireWebhookSecret: true,
  });
  const event = await provider.verifyAndNormalizeWebhook(input);
  return defaultPersistence.applyNormalizedPaymentEvent(event);
}

async function resumeSession(
  attempt: PaymentAttemptView,
  provider: StripeCheckoutProviderPort,
): Promise<StripeCheckoutSessionView | null> {
  if (!attempt.sessionId) return null;

  const state = await provider.retrieveSession(attempt.sessionId);
  if (state.status === "expired") return null;
  if (
    state.orderId !== attempt.orderId ||
    state.total?.currency !== attempt.total.currency ||
    state.total.amountCents !== attempt.total.amountCents
  ) {
    throw new Error("Stored Stripe Checkout Session does not match its order");
  }

  const session = await provider.retrieveSessionForLaunch(attempt.sessionId);
  return {
    orderId: attempt.orderId,
    orderNumber: attempt.orderNumber,
    session,
  };
}

async function createAndAttachSession(
  attempt: PreparedPaymentAttempt,
  dependencies: PaymentServiceDependencies,
): Promise<ServiceResult<StripeCheckoutSessionView>> {
  const session = await dependencies.provider.createSession({
    orderId: attempt.orderId,
    orderNumber: attempt.orderNumber,
    paymentAttempt: attempt.paymentAttempt,
    total: attempt.total,
    itemCount: attempt.itemCount,
    customerEmail: attempt.customerEmail,
    returnUrl: stripeReturnUrl(dependencies.appBaseUrl),
    expiresAt: attempt.expiresAt,
    idempotencyKey: stripeCheckoutIdempotencyKey(attempt.orderId, attempt.paymentAttempt),
  });

  const attached = await dependencies.persistence.attachPaymentSession({
    paymentId: attempt.paymentId,
    provider: STRIPE_PROVIDER,
    sessionId: session.sessionId,
    expiresAt: session.expiresAt,
    livemode: dependencies.expectedLivemode,
  });
  if (!attached.ok) return attached;

  return {
    ok: true,
    data: {
      orderId: attempt.orderId,
      orderNumber: attempt.orderNumber,
      session,
    },
  };
}

function requestDependencies(): PaymentServiceDependencies {
  return {
    provider: createStripePaymentProviderFromEnv(),
    persistence: defaultPersistence,
    appBaseUrl: requiredEnv("APP_BASE_URL"),
    expectedLivemode: requiredBooleanEnv("PAYMENTS_EXPECT_LIVEMODE"),
  };
}

function stripeReturnUrl(appBaseUrl: string): string {
  const baseUrl = new URL(appBaseUrl);
  const isLocalHttp =
    baseUrl.protocol === "http:" &&
    (baseUrl.hostname === "localhost" || baseUrl.hostname === "127.0.0.1");

  if (baseUrl.protocol !== "https:" && !isLocalHttp) {
    throw new Error("APP_BASE_URL must use HTTPS outside local development");
  }
  if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw new Error("APP_BASE_URL must not contain credentials, query, or hash");
  }

  const returnUrl = new URL("/order-confirmation", baseUrl.origin);
  return `${returnUrl.toString()}?session_id={CHECKOUT_SESSION_ID}`;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function requiredBooleanEnv(name: string): boolean {
  const value = requiredEnv(name);
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be explicitly set to true or false`);
}

function paymentProviderUnavailable(): ServiceResult<never> {
  return {
    ok: false,
    error: {
      code: "PAYMENT_PROVIDER_UNAVAILABLE",
      message: "Secure payment is temporarily unavailable. Please try again.",
      retryable: true,
    },
  };
}

function safeError(error: unknown): Pick<ServiceError, "message"> {
  return {
    message: error instanceof Error ? error.message : "Unknown payment error",
  };
}
