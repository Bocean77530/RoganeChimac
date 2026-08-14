import Stripe from "stripe";
import { describe, expect, it } from "vitest";

import {
  normalizeStripeEvent,
  StripeWebhookModeMismatchError,
  StripeWebhookVerificationError,
  verifyAndNormalizeStripeWebhook,
} from "../stripe-webhook.server";

describe("normalizeStripeEvent", () => {
  it("maps a paid Checkout Session to payment.succeeded", () => {
    const result = normalizeStripeEvent(
      stripeEvent("checkout.session.completed", checkoutSession()),
    );

    expect(result).toEqual({
      provider: "stripe",
      providerEventId: "evt_test_1",
      type: "payment.succeeded",
      eventCreatedAt: "2026-08-14T11:00:00.000Z",
      orderId: "11111111-1111-4111-8111-111111111111",
      sessionId: "cs_test_order_1",
      paymentIntentId: "pi_test_order_1",
      money: { currency: "AUD", amountCents: 4_580 },
      livemode: false,
    });
  });

  it("does not treat an unpaid completed Session as successful", () => {
    const result = normalizeStripeEvent(
      stripeEvent("checkout.session.completed", {
        ...checkoutSession(),
        payment_status: "unpaid",
      }),
    );

    expect(result.type).toBe("ignored");
  });

  it.each([
    ["checkout.session.async_payment_failed", "payment.failed"],
    ["checkout.session.expired", "session.expired"],
  ] as const)("maps %s to %s", (eventType, normalizedType) => {
    const result = normalizeStripeEvent(stripeEvent(eventType, checkoutSession()));

    expect(result.type).toBe(normalizedType);
    expect(result.sessionId).toBe("cs_test_order_1");
  });

  it.each([
    ["refund.created", "refund.created"],
    ["refund.updated", "refund.updated"],
    ["refund.failed", "refund.failed"],
  ] as const)("maps %s with refund references", (eventType, normalizedType) => {
    const result = normalizeStripeEvent(stripeEvent(eventType, refund()));

    expect(result).toMatchObject({
      type: normalizedType,
      orderId: "11111111-1111-4111-8111-111111111111",
      paymentIntentId: "pi_test_order_1",
      refundId: "re_test_1",
      money: { currency: "AUD", amountCents: 1_000 },
    });
  });

  it("does not book a pending refund as money returned", () => {
    const result = normalizeStripeEvent(
      stripeEvent("refund.created", { ...refund(), status: "pending" }),
    );

    expect(result.type).toBe("ignored");
  });

  it("maps a canceled refund update to refund.failed", () => {
    const result = normalizeStripeEvent(
      stripeEvent("refund.updated", { ...refund(), status: "canceled" }),
    );

    expect(result.type).toBe("refund.failed");
  });

  it("maps unrelated Stripe events to ignored", () => {
    const result = normalizeStripeEvent(
      stripeEvent("customer.created", { id: "cus_test", object: "customer" }),
    );
    expect(result.type).toBe("ignored");
  });
});

describe("verifyAndNormalizeStripeWebhook", () => {
  const webhookSecret = "whsec_test_secret";
  const stripe = new Stripe("sk_test_example", {
    httpClient: Stripe.createFetchHttpClient(),
  });

  it("accepts a correctly signed raw body", async () => {
    const event = stripeEvent("checkout.session.completed", checkoutSession());
    const rawBody = JSON.stringify(event);
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: rawBody,
      secret: webhookSecret,
    });

    await expect(
      verifyAndNormalizeStripeWebhook({
        stripe,
        webhookSecret,
        rawBody,
        signature,
        expectedLivemode: false,
      }),
    ).resolves.toMatchObject({ type: "payment.succeeded" });
  });

  it("rejects a body changed after signing", async () => {
    const rawBody = JSON.stringify(stripeEvent("checkout.session.completed", checkoutSession()));
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: rawBody,
      secret: webhookSecret,
    });

    await expect(
      verifyAndNormalizeStripeWebhook({
        stripe,
        webhookSecret,
        rawBody: `${rawBody} `,
        signature,
        expectedLivemode: false,
      }),
    ).rejects.toBeInstanceOf(StripeWebhookVerificationError);
  });

  it("rejects a valid signature outside the replay tolerance", async () => {
    const rawBody = JSON.stringify(stripeEvent("checkout.session.completed", checkoutSession()));
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: rawBody,
      secret: webhookSecret,
      timestamp: Math.floor(Date.now() / 1_000) - 600,
    });

    await expect(
      verifyAndNormalizeStripeWebhook({
        stripe,
        webhookSecret,
        rawBody,
        signature,
        expectedLivemode: false,
      }),
    ).rejects.toBeInstanceOf(StripeWebhookVerificationError);
  });

  it("rejects a live event at a Sandbox endpoint", async () => {
    const event = {
      ...stripeEvent("checkout.session.completed", checkoutSession()),
      livemode: true,
    };
    const rawBody = JSON.stringify(event);
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: rawBody,
      secret: webhookSecret,
    });

    await expect(
      verifyAndNormalizeStripeWebhook({
        stripe,
        webhookSecret,
        rawBody,
        signature,
        expectedLivemode: false,
      }),
    ).rejects.toBeInstanceOf(StripeWebhookModeMismatchError);
  });
});

function stripeEvent(type: string, object: object): Stripe.Event {
  return {
    id: "evt_test_1",
    object: "event",
    api_version: "2026-07-29.dahlia",
    created: 1_786_705_200,
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
  } as Stripe.Event;
}

function checkoutSession(): Stripe.Checkout.Session {
  return {
    id: "cs_test_order_1",
    object: "checkout.session",
    amount_total: 4_580,
    client_reference_id: "11111111-1111-4111-8111-111111111111",
    currency: "aud",
    livemode: false,
    metadata: { order_id: "11111111-1111-4111-8111-111111111111" },
    payment_intent: "pi_test_order_1",
    payment_status: "paid",
    status: "complete",
  } as unknown as Stripe.Checkout.Session;
}

function refund(): Stripe.Refund {
  return {
    id: "re_test_1",
    object: "refund",
    amount: 1_000,
    currency: "aud",
    metadata: { order_id: "11111111-1111-4111-8111-111111111111" },
    payment_intent: "pi_test_order_1",
    status: "succeeded",
  } as unknown as Stripe.Refund;
}
