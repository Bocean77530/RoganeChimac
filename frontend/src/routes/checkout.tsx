import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { computeTotals, useCart } from "@/lib/cart-store";
import { formatAUD, restaurant } from "@/lib/restaurant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout | Seoul Table" },
      { name: "description", content: "Complete your Korean food order for pickup or delivery." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CheckoutPage,
});

const schema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(80),
  phone: z.string().trim().min(8, "Please enter a valid mobile number").max(20),
  email: z.string().trim().email("Please enter a valid email").max(120),
  notes: z.string().trim().max(300).optional(),
});

function CheckoutPage() {
  const navigate = useNavigate();
  const { lines, method, setMethod, scheduledFor, setScheduledFor, deliveryAddress, setDeliveryAddress, promoCode, setPromoCode, clear } = useCart();
  const totals = computeTotals({ lines, method, promoCode });

  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });
  const [payMethod, setPayMethod] = useState<"card" | "pickup">("card");
  const [terms, setTerms] = useState(false);
  const [promoInput, setPromoInput] = useState(promoCode ?? "");
  const [submitting, setSubmitting] = useState(false);

  if (lines.length === 0) {
    return (
      <div className="container-page py-20 text-center">
        <h1 className="font-display text-3xl font-bold">Your cart is empty</h1>
        <p className="mt-2 text-muted-foreground">Add something from the menu first.</p>
        <Button asChild className="mt-6"><Link to="/order">Browse menu</Link></Button>
      </div>
    );
  }

  const applyPromo = () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) { setPromoCode(null); toast.success("Promo cleared"); return; }
    if (code === "SEOUL10" && totals.subtotal >= 2000) {
      setPromoCode(code);
      toast.success("SEOUL10 applied — 10% off");
    } else {
      toast.error("Invalid or ineligible promo code");
    }
  };

  const placeOrder = async () => {
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check your details");
      return;
    }
    if (!terms) return toast.error("Please accept the ordering terms");
    if (method === "delivery" && !deliveryAddress.trim()) return toast.error("Please enter a delivery address");
    if (totals.belowMinimum) return toast.error("Order is below delivery minimum");

    setSubmitting(true);
    // Simulate backend order creation
    await new Promise((r) => setTimeout(r, 700));
    const orderNumber = "ST-" + Math.random().toString(36).slice(2, 7).toUpperCase();
    const snapshot = {
      orderNumber,
      placedAt: new Date().toISOString(),
      method,
      scheduledFor,
      deliveryAddress,
      customer: parsed.data,
      payMethod,
      lines,
      totals,
    };
    sessionStorage.setItem(`order:${orderNumber}`, JSON.stringify(snapshot));
    clear();
    navigate({ to: "/order-confirmation", search: { n: orderNumber } });
  };

  return (
    <div className="container-page py-10 grid gap-8 lg:grid-cols-[1fr_400px]">
      <div className="space-y-8">
        <h1 className="font-display text-3xl md:text-4xl font-extrabold">Checkout</h1>

        <section className="rounded-3xl border border-border bg-card p-5">
          <h2 className="font-display text-lg font-bold">1. Order method</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(["pickup", "delivery"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`rounded-2xl border-2 p-4 text-left transition ${method === m ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
              >
                <p className="font-semibold capitalize">{m}</p>
                <p className="text-xs text-muted-foreground">
                  {m === "pickup" ? `Ready in ~${restaurant.ordering.pickupPrepMinutes} min` : `Arrives in ~${restaurant.ordering.deliveryEtaMinutes} min · ${formatAUD(restaurant.ordering.deliveryFee)} fee`}
                </p>
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="when">When</Label>
              <select
                id="when"
                value={scheduledFor ?? ""}
                onChange={(e) => setScheduledFor(e.target.value || null)}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">ASAP</option>
                {["+30", "+60", "+90", "+120"].map((n) => (
                  <option key={n} value={n}>In {n.replace("+", "")} minutes</option>
                ))}
              </select>
            </div>
            {method === "delivery" && (
              <div>
                <Label htmlFor="addr">Delivery address</Label>
                <Input id="addr" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Street and suburb" />
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-5">
          <h2 className="font-display text-lg font-bold">2. Your details</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="name">Full name</Label>
              <Input id="name" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="phone">Mobile</Label>
              <Input id="phone" type="tel" autoComplete="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="notes">Order notes (optional)</Label>
              <Textarea id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={300} placeholder="Any allergies or delivery instructions?" />
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-5">
          <h2 className="font-display text-lg font-bold">3. Payment</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {([
              ["card", "Pay online (card, Apple Pay, Google Pay)"],
              ["pickup", "Pay at pickup"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setPayMethod(id)}
                disabled={id === "pickup" && method === "delivery"}
                className={`rounded-2xl border-2 p-4 text-left transition disabled:opacity-40 ${payMethod === id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
              >
                <p className="font-semibold">{label}</p>
                <p className="text-xs text-muted-foreground">{id === "card" ? "Secure payment (test mode)" : "Available for pickup orders"}</p>
              </button>
            ))}
          </div>
        </section>

        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-1 h-4 w-4 accent-primary" />
          <span>I agree to Seoul Table's <Link to="/terms" className="text-primary hover:underline">ordering terms</Link> and understand that our kitchen handles common allergens.</span>
        </label>
      </div>

      <aside className="lg:sticky lg:top-40 h-fit rounded-3xl border border-border bg-card p-5 shadow-card">
        <h2 className="font-display text-lg font-bold">Order summary</h2>
        <ul className="mt-3 space-y-3 max-h-72 overflow-y-auto">
          {lines.map((l) => (
            <li key={l.lineId} className="flex gap-3">
              <img src={l.image} alt="" className="h-12 w-12 rounded-lg object-cover" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{l.quantity}× {l.name}</p>
                {l.modifiers.length > 0 && <p className="text-xs text-muted-foreground line-clamp-2">{l.modifiers.map((m) => m.name).join(" · ")}</p>}
              </div>
              <span className="text-sm font-semibold">{formatAUD((l.basePrice + l.modifiers.reduce((a,m)=>a+m.priceDelta,0)) * l.quantity)}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex gap-2">
          <Input placeholder="Promo code (try SEOUL10)" value={promoInput} onChange={(e) => setPromoInput(e.target.value)} />
          <Button variant="outline" onClick={applyPromo}>Apply</Button>
        </div>

        <div className="mt-4 space-y-1 border-t border-border pt-4 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatAUD(totals.subtotal)}</span></div>
          {totals.deliveryFee > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Delivery</span><span>{formatAUD(totals.deliveryFee)}</span></div>}
          {totals.discount > 0 && <div className="flex justify-between text-green"><span>Discount</span><span>−{formatAUD(totals.discount)}</span></div>}
          <div className="flex justify-between font-display text-xl font-bold pt-1"><span>Total</span><span>{formatAUD(totals.total)}</span></div>
        </div>

        {totals.belowMinimum && (
          <p className="mt-3 text-sm text-primary">Add {formatAUD(restaurant.ordering.deliveryMinimum - totals.subtotal)} more to meet the delivery minimum.</p>
        )}

        <Button
          onClick={placeOrder}
          disabled={submitting || totals.belowMinimum}
          className="mt-5 w-full h-12 bg-primary hover:bg-primary-dark text-primary-foreground text-base font-semibold"
        >
          {submitting ? "Placing order…" : `Place order · ${formatAUD(totals.total)}`}
        </Button>
      </aside>
    </div>
  );
}
