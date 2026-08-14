import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  Receipt,
} from "lucide-react";
import { useEffect } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { getPublicOrderByPaymentSessionFn } from "@/api/ordering";
import { useCart } from "@/lib/cart-store";
import { formatAUD, restaurant } from "@/lib/restaurant";

export const Route = createFileRoute("/order-confirmation")({
  validateSearch: z.object({ session_id: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Order Status | Seoul Table" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Confirmation,
});

function Confirmation() {
  const { session_id: sessionId } = Route.useSearch();
  const clearCart = useCart((state) => state.clear);
  const orderQuery = useQuery({
    queryKey: ["public-order", "payment-session", sessionId],
    enabled: Boolean(sessionId),
    queryFn: async () => {
      const result = await getPublicOrderByPaymentSessionFn({
        data: { sessionId: sessionId! },
      });
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
    refetchInterval: (query) => {
      const paymentStatus = query.state.data?.paymentStatus;
      return paymentStatus === "pending" || paymentStatus === "unpaid"
        ? 1_500
        : false;
    },
  });

  const order = orderQuery.data;
  const paymentConfirmed =
    order?.paymentStatus === "paid" ||
    order?.paymentStatus === "partially_refunded";

  useEffect(() => {
    if (paymentConfirmed) clearCart();
  }, [clearCart, paymentConfirmed]);

  if (!sessionId) {
    return <MissingOrder message="This confirmation link is incomplete." />;
  }

  if (orderQuery.isPending) {
    return <VerifyingPayment />;
  }

  if (orderQuery.isError || !order) {
    return (
      <MissingOrder
        message={
          orderQuery.error instanceof Error
            ? orderQuery.error.message
            : "The order could not be loaded."
        }
      />
    );
  }

  const isVerifying =
    order.paymentStatus === "pending" || order.paymentStatus === "unpaid";
  const needsAttention =
    order.status === "expired" ||
    order.status === "cancelled" ||
    order.paymentStatus === "failed" ||
    order.paymentStatus === "refunded";

  return (
    <div className="container-page max-w-3xl py-14">
      <div className="rounded-3xl border border-border bg-card p-8 shadow-card">
        {isVerifying ? (
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        ) : needsAttention ? (
          <div className="grid h-14 w-14 place-items-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="h-8 w-8" />
          </div>
        ) : (
          <div className="grid h-14 w-14 place-items-center rounded-full bg-green/15 text-green">
            <CheckCircle2 className="h-8 w-8" />
          </div>
        )}

        <h1 className="mt-4 font-display text-3xl font-extrabold md:text-4xl">
          {confirmationHeading(order.status, order.paymentStatus)}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {confirmationMessage(order.status, order.paymentStatus, order.maskedEmail)}
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Order number
            </p>
            <p className="font-display text-xl font-bold">{order.orderNumber}</p>
          </div>
          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="flex items-center gap-1 text-xs uppercase tracking-widest text-muted-foreground">
              <Clock className="h-3 w-3" /> Pickup time
            </p>
            <p className="font-display text-base font-bold">
              {formatPickupTime(order.pickupAt)}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="flex items-center gap-1 text-xs uppercase tracking-widest text-muted-foreground">
              <MapPin className="h-3 w-3" /> Pickup at
            </p>
            <p className="text-sm font-medium">{restaurant.address.line1}</p>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <Receipt className="h-5 w-5" /> Order summary
          </h2>
          <ul className="mt-3 divide-y divide-border">
            {order.lines.map((line) => (
              <li
                key={line.clientLineId}
                className="flex justify-between gap-3 py-2 text-sm"
              >
                <span>
                  <span className="font-semibold">{line.quantity}×</span> {line.name}
                  {line.modifiers.length > 0 && (
                    <span className="text-muted-foreground">
                      {" "}— {line.modifiers.map((modifier) => modifier.optionName).join(", ")}
                    </span>
                  )}
                </span>
                <span className="font-medium">{formatAUD(line.lineTotalCents)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatAUD(order.totals.subtotalCents)}</span>
            </div>
            {order.totals.discountCents > 0 && (
              <div className="flex justify-between text-green">
                <span>Discount</span>
                <span>−{formatAUD(order.totals.discountCents)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1 font-display text-xl font-bold">
              <span>Total</span>
              <span>{formatAUD(order.totals.totalCents)}</span>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild className="bg-primary text-primary-foreground hover:bg-primary-dark">
            <Link to="/track-order" search={{ t: order.trackingToken }}>
              Track order
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/order">Return to menu</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function VerifyingPayment() {
  return (
    <div className="container-page py-20 text-center">
      <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
      <h1 className="mt-5 font-display text-3xl font-bold">Verifying payment</h1>
      <p className="mt-2 text-muted-foreground">
        Stripe has returned you to the restaurant. We are waiting for the signed payment confirmation.
      </p>
    </div>
  );
}

function MissingOrder({ message }: { message: string }) {
  return (
    <div className="container-page py-20 text-center">
      <h1 className="font-display text-3xl font-bold">Order not available</h1>
      <p className="mt-2 text-muted-foreground">{message}</p>
      <Button asChild className="mt-6">
        <Link to="/order">Back to menu</Link>
      </Button>
    </div>
  );
}

function confirmationHeading(status: string, paymentStatus: string): string {
  if (status === "expired" || status === "cancelled") return "This order needs attention";
  if (paymentStatus === "refunded") return "Payment refunded";
  if (paymentStatus === "failed") return "Payment was not completed";
  if (paymentStatus === "pending" || paymentStatus === "unpaid") {
    return "Verifying your payment";
  }
  return "Thanks — payment confirmed!";
}

function confirmationMessage(
  status: string,
  paymentStatus: string,
  maskedEmail: string,
): string {
  if ((status === "expired" || status === "cancelled") && paymentStatus === "paid") {
    return `Payment arrived after this order closed. Please contact the restaurant and quote your order number. Receipt email: ${maskedEmail}.`;
  }
  if (status === "expired" || status === "cancelled") {
    return "The pickup slot was released. Your card has not been confirmed for kitchen fulfilment.";
  }
  if (paymentStatus === "refunded") return "Stripe has recorded a refund for this order.";
  if (paymentStatus === "failed") return "No kitchen order was created. Please return to the menu and try again.";
  if (paymentStatus === "pending" || paymentStatus === "unpaid") {
    return "Do not close this page. The status will update automatically when the signed Stripe webhook arrives.";
  }
  return `The kitchen can now see your paid pickup order. Receipt email: ${maskedEmail}.`;
}

function formatPickupTime(value: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
