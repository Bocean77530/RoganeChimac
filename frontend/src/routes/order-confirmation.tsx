import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, MapPin, Clock, Receipt } from "lucide-react";
import { z } from "zod";
import { formatAUD, restaurant } from "@/lib/restaurant";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/order-confirmation")({
  validateSearch: z.object({ n: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Order Confirmed | Seoul Table" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Confirmation,
});

function Confirmation() {
  const { n } = Route.useSearch();
  const raw = typeof window !== "undefined" && n ? sessionStorage.getItem(`order:${n}`) : null;
  const order = raw ? JSON.parse(raw) as any : null;

  if (!order) {
    return (
      <div className="container-page py-20 text-center">
        <h1 className="font-display text-3xl font-bold">No order found</h1>
        <p className="mt-2 text-muted-foreground">The order confirmation is no longer available.</p>
        <Button asChild className="mt-6"><Link to="/order">Back to menu</Link></Button>
      </div>
    );
  }

  const eta = order.method === "pickup"
    ? `${restaurant.ordering.pickupPrepMinutes} minutes`
    : `${restaurant.ordering.deliveryEtaMinutes} minutes`;

  return (
    <div className="container-page py-14 max-w-3xl">
      <div className="rounded-3xl border border-border bg-card p-8 shadow-card">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-green/15 text-green">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h1 className="mt-4 font-display text-3xl md:text-4xl font-extrabold">Thanks — order received!</h1>
        <p className="mt-2 text-muted-foreground">We've sent the details to {order.customer.email}. We'll be in touch if we need anything.</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-background border border-border p-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Order number</p>
            <p className="font-display text-xl font-bold">{order.orderNumber}</p>
          </div>
          <div className="rounded-2xl bg-background border border-border p-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Ready in</p>
            <p className="font-display text-xl font-bold">~{eta}</p>
          </div>
          <div className="rounded-2xl bg-background border border-border p-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> {order.method === "pickup" ? "Pickup at" : "Delivery to"}</p>
            <p className="font-medium text-sm">{order.method === "pickup" ? restaurant.address.line1 : order.deliveryAddress}</p>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="font-display text-lg font-bold flex items-center gap-2"><Receipt className="h-5 w-5" /> Order summary</h2>
          <ul className="mt-3 divide-y divide-border">
            {order.lines.map((l: any) => (
              <li key={l.lineId} className="flex justify-between gap-3 py-2 text-sm">
                <span><span className="font-semibold">{l.quantity}×</span> {l.name}{l.modifiers.length ? <span className="text-muted-foreground"> — {l.modifiers.map((m: any) => m.name).join(", ")}</span> : null}</span>
                <span className="font-medium">{formatAUD((l.basePrice + l.modifiers.reduce((a: number, m: any) => a + m.priceDelta, 0)) * l.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatAUD(order.totals.subtotal)}</span></div>
            {order.totals.deliveryFee > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Delivery</span><span>{formatAUD(order.totals.deliveryFee)}</span></div>}
            {order.totals.discount > 0 && <div className="flex justify-between text-green"><span>Discount</span><span>−{formatAUD(order.totals.discount)}</span></div>}
            <div className="flex justify-between font-display text-xl font-bold pt-1"><span>Total</span><span>{formatAUD(order.totals.total)}</span></div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild className="bg-primary hover:bg-primary-dark text-primary-foreground"><Link to="/track-order" search={{ n: order.orderNumber }}>Track order</Link></Button>
          <Button asChild variant="outline"><Link to="/order">Return to menu</Link></Button>
        </div>
      </div>
    </div>
  );
}
