import "@tanstack/react-start/server-only";

import Stripe from "stripe";

import type { NormalizedPaymentEvent, NormalizedPaymentEventType } from "@/domain/payment";

const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

export class StripeWebhookVerificationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "StripeWebhookVerificationError";
  }
}

export class StripeWebhookModeMismatchError extends Error {
  constructor(
    readonly expectedLivemode: boolean,
    readonly receivedLivemode: boolean,
  ) {
    super("Stripe webhook mode does not match this deployment");
    this.name = "StripeWebhookModeMismatchError";
  }
}

type StripeWebhookVerifier = Pick<Stripe, "webhooks">;

export async function verifyAndNormalizeStripeWebhook(input: {
  stripe: StripeWebhookVerifier;
  webhookSecret: string;
  rawBody: string;
  signature: string;
  expectedLivemode: boolean;
}): Promise<NormalizedPaymentEvent> {
  let event: Stripe.Event;

  try {
    event = await input.stripe.webhooks.constructEventAsync(
      input.rawBody,
      input.signature,
      input.webhookSecret,
      STRIPE_SIGNATURE_TOLERANCE_SECONDS,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch (error) {
    throw new StripeWebhookVerificationError("Stripe webhook signature verification failed", {
      cause: error,
    });
  }

  if (event.livemode !== input.expectedLivemode) {
    throw new StripeWebhookModeMismatchError(input.expectedLivemode, event.livemode);
  }

  return normalizeStripeEvent(event);
}

export function normalizeStripeEvent(event: Stripe.Event): NormalizedPaymentEvent {
  const base = {
    provider: "stripe",
    providerEventId: event.id,
    eventCreatedAt: new Date(event.created * 1_000).toISOString(),
    livemode: event.livemode,
  } as const;

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const type: NormalizedPaymentEventType =
        session.payment_status === "paid" || session.payment_status === "no_payment_required"
          ? "payment.succeeded"
          : "ignored";

      return {
        ...base,
        type,
        ...checkoutSessionReferences(session),
        money: stripeMoney(session.currency, session.amount_total),
      };
    }

    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      return {
        ...base,
        type: "payment.succeeded",
        ...checkoutSessionReferences(session),
        money: stripeMoney(session.currency, session.amount_total),
      };
    }

    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session;
      return {
        ...base,
        type: "payment.failed",
        ...checkoutSessionReferences(session),
        money: stripeMoney(session.currency, session.amount_total),
      };
    }

    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      return {
        ...base,
        type: "session.expired",
        ...checkoutSessionReferences(session),
        money: stripeMoney(session.currency, session.amount_total),
      };
    }

    case "payment_intent.payment_failed": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      return {
        ...base,
        type: "payment.failed",
        orderId: paymentIntent.metadata.order_id || undefined,
        paymentIntentId: paymentIntent.id,
        money: stripeMoney(paymentIntent.currency, paymentIntent.amount),
      };
    }

    case "refund.created":
    case "refund.updated":
    case "refund.failed": {
      const refund = event.data.object as Stripe.Refund;
      return {
        ...base,
        type: normalizedRefundEventType(event.type, refund.status),
        orderId: refund.metadata?.order_id || undefined,
        paymentIntentId: expandableId(refund.payment_intent),
        refundId: refund.id,
        money: stripeMoney(refund.currency, refund.amount),
      };
    }

    default:
      return {
        ...base,
        type: "ignored",
      };
  }
}

function normalizedRefundEventType(
  eventType: "refund.created" | "refund.updated" | "refund.failed",
  status: string | null,
): NormalizedPaymentEventType {
  if (eventType === "refund.failed" || status === "failed" || status === "canceled") {
    return "refund.failed";
  }
  if (status === "succeeded") return eventType;

  // Pending and requires_action refunds are not money movement facts yet.
  return "ignored";
}

function checkoutSessionReferences(session: Stripe.Checkout.Session) {
  return {
    orderId: session.metadata?.order_id || session.client_reference_id || undefined,
    sessionId: session.id,
    paymentIntentId: expandableId(session.payment_intent),
  };
}

function expandableId(value: string | { id: string } | null | undefined): string | undefined {
  if (typeof value === "string") return value;
  return value?.id;
}

function stripeMoney(currency: string | null, amount: number | null) {
  if (currency == null || amount == null) return undefined;
  if (currency.toLowerCase() !== "aud") {
    throw new StripeWebhookVerificationError("Stripe event used an unsupported currency");
  }
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new StripeWebhookVerificationError("Stripe event contained an invalid amount");
  }

  return { currency: "AUD", amountCents: amount } as const;
}
