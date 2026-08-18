import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, Circle, Clock, Loader2 } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { getPublicOrderFn } from "@/api/ordering";
import type { OrderStatus } from "@/domain/order";
import { restaurant } from "@/lib/restaurant";

export const Route = createFileRoute("/track-order")({
  validateSearch: z.object({ t: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Track Pickup Order | Rogane Chimac" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: TrackOrder,
});

const steps = [
  "Payment confirmed",
  "Accepted by kitchen",
  "Preparing",
  "Ready for pickup",
  "Collected",
] as const;

const stepByStatus: Partial<Record<OrderStatus, number>> = {
  paid: 0,
  accepted: 1,
  preparing: 2,
  ready: 3,
  collected: 4,
};

function TrackOrder() {
  const { t: trackingToken } = Route.useSearch();
  const orderQuery = useQuery({
    queryKey: ["public-order", "tracking-token", trackingToken],
    enabled: Boolean(trackingToken),
    queryFn: async () => {
      const result = await getPublicOrderFn({
        data: { trackingToken: trackingToken! },
      });
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "collected" || status === "cancelled" || status === "expired"
        ? false
        : 5_000;
    },
  });

  if (!trackingToken) {
    return (
      <TrackingUnavailable message="Open the private tracking link from your confirmation page." />
    );
  }

  if (orderQuery.isPending) {
    return (
      <div className="container-page py-20 text-center">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
        <h1 className="mt-5 font-display text-3xl font-bold">Loading order status</h1>
      </div>
    );
  }

  if (orderQuery.isError || !orderQuery.data) {
    return (
      <TrackingUnavailable
        message={
          orderQuery.error instanceof Error
            ? orderQuery.error.message
            : "The tracking link is invalid or has expired."
        }
      />
    );
  }

  const order = orderQuery.data;
  const currentStep = stepByStatus[order.status] ?? -1;
  const terminalProblem = order.status === "cancelled" || order.status === "expired";

  return (
    <div className="container-page max-w-2xl py-14">
      <p className="text-xs font-bold uppercase tracking-widest text-primary">
        Order {order.orderNumber}
      </p>
      <h1 className="mt-1 font-display text-3xl font-extrabold md:text-4xl">
        {statusHeading(order.status)}
      </h1>
      <p className="mt-2 flex items-center gap-2 text-muted-foreground">
        <Clock className="h-4 w-4" /> Pickup {formatPickupTime(order.pickupAt)} at{" "}
        {restaurant.address.line1}
      </p>

      {terminalProblem && (
        <div className="mt-6 flex gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
          <p>
            This order is {order.status}. Please call the restaurant before travelling to collect
            it.
          </p>
        </div>
      )}

      <ol className="mt-8 space-y-4">
        {steps.map((label, index) => {
          const done = index <= currentStep;
          const active = index === currentStep;
          return (
            <li key={label} className="flex items-center gap-3">
              {done ? (
                <CheckCircle2 className="h-6 w-6 text-primary" />
              ) : (
                <Circle className="h-6 w-6 text-border" />
              )}
              <span
                className={`font-medium ${done ? "" : "text-muted-foreground"} ${active ? "font-bold" : ""}`}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-10 rounded-2xl border border-border bg-card p-5">
        <p className="text-sm">
          <strong>Need help?</strong> Call us on{" "}
          <a href={`tel:${restaurant.phone}`} className="text-primary">
            {restaurant.phone}
          </a>
          .
        </p>
      </div>
    </div>
  );
}

function TrackingUnavailable({ message }: { message: string }) {
  return (
    <div className="container-page py-20 text-center">
      <h1 className="font-display text-3xl font-bold">Track your pickup order</h1>
      <p className="mt-2 text-muted-foreground">{message}</p>
      <Button asChild className="mt-6">
        <Link to="/order">Start an order</Link>
      </Button>
    </div>
  );
}

function statusHeading(status: OrderStatus): string {
  switch (status) {
    case "pending_payment":
      return "Waiting for payment";
    case "paid":
      return "Payment confirmed";
    case "accepted":
      return "The kitchen accepted your order";
    case "preparing":
      return "Your order is being prepared";
    case "ready":
      return "Ready for pickup";
    case "collected":
      return "Order collected";
    case "expired":
      return "This order expired";
    case "cancelled":
      return "This order was cancelled";
  }
}

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
