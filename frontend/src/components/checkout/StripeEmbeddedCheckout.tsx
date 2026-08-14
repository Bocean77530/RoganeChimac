import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { ClientOnly } from "@tanstack/react-router";
import { useMemo } from "react";

import { cn } from "@/lib/utils";

const stripeInstances = new Map<string, Promise<Stripe | null>>();

export type StripeEmbeddedCheckoutProps = {
  clientSecret: string;
  publishableKey?: string;
  onComplete?: () => void;
  className?: string;
};

export function StripeEmbeddedCheckout({
  clientSecret,
  publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY,
  onComplete,
  className,
}: StripeEmbeddedCheckoutProps) {
  const stripePromise = useMemo(() => stripeForPublishableKey(publishableKey), [publishableKey]);
  const options = useMemo(() => ({ clientSecret, onComplete }), [clientSecret, onComplete]);

  return (
    <div
      className={cn("min-h-96 rounded-2xl bg-card", className)}
      data-testid="stripe-embedded-checkout"
    >
      <ClientOnly fallback={<PaymentFormFallback />}>
        <EmbeddedCheckoutProvider key={clientSecret} stripe={stripePromise} options={options}>
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      </ClientOnly>
    </div>
  );
}

function stripeForPublishableKey(key: string | undefined) {
  if (!key || !key.startsWith("pk_")) {
    throw new Error("VITE_STRIPE_PUBLISHABLE_KEY is not configured");
  }

  let stripePromise = stripeInstances.get(key);
  if (!stripePromise) {
    stripePromise = loadStripe(key);
    stripeInstances.set(key, stripePromise);
  }
  return stripePromise;
}

function PaymentFormFallback() {
  return (
    <div
      className="grid min-h-96 place-items-center px-6 text-sm text-muted-foreground"
      role="status"
    >
      Loading secure payment form…
    </div>
  );
}
