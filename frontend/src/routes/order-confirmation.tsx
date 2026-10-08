import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Clock, MapPin, Receipt } from "lucide-react";
import { z } from "zod";
import { getOrder, simulateDemoPayment, type SavedOrder } from "@/lib/order-api";
import { formatAUD, restaurant } from "@/lib/restaurant";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/order-confirmation")({
  validateSearch: z.object({ n: z.string().optional(), k: z.string().optional() }),
  head: () => ({
    meta: [{ title: "Order Saved | Seoul Table" }, { name: "robots", content: "noindex" }],
  }),
  component: Confirmation,
});

function Confirmation() {
  const { n, k } = Route.useSearch();
  const [order, setOrder] = useState<SavedOrder | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [submitting, setSubmitting] = useState<"success" | "failure" | null>(null);
  useEffect(() => {
    setOrder(null);
    setError("");
    if (!n || !k) {
      setError("Order link is incomplete.");
      return;
    }
    let active = true;
    getOrder(n, k)
      .then((saved) => {
        if (active) setOrder(saved);
      })
      .catch((reason) => {
        if (active) setError(reason.message);
      });
    return () => {
      active = false;
    };
  }, [n, k]);

  const runSimulation = async (result: "success" | "failure") => {
    if (!order || submitting) return;
    setActionError("");
    setSubmitting(result);
    try {
      setOrder(await simulateDemoPayment(order.orderNumber, order.accessToken, result));
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Could not simulate payment");
    } finally {
      setSubmitting(null);
    }
  };

  if (!order)
    return (
      <div className="container-page py-20 text-center">
        <h1 className="font-display text-3xl font-bold">{error || "Loading order…"}</h1>
        {error && (
          <Button asChild className="mt-6">
            <Link to="/order">Back to menu</Link>
          </Button>
        )}
      </div>
    );

  const statusLabel =
    order.status === "paid"
      ? "Demo paid"
      : order.status === "payment_failed"
        ? "Demo payment failed"
        : "Awaiting demo payment";
  const statusDescription =
    order.status === "paid"
      ? "No real charge was made. Kitchen and front print jobs were created; a local worker may send them to printers. This page does not confirm paper output."
      : order.status === "payment_failed"
        ? "The simulated payment failed. No print jobs were created. You can retry."
        : "No payment has been simulated and no print jobs have been created.";

  return (
    <div className="container-page py-14 max-w-3xl">
      <div className="rounded-3xl border border-border bg-card p-8 shadow-card">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
          <Clock className="h-8 w-8" />
        </div>
        <h1 className="mt-4 font-display text-3xl md:text-4xl font-extrabold">Order saved</h1>
        <p className="mt-2 text-muted-foreground">
          {statusDescription} Keep this link to check the status.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-background border border-border p-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Order number</p>
            <p className="font-display text-xl font-bold">{order.orderNumber}</p>
          </div>
          <div className="rounded-2xl bg-background border border-border p-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Status</p>
            <p className="font-display text-xl font-bold">{statusLabel}</p>
          </div>
          <div className="rounded-2xl bg-background border border-border p-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" />{" "}
              {order.method === "pickup" ? "Pickup at" : "Delivery to"}
            </p>
            <p className="font-medium text-sm">
              {order.method === "pickup" ? restaurant.address.line1 : order.deliveryAddress}
            </p>
          </div>
        </div>
        {order.paidAt && (
          <p className="mt-4 text-sm text-muted-foreground">
            Simulated payment: {new Date(order.paidAt).toLocaleString("en-AU")}
          </p>
        )}
        {order.status !== "paid" && (
          <div className="mt-6 rounded-2xl border border-border bg-background p-4">
            <p className="text-sm font-semibold">Demo payment</p>
            <p className="mt-1 text-sm text-muted-foreground">
              These buttons do not charge a card. Success creates print jobs that a running local
              worker may send to printers.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button disabled={submitting !== null} onClick={() => runSimulation("success")}>
                {submitting === "success" ? "Simulating…" : "Simulate successful payment"}
              </Button>
              <Button
                variant="outline"
                disabled={submitting !== null}
                onClick={() => runSimulation("failure")}
              >
                {submitting === "failure" ? "Simulating…" : "Simulate failed payment"}
              </Button>
            </div>
            {actionError && (
              <p role="alert" className="mt-3 text-sm text-primary">
                {actionError}
              </p>
            )}
          </div>
        )}
        <div className="mt-8">
          <h2 className="font-display text-lg font-bold flex items-center gap-2">
            <Receipt className="h-5 w-5" /> Order summary
          </h2>
          <ul className="mt-3 divide-y divide-border">
            {order.lines.map((line) => (
              <li key={line.lineId} className="flex justify-between gap-3 py-2 text-sm">
                <span>
                  <span className="font-semibold">{line.quantity}×</span> {line.name}
                  {line.modifiers.length ? (
                    <span className="text-muted-foreground">
                      {" "}
                      — {line.modifiers.map((option) => option.name).join(", ")}
                    </span>
                  ) : null}
                  {line.notes && (
                    <span className="block text-muted-foreground">Note: {line.notes}</span>
                  )}
                </span>
                <span className="font-medium">
                  {formatAUD(
                    (line.basePrice +
                      line.modifiers.reduce((sum, option) => sum + option.priceDelta, 0)) *
                      line.quantity,
                  )}
                </span>
              </li>
            ))}
          </ul>
          {order.customer.notes && (
            <p className="mt-3 text-sm">Order note: {order.customer.notes}</p>
          )}
          <div className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatAUD(order.totals.subtotal)}</span>
            </div>
            {order.totals.deliveryFee > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delivery</span>
                <span>{formatAUD(order.totals.deliveryFee)}</span>
              </div>
            )}
            {order.totals.discount > 0 && (
              <div className="flex justify-between text-green">
                <span>Discount</span>
                <span>−{formatAUD(order.totals.discount)}</span>
              </div>
            )}
            <div className="flex justify-between font-display text-xl font-bold pt-1">
              <span>Total</span>
              <span>{formatAUD(order.totals.total)}</span>
            </div>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild className="bg-primary hover:bg-primary-dark text-primary-foreground">
            <Link to="/track-order" search={{ n: order.orderNumber, k: order.accessToken }}>
              View status
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
