import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

import type { PaymentSessionInput } from "@/domain/payment";
import { StripePaymentProvider, stripeCheckoutIdempotencyKey } from "../stripe.server";

describe("StripePaymentProvider", () => {
  it("creates an AUD Embedded Checkout Session with safe metadata", async () => {
    const create = vi.fn().mockResolvedValue(stripeSession());
    const provider = providerWith({
      checkout: {
        sessions: {
          create,
          retrieve: vi.fn(),
          expire: vi.fn(),
        },
      },
      webhooks: {},
    });

    const result = await provider.createSession(sessionInput());

    expect(result).toEqual({
      provider: "stripe",
      sessionId: "cs_test_order_1",
      launch: { kind: "embedded", clientSecret: "cs_test_secret_order_1" },
      expiresAt: "2026-08-14T11:30:00.000Z",
    });
    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        ui_mode: "embedded_page",
        payment_method_types: ["card"],
        client_reference_id: "11111111-1111-4111-8111-111111111111",
        customer_email: "customer@example.com",
        expires_at: 1_786_707_000,
        return_url:
          "https://orders.example.com/order-confirmation?session_id={CHECKOUT_SESSION_ID}",
        line_items: [
          {
            price_data: {
              currency: "aud",
              unit_amount: 4_580,
              product_data: {
                name: "Pickup order ST-1001",
                description: "2 items",
              },
            },
            quantity: 1,
          },
        ],
        metadata: {
          order_id: "11111111-1111-4111-8111-111111111111",
          order_number: "ST-1001",
          payment_attempt: "1",
          schema_version: "1",
        },
      }),
      {
        idempotencyKey: "checkout-session:11111111-1111-4111-8111-111111111111:1",
      },
    );

    const stripeParams = create.mock.calls[0]?.[0];
    expect(JSON.stringify(stripeParams.metadata)).not.toContain("customer@example.com");
    expect(JSON.stringify(stripeParams.metadata)).not.toContain("phone");
    expect(JSON.stringify(stripeParams.metadata)).not.toContain("notes");
  });

  it("rejects an idempotency key that is not derived from order and attempt", async () => {
    const create = vi.fn();
    const provider = providerWith({
      checkout: {
        sessions: {
          create,
          retrieve: vi.fn(),
          expire: vi.fn(),
        },
      },
      webhooks: {},
    });

    await expect(
      provider.createSession({
        ...sessionInput(),
        idempotencyKey: "random-browser-value",
      }),
    ).rejects.toThrow("idempotency key is not stable");
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects invalid money before calling Stripe", async () => {
    const create = vi.fn();
    const provider = providerWith({
      checkout: {
        sessions: {
          create,
          retrieve: vi.fn(),
          expire: vi.fn(),
        },
      },
      webhooks: {},
    });

    await expect(
      provider.createSession({
        ...sessionInput(),
        total: { currency: "AUD", amountCents: 45.8 },
      }),
    ).rejects.toThrow("positive integer");
    expect(create).not.toHaveBeenCalled();
  });

  it("uses a stable, deterministic Stripe idempotency key", () => {
    expect(stripeCheckoutIdempotencyKey("11111111-1111-4111-8111-111111111111", 2)).toBe(
      "checkout-session:11111111-1111-4111-8111-111111111111:2",
    );
  });
});

function providerWith(stripeClient: object) {
  return new StripePaymentProvider({
    secretKey: "sk_test_example",
    expectedLivemode: false,
    stripeClient: stripeClient as Stripe,
  });
}

function sessionInput(): PaymentSessionInput {
  const orderId = "11111111-1111-4111-8111-111111111111";
  return {
    orderId,
    orderNumber: "ST-1001",
    paymentAttempt: 1,
    total: { currency: "AUD", amountCents: 4_580 },
    itemCount: 2,
    customerEmail: "customer@example.com",
    returnUrl: "https://orders.example.com/order-confirmation?session_id={CHECKOUT_SESSION_ID}",
    expiresAt: "2026-08-14T11:30:00.000Z",
    idempotencyKey: stripeCheckoutIdempotencyKey(orderId, 1),
  };
}

function stripeSession(): Stripe.Checkout.Session {
  return {
    id: "cs_test_order_1",
    object: "checkout.session",
    client_secret: "cs_test_secret_order_1",
    expires_at: 1_786_707_000,
    livemode: false,
    payment_status: "unpaid",
    status: "open",
  } as Stripe.Checkout.Session;
}
