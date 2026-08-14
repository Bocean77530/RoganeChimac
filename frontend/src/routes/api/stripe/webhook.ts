import { createFileRoute } from "@tanstack/react-router";

import {
  StripeWebhookModeMismatchError,
  StripeWebhookVerificationError,
} from "@/integrations/payments/stripe-webhook.server";
import { processStripeWebhook } from "@/server/payments.server";

const MAX_WEBHOOK_BYTES = 1_048_576;

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const contentLength = Number(request.headers.get("content-length"));
        if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BYTES) {
          return Response.json({ received: false, error: "payload_too_large" }, { status: 413 });
        }

        const signature = request.headers.get("stripe-signature");
        if (!signature) {
          return Response.json({ received: false, error: "missing_signature" }, { status: 400 });
        }

        const rawBody = await request.text();
        if (new TextEncoder().encode(rawBody).byteLength > MAX_WEBHOOK_BYTES) {
          return Response.json({ received: false, error: "payload_too_large" }, { status: 413 });
        }

        try {
          const result = await processStripeWebhook({ rawBody, signature });
          if (!result.ok) {
            console.error("Stripe webhook persistence rejected an event", {
              code: result.error.code,
              retryable: result.error.retryable,
              correlationId: result.error.correlationId,
            });

            if (result.error.retryable) {
              return Response.json(
                { received: false, error: "temporarily_unavailable" },
                { status: 503 },
              );
            }

            // A valid but permanently unprocessable event must not retry forever.
            return Response.json({ received: true, accepted: false });
          }

          return Response.json({
            received: true,
            duplicate: result.data.duplicate,
          });
        } catch (error) {
          if (
            error instanceof StripeWebhookVerificationError ||
            error instanceof StripeWebhookModeMismatchError
          ) {
            return Response.json({ received: false, error: "invalid_webhook" }, { status: 400 });
          }

          console.error("Stripe webhook processing failed", {
            message: error instanceof Error ? error.message : "Unknown error",
          });
          return Response.json(
            { received: false, error: "temporarily_unavailable" },
            { status: 503 },
          );
        }
      },
    },
  },
});
