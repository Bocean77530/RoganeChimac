import "@tanstack/react-start/server-only";

import Stripe from "stripe";

import type {
  NormalizedPaymentEvent,
  PaymentProvider,
  PaymentSession,
  PaymentSessionInput,
} from "@/domain/payment";
import { verifyAndNormalizeStripeWebhook } from "./stripe-webhook.server";

export const STRIPE_PROVIDER = "stripe";
export const STRIPE_CHECKOUT_EXPIRY_MINUTES = 30;
export const STRIPE_API_VERSION = "2026-07-29.dahlia" as const;

type StripeClient = Pick<Stripe, "checkout" | "webhooks">;

export type StripePaymentProviderOptions = {
  secretKey: string;
  webhookSecret?: string;
  expectedLivemode: boolean;
  stripeClient?: StripeClient;
};

export class StripePaymentProvider implements PaymentProvider {
  readonly key = STRIPE_PROVIDER;

  private readonly stripe: StripeClient;
  private readonly webhookSecret?: string;
  private readonly expectedLivemode: boolean;

  constructor(options: StripePaymentProviderOptions) {
    assertSecretMatchesMode(options.secretKey, options.expectedLivemode);

    this.webhookSecret = options.webhookSecret;
    this.expectedLivemode = options.expectedLivemode;
    this.stripe =
      options.stripeClient ??
      new Stripe(options.secretKey, {
        apiVersion: STRIPE_API_VERSION,
        httpClient: Stripe.createFetchHttpClient(),
        maxNetworkRetries: 2,
        typescript: true,
      });
  }

  async createSession(input: PaymentSessionInput): Promise<PaymentSession> {
    validateSessionInput(input);

    const expectedIdempotencyKey = stripeCheckoutIdempotencyKey(
      input.orderId,
      input.paymentAttempt,
    );
    if (input.idempotencyKey !== expectedIdempotencyKey) {
      throw new Error("Stripe Checkout idempotency key is not stable");
    }

    const expiresAt = parseStripeExpiry(input.expiresAt);
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: "payment",
        ui_mode: "embedded",
        payment_method_types: ["card"],
        client_reference_id: input.orderId,
        customer_email: input.customerEmail,
        expires_at: expiresAt,
        return_url: input.returnUrl,
        line_items: [
          {
            price_data: {
              currency: "aud",
              unit_amount: input.total.amountCents,
              product_data: {
                name: `Pickup order ${input.orderNumber}`,
                description: `${input.itemCount} item${input.itemCount === 1 ? "" : "s"}`,
              },
            },
            quantity: 1,
          },
        ],
        metadata: stripeOrderMetadata(input),
        payment_intent_data: {
          metadata: stripeOrderMetadata(input),
        },
      },
      { idempotencyKey: input.idempotencyKey },
    );

    return sessionToPaymentSession(session, this.expectedLivemode);
  }

  async retrieveSession(sessionId: string) {
    const session = await this.retrieveStripeSession(sessionId);
    const currency = session.currency?.toUpperCase();

    return {
      sessionId: session.id,
      status: checkoutSessionStatus(session.status),
      paymentStatus: checkoutPaymentStatus(session.payment_status),
      orderId: session.metadata?.order_id || session.client_reference_id || undefined,
      total:
        currency === "AUD" && session.amount_total != null
          ? { currency: "AUD" as const, amountCents: session.amount_total }
          : undefined,
    };
  }

  async retrieveSessionForLaunch(sessionId: string): Promise<PaymentSession> {
    const session = await this.retrieveStripeSession(sessionId);
    return sessionToPaymentSession(session, this.expectedLivemode);
  }

  async expireSession(input: { sessionId: string; idempotencyKey: string }): Promise<void> {
    await this.stripe.checkout.sessions.expire(
      input.sessionId,
      {},
      { idempotencyKey: input.idempotencyKey },
    );
  }

  async verifyAndNormalizeWebhook(input: {
    rawBody: string;
    signature: string;
  }): Promise<NormalizedPaymentEvent> {
    if (!this.webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
    }

    return verifyAndNormalizeStripeWebhook({
      stripe: this.stripe,
      webhookSecret: this.webhookSecret,
      rawBody: input.rawBody,
      signature: input.signature,
      expectedLivemode: this.expectedLivemode,
    });
  }

  private async retrieveStripeSession(sessionId: string) {
    if (!sessionId.startsWith("cs_")) {
      throw new Error("Invalid Stripe Checkout Session ID");
    }

    const session = await this.stripe.checkout.sessions.retrieve(sessionId);
    assertSessionMode(session, this.expectedLivemode);
    return session;
  }
}

export function createStripePaymentProviderFromEnv(options?: {
  requireWebhookSecret?: boolean;
}): StripePaymentProvider {
  // Read at request time. Cloudflare Workers inject server env per request.
  const secretKey = requiredEnv("STRIPE_SECRET_KEY");
  const expectedLivemode = parseBooleanEnv(
    "PAYMENTS_EXPECT_LIVEMODE",
    process.env.PAYMENTS_EXPECT_LIVEMODE,
  );
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (options?.requireWebhookSecret && !webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }

  return new StripePaymentProvider({
    secretKey,
    webhookSecret,
    expectedLivemode,
  });
}

export function stripeCheckoutIdempotencyKey(orderId: string, paymentAttempt: number): string {
  if (!orderId || !Number.isSafeInteger(paymentAttempt) || paymentAttempt < 1) {
    throw new Error("Cannot create Stripe idempotency key");
  }
  return `checkout-session:${orderId}:${paymentAttempt}`;
}

function stripeOrderMetadata(input: PaymentSessionInput) {
  return {
    order_id: input.orderId,
    order_number: input.orderNumber,
    payment_attempt: String(input.paymentAttempt),
    schema_version: "1",
  };
}

function sessionToPaymentSession(
  session: Stripe.Checkout.Session,
  expectedLivemode: boolean,
): PaymentSession {
  assertSessionMode(session, expectedLivemode);
  if (!session.client_secret) {
    throw new Error("Stripe did not return an Embedded Checkout client secret");
  }

  return {
    provider: STRIPE_PROVIDER,
    sessionId: session.id,
    launch: { kind: "embedded", clientSecret: session.client_secret },
    expiresAt: new Date(session.expires_at * 1_000).toISOString(),
  };
}

function assertSessionMode(session: Stripe.Checkout.Session, expectedLivemode: boolean) {
  if (session.livemode !== expectedLivemode) {
    throw new Error("Stripe Checkout Session mode mismatch");
  }
}

function checkoutSessionStatus(status: Stripe.Checkout.Session.Status | null) {
  if (status === "complete" || status === "expired") return status;
  return "open" as const;
}

function checkoutPaymentStatus(
  status: Stripe.Checkout.Session.PaymentStatus,
): "unpaid" | "paid" | "no_payment_required" {
  if (status === "paid") return "paid";
  if (status === "no_payment_required") return "no_payment_required";
  return "unpaid";
}

function validateSessionInput(input: PaymentSessionInput) {
  if (input.total.currency !== "AUD") {
    throw new Error("Stripe Checkout only accepts AUD for this integration");
  }
  if (!Number.isSafeInteger(input.total.amountCents) || input.total.amountCents <= 0) {
    throw new Error("Stripe Checkout amount must be a positive integer");
  }
  if (!Number.isSafeInteger(input.itemCount) || input.itemCount < 1) {
    throw new Error("Stripe Checkout item count must be a positive integer");
  }
  if (!input.orderId || !input.orderNumber || !input.customerEmail) {
    throw new Error("Stripe Checkout order details are incomplete");
  }

  const returnUrl = new URL(input.returnUrl);
  const isLocalHttp =
    returnUrl.protocol === "http:" &&
    (returnUrl.hostname === "localhost" || returnUrl.hostname === "127.0.0.1");
  if (returnUrl.protocol !== "https:" && !isLocalHttp) {
    throw new Error("Stripe Checkout return URL must use HTTPS");
  }
  if (!input.returnUrl.includes("{CHECKOUT_SESSION_ID}")) {
    throw new Error("Stripe Checkout return URL is missing its Session ID token");
  }
}

function parseStripeExpiry(value: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error("Stripe Checkout expiry is invalid");
  }
  return Math.floor(timestamp / 1_000);
}

function assertSecretMatchesMode(secretKey: string, expectedLivemode: boolean) {
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is not configured");

  const mode = secretKey.match(/^[sr]k_(test|live)_/)?.[1];
  if (mode && (mode === "live") !== expectedLivemode) {
    throw new Error("Stripe secret key mode does not match this deployment");
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function parseBooleanEnv(name: string, value: string | undefined): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be explicitly set to true or false`);
}
