import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  getMerchantOrders, progressLabels, progressSteps, updateMerchantProgress,
  type FulfillmentStatus, type MerchantOrder,
} from "@/lib/order-api";

export const Route = createFileRoute("/merchant")({
  head: () => ({ meta: [{ title: "Merchant orders | Seoul Table" }, { name: "robots", content: "noindex" }] }),
  component: MerchantOrders,
});

const money = (cents: number) => new Intl.NumberFormat("en-AU", {
  style: "currency", currency: "AUD",
}).format(cents / 100);

function MerchantOrders() {
  const [token, setToken] = useState("");
  const [orders, setOrders] = useState<MerchantOrder[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    setBusy(true);
    setError("");
    try { setOrders(await getMerchantOrders(token.trim())); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load orders"); }
    finally { setBusy(false); }
  }

  async function advance(order: MerchantOrder, next: FulfillmentStatus) {
    setBusy(true);
    setError("");
    try {
      const updated = await updateMerchantProgress(order.orderNumber, token.trim(), next);
      setOrders((previous) => previous?.map((entry) => entry.orderNumber === updated.orderNumber ? updated : entry) ?? null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update order");
    } finally { setBusy(false); }
  }

  return <main className="container-page max-w-5xl py-14">
    <p className="text-xs uppercase tracking-widest text-primary font-bold">Seoul Table</p>
    <h1 className="mt-1 font-display text-3xl font-extrabold">Merchant orders</h1>
    <p className="mt-2 text-muted-foreground">Paid demo orders appear here. Update each order as work progresses.</p>
    <form className="mt-7 flex flex-wrap gap-3" onSubmit={(event) => { event.preventDefault(); void refresh(); }}>
      <label className="sr-only" htmlFor="merchant-token">Merchant access token</label>
      <input id="merchant-token" type="password" autoComplete="off" required
        value={token} onChange={(event) => setToken(event.target.value)}
        placeholder="Merchant access token" className="min-w-64 flex-1 rounded-lg border border-border bg-background px-3 py-2" />
      <Button type="submit" disabled={busy}>{busy ? "Loading…" : orders ? "Refresh orders" : "Open orders"}</Button>
    </form>
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    {orders?.length === 0 && <p className="mt-8">No paid demo orders yet.</p>}
    <div className="mt-7 space-y-5">
      {orders?.map((order) => {
        const steps = progressSteps[order.method] as readonly FulfillmentStatus[];
        const next = steps[steps.indexOf(order.fulfillmentStatus ?? "received") + 1];
        return <article key={order.id} className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold">{order.orderNumber}</h2>
              <p className="text-sm text-muted-foreground">{order.customer.name} · {order.customer.phone} · {order.method === "pickup" ? "Pickup" : "Delivery"}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold">{progressLabels[order.fulfillmentStatus ?? "received"]}</p>
              <p className="text-sm text-muted-foreground">{money(order.totals.total)}</p>
            </div>
          </div>
          {order.method === "delivery" && <p className="mt-3 text-sm">Address: {order.deliveryAddress}</p>}
          <ul className="mt-4 space-y-1 text-sm">
            {order.lines.map((line) => <li key={line.lineId}>
              {line.quantity} × {line.name}
              {line.modifiers.length > 0 && ` · ${line.modifiers.map((option) => option.name).join(", ")}`}
              {line.notes && <span className="block pl-4 text-muted-foreground">Item note: {line.notes}</span>}
            </li>)}
          </ul>
          {order.customer.notes && <p className="mt-3 text-sm">Order note: {order.customer.notes}</p>}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">Updated {new Date(order.fulfillmentUpdatedAt ?? order.paidAt ?? order.placedAt).toLocaleString("en-AU")}</p>
            {next && <Button disabled={busy} onClick={() => void advance(order, next)}>Mark: {progressLabels[next]}</Button>}
          </div>
        </article>;
      })}
    </div>
  </main>;
}
