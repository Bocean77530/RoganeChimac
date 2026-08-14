import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { CheckCircle2, Circle, Clock } from "lucide-react";
import { restaurant } from "@/lib/restaurant";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/track-order")({
  validateSearch: z.object({ n: z.string().optional() }),
  head: () => ({ meta: [{ title: "Track Order | Seoul Table" }, { name: "robots", content: "noindex" }] }),
  component: TrackOrder,
});

const steps = ["Order received", "Confirmed", "Preparing", "Ready", "Completed"] as const;

function TrackOrder() {
  const { n } = Route.useSearch();
  const raw = typeof window !== "undefined" && n ? sessionStorage.getItem(`order:${n}`) : null;
  const order = raw ? JSON.parse(raw) as any : null;

  // Simulated progress: 2 steps in for demo
  const currentStep = 2;

  if (!order) {
    return (
      <div className="container-page py-20 text-center">
        <h1 className="font-display text-3xl font-bold">Track your order</h1>
        <p className="mt-2 text-muted-foreground">Enter your order number and mobile to see status.</p>
        <Button asChild className="mt-6"><Link to="/order">Start an order</Link></Button>
      </div>
    );
  }

  return (
    <div className="container-page py-14 max-w-2xl">
      <p className="text-xs uppercase tracking-widest text-primary font-bold">Order {order.orderNumber}</p>
      <h1 className="mt-1 font-display text-3xl md:text-4xl font-extrabold">Your food is on its way</h1>
      <p className="mt-2 text-muted-foreground flex items-center gap-2"><Clock className="h-4 w-4" /> {order.method === "pickup" ? `Pickup at ${restaurant.address.line1}` : `Delivering to ${order.deliveryAddress}`}</p>

      <ol className="mt-8 space-y-4">
        {steps.map((label, i) => {
          const done = i <= currentStep;
          return (
            <li key={label} className="flex items-center gap-3">
              {done ? <CheckCircle2 className="h-6 w-6 text-primary" /> : <Circle className="h-6 w-6 text-border" />}
              <span className={`font-medium ${done ? "" : "text-muted-foreground"}`}>{label}</span>
            </li>
          );
        })}
      </ol>

      <div className="mt-10 rounded-2xl border border-border bg-card p-5">
        <p className="text-sm"><strong>Need help?</strong> Call us on <a href={`tel:${restaurant.phone}`} className="text-primary">{restaurant.phone}</a>.</p>
      </div>
    </div>
  );
}
