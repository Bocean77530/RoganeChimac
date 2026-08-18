import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CreditCard, Loader2, LockKeyhole, MapPin } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { StripeEmbeddedCheckout } from "@/components/checkout/StripeEmbeddedCheckout";
import {
  createPendingOrderFn,
  createStripeCheckoutSessionFn,
  getPickupAvailabilityFn,
  quoteOrderFn,
} from "@/api/ordering";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { OrderTotalsSnapshot } from "@/domain/order";
import { computeTotals, useCart } from "@/lib/cart-store";
import { formatAUD, restaurant } from "@/lib/restaurant";

const RESTAURANT_SLUG = restaurant.slug;
const TERMS_VERSION = "2026-08-14";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Secure Pickup Checkout | Rogane Chimac" },
      {
        name: "description",
        content: "Choose a pickup time and pay securely with Stripe.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: CheckoutPage,
});

const customerSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(80),
  phone: z.string().trim().min(8, "Please enter a valid mobile number").max(20),
  email: z.string().trim().email("Please enter a valid email").max(120),
  notes: z.string().trim().max(300).optional(),
});

type PaymentStage = {
  orderId: string;
  orderNumber: string;
  trackingToken: string;
  sessionId: string;
  clientSecret: string;
  pickupAt: string;
  totals: OrderTotalsSnapshot;
};

function CheckoutPage() {
  const navigate = useNavigate();
  const { lines, promoCode, setPromoCode } = useCart();
  const previewTotals = computeTotals({
    lines,
    promoCode,
  });
  const checkoutAttemptId = useRef<string | null>(null);

  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });
  const [terms, setTerms] = useState(false);
  const [pickupChoice, setPickupChoice] = useState("asap");
  const [promoInput, setPromoInput] = useState(promoCode ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [paymentStage, setPaymentStage] = useState<PaymentStage | null>(null);

  const availabilityQuery = useQuery({
    queryKey: ["pickup-availability", RESTAURANT_SLUG],
    queryFn: async () => {
      const result = await getPickupAvailabilityFn({
        data: { restaurantSlug: RESTAURANT_SLUG },
      });
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const slots = availabilityQuery.data?.slots ?? [];
  const canOrder = availabilityQuery.data?.orderingEnabled === true && slots.length > 0;

  if (paymentStage) {
    return (
      <div className="container-page grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            Order {paymentStage.orderNumber}
          </p>
          <h1 className="mt-1 font-display text-3xl font-extrabold">Complete secure payment</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your pickup slot is held while this Stripe Sandbox checkout is open.
          </p>
          <StripeEmbeddedCheckout
            clientSecret={paymentStage.clientSecret}
            className="mt-6"
            onComplete={() =>
              navigate({
                to: "/order-confirmation",
                search: { session_id: paymentStage.sessionId },
              })
            }
          />
        </section>

        <aside className="h-fit rounded-3xl border border-border bg-card p-5 shadow-card lg:sticky lg:top-40">
          <h2 className="font-display text-lg font-bold">Payment summary</h2>
          <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
            Pickup {formatPickupTime(paymentStage.pickupAt)} at {restaurant.address.line1}
          </p>
          <div className="mt-5 space-y-1 border-t border-border pt-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatAUD(paymentStage.totals.subtotalCents)}</span>
            </div>
            {paymentStage.totals.discountCents > 0 && (
              <div className="flex justify-between text-green">
                <span>Discount</span>
                <span>−{formatAUD(paymentStage.totals.discountCents)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1 font-display text-xl font-bold">
              <span>Total</span>
              <span>{formatAUD(paymentStage.totals.totalCents)}</span>
            </div>
          </div>
          <p className="mt-4 flex gap-2 text-xs text-muted-foreground">
            <LockKeyhole className="h-4 w-4 shrink-0" />
            Card details are sent directly to Stripe and never pass through this website.
          </p>
        </aside>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="container-page py-20 text-center">
        <h1 className="font-display text-3xl font-bold">Your cart is empty</h1>
        <p className="mt-2 text-muted-foreground">Add something from the menu first.</p>
        <Button asChild className="mt-6">
          <Link to="/order">Browse menu</Link>
        </Button>
      </div>
    );
  }

  const applyPromo = () => {
    const code = promoInput.trim().toUpperCase();
    setPromoCode(code || null);
    toast.success(code ? `${code} will be validated before payment` : "Promo code cleared");
  };

  const continueToPayment = async () => {
    const parsed = customerSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check your details");
      return;
    }
    if (!terms) {
      toast.error("Please accept the ordering terms");
      return;
    }
    if (!canOrder) {
      toast.error("No pickup times are currently available");
      return;
    }

    setSubmitting(true);
    try {
      const quote = await quoteOrderFn({
        data: {
          restaurantSlug: RESTAURANT_SLUG,
          fulfillment:
            pickupChoice === "asap"
              ? { type: "pickup", mode: "asap" }
              : { type: "pickup", mode: "scheduled", slotId: pickupChoice },
          lines: lines.map((line) => ({
            clientLineId: line.lineId,
            menuItemId: line.itemId,
            quantity: line.quantity,
            modifierOptionIds: line.modifiers.map((modifier) => modifier.optionId),
            notes: line.notes,
          })),
          promoCode: promoCode || undefined,
        },
      });
      if (!quote.ok) throw new CheckoutError(quote.error.message);

      checkoutAttemptId.current ??= crypto.randomUUID();
      const order = await createPendingOrderFn({
        data: {
          quoteId: quote.data.quoteId,
          attemptId: checkoutAttemptId.current,
          customer: {
            name: parsed.data.name,
            phone: parsed.data.phone,
            email: parsed.data.email,
          },
          notes: parsed.data.notes || undefined,
          termsAccepted: true,
          termsVersion: TERMS_VERSION,
        },
      });
      if (!order.ok) throw new CheckoutError(order.error.message);

      const checkout = await createStripeCheckoutSessionFn({
        data: { orderId: order.data.id },
      });
      if (!checkout.ok) throw new CheckoutError(checkout.error.message);

      if (checkout.data.session.launch.kind === "redirect") {
        window.location.assign(checkout.data.session.launch.url);
        return;
      }

      setPaymentStage({
        orderId: order.data.id,
        orderNumber: order.data.orderNumber,
        trackingToken: order.data.trackingToken,
        sessionId: checkout.data.session.sessionId,
        clientSecret: checkout.data.session.launch.clientSecret,
        pickupAt: order.data.pickupAt,
        totals: order.data.totals,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Checkout could not be started. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container-page grid gap-8 py-10 lg:grid-cols-[1fr_400px]">
      <div className="space-y-8">
        <h1 className="font-display text-3xl font-extrabold md:text-4xl">Checkout</h1>

        <section className="rounded-3xl border border-border bg-card p-5">
          <h2 className="font-display text-lg font-bold">1. Pickup time</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pickup from {restaurant.address.line1}, {restaurant.address.suburb}.
          </p>
          <div className="mt-4">
            <Label htmlFor="pickup-time">When</Label>
            <select
              id="pickup-time"
              value={pickupChoice}
              onChange={(event) => setPickupChoice(event.target.value)}
              disabled={availabilityQuery.isPending || !canOrder}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="asap">
                {slots[0]
                  ? `ASAP — ${slots[0].localLabel}`
                  : availabilityQuery.isPending
                    ? "Loading pickup times…"
                    : "No pickup times available"}
              </option>
              {slots.slice(1).map((slot) => (
                <option key={slot.id} value={slot.id}>
                  {slot.localLabel} · {slot.remaining} remaining
                </option>
              ))}
            </select>
            {availabilityQuery.isError && (
              <p className="mt-2 text-sm text-destructive">
                {availabilityQuery.error instanceof Error
                  ? availabilityQuery.error.message
                  : "Pickup times could not be loaded."}
              </p>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-5">
          <h2 className="font-display text-lg font-bold">2. Your details</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                autoComplete="name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="phone">Mobile</Label>
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="notes">Order notes (optional)</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                maxLength={300}
                placeholder="Allergies or pickup notes"
              />
            </div>
          </div>
        </section>

        <section className="rounded-3xl border-2 border-primary/30 bg-primary/5 p-5">
          <div className="flex items-start gap-3">
            <CreditCard className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <h2 className="font-display text-lg font-bold">3. Pay online</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Secure Stripe Sandbox payment. Eligible wallets are shown automatically by Stripe.
              </p>
            </div>
          </div>
        </section>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={terms}
            onChange={(event) => setTerms(event.target.checked)}
            className="mt-1 h-4 w-4 accent-primary"
          />
          <span>
            I agree to Rogane Chimac&apos;s{" "}
            <Link to="/terms" className="text-primary hover:underline">
              ordering terms
            </Link>{" "}
            and understand that our kitchen handles common allergens.
          </span>
        </label>
      </div>

      <aside className="h-fit rounded-3xl border border-border bg-card p-5 shadow-card lg:sticky lg:top-40">
        <h2 className="font-display text-lg font-bold">Order summary</h2>
        <ul className="mt-3 max-h-72 space-y-3 overflow-y-auto">
          {lines.map((line) => (
            <li key={line.lineId} className="flex gap-3">
              <img src={line.image} alt="" className="h-12 w-12 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {line.quantity}× {line.name}
                </p>
                {line.modifiers.length > 0 && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {line.modifiers.map((modifier) => modifier.name).join(" · ")}
                  </p>
                )}
              </div>
              <span className="text-sm font-semibold">
                {formatAUD(
                  (line.basePrice +
                    line.modifiers.reduce((sum, modifier) => sum + modifier.priceDelta, 0)) *
                    line.quantity,
                )}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex gap-2">
          <Input
            placeholder="Promo code"
            value={promoInput}
            onChange={(event) => setPromoInput(event.target.value)}
          />
          <Button variant="outline" onClick={applyPromo}>
            Apply
          </Button>
        </div>

        <div className="mt-4 space-y-1 border-t border-border pt-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Estimated subtotal</span>
            <span>{formatAUD(previewTotals.subtotal)}</span>
          </div>
          {previewTotals.discount > 0 && (
            <div className="flex justify-between text-green">
              <span>Estimated discount</span>
              <span>−{formatAUD(previewTotals.discount)}</span>
            </div>
          )}
          <div className="flex justify-between pt-1 font-display text-xl font-bold">
            <span>Estimated total</span>
            <span>{formatAUD(previewTotals.total)}</span>
          </div>
          <p className="pt-2 text-xs text-muted-foreground">
            The server validates current menu prices, modifiers, promo eligibility and pickup
            capacity before Stripe opens.
          </p>
        </div>

        <Button
          onClick={continueToPayment}
          disabled={submitting || availabilityQuery.isPending || !canOrder}
          className="mt-5 h-12 w-full bg-primary text-base font-semibold text-primary-foreground hover:bg-primary-dark"
        >
          {submitting ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Preparing payment…
            </span>
          ) : (
            "Continue to secure payment"
          )}
        </Button>
      </aside>
    </div>
  );
}

class CheckoutError extends Error {}

function formatPickupTime(value: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: restaurant.timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
