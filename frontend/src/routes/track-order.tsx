import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { Clock } from "lucide-react";
import { getOrder, progressLabels, progressSteps, type SavedOrder } from "@/lib/order-api";
import { restaurant } from "@/lib/restaurant";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/track-order")({
  validateSearch: z.object({ n: z.string().optional(), k: z.string().optional() }),
  head: () => ({
    meta: [{ title: "Track Order | Seoul Table" }, { name: "robots", content: "noindex" }],
  }),
  component: TrackOrder,
});

function TrackOrder() {
  const { n, k } = Route.useSearch();
  const [order, setOrder] = useState<SavedOrder | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    if (!n || !k) return;
    setRefreshing(true);
    setError("");
    try { setOrder(await getOrder(n, k)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load order"); }
    finally { setRefreshing(false); }
  }, [n, k]);
  useEffect(() => {
    setOrder(null);
    setError("");
    if (!n || !k) {
      setError("Open the status link from your order confirmation.");
      return;
    }
    void refresh();
  }, [n, k, refresh]);

  if (!order)
    return (
      <div className="container-page py-20 text-center">
        <h1 className="font-display text-3xl font-bold">Track your order</h1>
        <p className="mt-2 text-muted-foreground">{error || "Loading order…"}</p>
        {error && (
          <Button asChild className="mt-6">
            <Link to="/order">Start an order</Link>
          </Button>
        )}
      </div>
    );

  const statusLabel =
    order.status === "paid"
      ? "Demo payment succeeded"
      : order.status === "payment_failed"
        ? "Demo payment failed"
        : "Awaiting demo payment";
  const statusDescription =
    order.status === "paid"
      ? "Demo payment succeeded. Refresh this page after the restaurant updates your order. No real charge was made."
      : order.status === "payment_failed"
        ? "No print jobs were created. Open your order confirmation link to retry the demo payment."
        : "No print jobs have been created. Open your order confirmation link to simulate payment.";

  return (
    <div className="container-page py-14 max-w-2xl">
      <p className="text-xs uppercase tracking-widest text-primary font-bold">
        Order {order.orderNumber}
      </p>
      <h1 className="mt-1 font-display text-3xl md:text-4xl font-extrabold">{statusLabel}</h1>
      <p className="mt-2 text-muted-foreground flex items-center gap-2">
        <Clock className="h-4 w-4" /> Order saved {new Date(order.placedAt).toLocaleString("en-AU")}
      </p>
      <div className="mt-8 rounded-2xl border border-border bg-card p-5">
        <p className="font-semibold">Status: {statusLabel}</p>
        <p className="mt-2 text-sm text-muted-foreground">{statusDescription}</p>
        {order.paidAt && (
          <p className="mt-2 text-sm">
            Simulated at {new Date(order.paidAt).toLocaleString("en-AU")}
          </p>
        )}
        <p className="mt-3 text-sm">
          {order.method === "pickup"
            ? `Pickup at ${restaurant.address.line1}`
            : `Delivery to ${order.deliveryAddress}`}
        </p>
      </div>
      {order.status === "paid" && order.fulfillmentStatus && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display text-xl font-bold">Order progress</h2>
          <ol className="mt-4 space-y-3">
            {progressSteps[order.method].map((step, index, steps) => {
              const current = (steps as readonly string[]).indexOf(order.fulfillmentStatus ?? "");
              return <li key={step} className={index <= current ? "font-semibold text-foreground" : "text-muted-foreground"}>
                {index <= current ? "✓" : "○"} {progressLabels[step]}
              </li>;
            })}
          </ol>
          {order.fulfillmentUpdatedAt && <p className="mt-4 text-sm text-muted-foreground">
            Updated {new Date(order.fulfillmentUpdatedAt).toLocaleString("en-AU")}
          </p>}
          <Button className="mt-4" variant="outline" disabled={refreshing} onClick={() => void refresh()}>
            {refreshing ? "Refreshing…" : "Refresh status"}
          </Button>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </div>
      )}
      {order.status !== "paid" && (
        <Button asChild className="mt-6">
          <Link to="/order-confirmation" search={{ n: order.orderNumber, k: order.accessToken }}>
            Open demo payment
          </Link>
        </Button>
      )}
      <div className="mt-6 rounded-2xl border border-border bg-card p-5">
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
