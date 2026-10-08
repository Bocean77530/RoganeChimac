import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { listMerchantOrdersFn, updateMerchantOrderFn } from "@/api/merchant";
import type { AdminOrderDetail, OrderStatus } from "@/domain/order";
import { formatAUD, restaurant } from "@/lib/restaurant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const storageKey = "rogane-admin-access-token";
const nextStatus: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  submitted: { to: "accepted", label: "Accept order" },
  paid: { to: "accepted", label: "Accept order" },
  accepted: { to: "preparing", label: "Start preparing" },
  preparing: { to: "ready", label: "Mark ready for pickup" },
  ready: { to: "collected", label: "Mark collected" },
};

export const Route = createFileRoute("/merchant")({
  head: () => ({
    meta: [
      { title: "Merchant orders | Rogane Chimac" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: MerchantOrdersPage,
});

function MerchantOrdersPage() {
  const [adminToken, setAdminToken] = useState("");
  const [draftToken, setDraftToken] = useState("");
  const queryClient = useQueryClient();
  useEffect(() => {
    const saved = sessionStorage.getItem(storageKey) ?? "";
    setAdminToken(saved);
    setDraftToken(saved);
  }, []);
  const ordersQuery = useQuery({
    queryKey: ["merchant", "orders", adminToken],
    enabled: Boolean(adminToken),
    queryFn: async () => {
      const result = await listMerchantOrdersFn({ data: { adminToken } });
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
    refetchInterval: 5_000,
  });
  const change = useMutation({
    mutationFn: async ({ order, toStatus }: { order: AdminOrderDetail; toStatus: OrderStatus }) => {
      const result = await updateMerchantOrderFn({
        data: {
          adminToken,
          orderId: order.id,
          expectedVersion: order.version,
          toStatus: toStatus as "accepted" | "preparing" | "ready" | "collected",
        },
      });
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["merchant", "orders", adminToken] }),
    onError: () =>
      void queryClient.invalidateQueries({ queryKey: ["merchant", "orders", adminToken] }),
  });

  return (
    <main className="container-page py-12">
      <h1 className="font-display text-3xl font-extrabold">Merchant orders</h1>
      <p className="mt-2 text-muted-foreground">
        Pickup and table orders from {restaurant.name}. Customer tracking refreshes automatically.
      </p>
      <form
        className="mt-6 flex max-w-xl gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const value = draftToken.trim();
          sessionStorage.setItem(storageKey, value);
          setAdminToken(value);
        }}
      >
        <Input
          type="password"
          autoComplete="off"
          aria-label="Admin access token"
          placeholder="Admin access token"
          value={draftToken}
          onChange={(event) => setDraftToken(event.target.value)}
        />
        <Button type="submit">Open orders</Button>
      </form>
      {!adminToken ? (
        <p className="mt-6">Enter the merchant access token to view orders.</p>
      ) : ordersQuery.isPending ? (
        <p className="mt-6">Loading orders…</p>
      ) : ordersQuery.isError ? (
        <p className="mt-6 text-destructive">
          Orders could not be loaded. Check the token and try again.
        </p>
      ) : (
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {ordersQuery.data?.length === 0 && <p>No orders yet.</p>}
          {ordersQuery.data?.map((order) => {
            const action = nextStatus[order.status];
            const busy = change.isPending && change.variables?.order.id === order.id;
            return (
              <article key={order.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl font-bold">{order.orderNumber}</h2>
                    <p className="text-sm text-muted-foreground">
                      {order.fulfillmentMethod === "dine_in" ? (
                        <>
                          Table {order.tableLabel} ·{" "}
                          {order.paymentStatus === "unpaid" ? "Pay at counter" : "Paid"}
                        </>
                      ) : (
                        <>
                          Pickup{" "}
                          {new Intl.DateTimeFormat("en-AU", {
                            timeZone: restaurant.timezone,
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(order.requestedFor))}
                        </>
                      )}
                    </p>
                  </div>
                  <strong className="rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
                    {order.status.replaceAll("_", " ")}
                  </strong>
                </div>
                <p className="mt-4 text-sm">
                  {order.customerName} · {order.customerPhone}
                </p>
                <ul className="mt-4 space-y-2 border-t border-border pt-3">
                  {order.lines.map((line) => (
                    <li key={line.clientLineId}>
                      <strong>
                        {line.quantity} × {line.name}
                      </strong>
                      {line.koreanName && <span> · {line.koreanName}</span>}
                      {line.modifiers.length > 0 && (
                        <p className="text-sm">
                          {line.modifiers
                            .map((modifier) => `${modifier.groupName}: ${modifier.optionName}`)
                            .join(" · ")}
                        </p>
                      )}
                      {line.notes && (
                        <p className="text-sm font-semibold text-primary">
                          Item note: {line.notes}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
                {order.customerNotes && (
                  <p className="mt-4 rounded-xl bg-primary/10 p-3 font-semibold">
                    Customer note: {order.customerNotes}
                  </p>
                )}
                <p className="mt-4 font-bold">Total {formatAUD(order.totalCents)}</p>
                {action && (
                  <Button
                    className="mt-4"
                    disabled={busy}
                    onClick={() => change.mutate({ order, toStatus: action.to })}
                  >
                    {busy
                      ? "Updating…"
                      : order.fulfillmentMethod === "dine_in" && action.to === "ready"
                        ? "Mark ready"
                        : action.label}
                  </Button>
                )}
                {change.isError && change.variables?.order.id === order.id && (
                  <p className="mt-2 text-sm text-destructive">
                    {change.error instanceof Error
                      ? change.error.message
                      : "Could not update order."}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
