import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  listMerchantOrdersFn,
  listMerchantPrintJobsFn,
  recordCounterPaymentFn,
  retryMerchantPrintJobFn,
  updateMerchantOrderFn,
} from "@/api/merchant";
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
  const [operatorName, setOperatorName] = useState("");
  const [counterMethod, setCounterMethod] = useState<"cash" | "card" | "other">("cash");
  const [retryReason, setRetryReason] = useState("");
  const paymentKeys = useRef(new Map<string, string>());
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
  const printJobsQuery = useQuery({
    queryKey: ["merchant", "print-jobs", adminToken],
    enabled: Boolean(adminToken),
    queryFn: () => listMerchantPrintJobsFn({ data: { adminToken } }),
    refetchInterval: 5_000,
  });
  const retryPrintJob = useMutation({
    mutationFn: async (jobId: string) => {
      const result = await retryMerchantPrintJobFn({
        data: { adminToken, jobId, reason: retryReason.trim() },
      });
      if (!result.ok) throw new Error(result.error);
      return result.job;
    },
    onSettled: () =>
      void queryClient.invalidateQueries({ queryKey: ["merchant", "print-jobs", adminToken] }),
  });
  const change = useMutation({
    mutationFn: async ({ order, toStatus }: { order: AdminOrderDetail; toStatus: OrderStatus }) => {
      const result = await updateMerchantOrderFn({
        data: {
          adminToken,
          orderId: order.id,
          expectedVersion: order.version,
          toStatus: toStatus as "accepted" | "preparing" | "ready" | "collected" | "cancelled",
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
  const recordPayment = useMutation({
    mutationFn: async (order: AdminOrderDetail) => {
      const key = `${order.id}:${counterMethod}:${operatorName.trim()}`;
      if (!paymentKeys.current.has(key)) paymentKeys.current.set(key, crypto.randomUUID());
      const result = await recordCounterPaymentFn({
        data: {
          adminToken,
          orderId: order.id,
          idempotencyKey: paymentKeys.current.get(key)!,
          method: counterMethod,
          operatorName: operatorName.trim(),
        },
      });
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
    onSuccess: () =>
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
        <>
          <div className="mt-6 flex flex-wrap gap-3 rounded-2xl border border-border bg-card p-4">
            <Input
              className="max-w-48"
              placeholder="Staff name"
              aria-label="Staff name"
              value={operatorName}
              onChange={(event) => setOperatorName(event.target.value)}
            />
            <select
              aria-label="Counter payment method"
              value={counterMethod}
              onChange={(event) =>
                setCounterMethod(event.target.value as "cash" | "card" | "other")
              }
              className="rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="cash">Cash</option>
              <option value="card">Card at counter</option>
              <option value="other">Other</option>
            </select>
          </div>
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
                            {order.paymentStatus === "paid"
                              ? "Paid"
                              : order.paymentMethod === "online"
                                ? "Online payment pending"
                                : "Pay at counter"}
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
                  {order.fulfillmentMethod === "dine_in" &&
                    order.paymentMethod === "pay_at_counter" &&
                    order.paymentStatus === "unpaid" &&
                    order.status !== "cancelled" &&
                    order.status !== "expired" && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          disabled={!operatorName.trim() || recordPayment.isPending}
                          onClick={() => recordPayment.mutate(order)}
                        >
                          {recordPayment.isPending && recordPayment.variables?.id === order.id
                            ? "Recording…"
                            : "Record counter payment"}
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => change.mutate({ order, toStatus: "cancelled" })}
                        >
                          Cancel unpaid order
                        </Button>
                      </div>
                    )}
                  {recordPayment.isError && recordPayment.variables?.id === order.id && (
                    <p className="mt-2 text-sm text-destructive">
                      {recordPayment.error instanceof Error
                        ? recordPayment.error.message
                        : "Could not record payment."}
                    </p>
                  )}
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
          <section className="mt-12 rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-2xl font-bold">Local printer jobs</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              A succeeded job was accepted by the computer print queue. Check the paper before
              retrying any job with an expired lease; its print outcome is unknown.
            </p>
            <Input
              className="mt-4 max-w-xl"
              aria-label="Print retry reason"
              placeholder="Reason for manual retry (at least 8 characters)"
              value={retryReason}
              onChange={(event) => setRetryReason(event.target.value)}
            />
            {printJobsQuery.isError && (
              <p className="mt-3 text-sm text-destructive">Printer jobs could not be loaded.</p>
            )}
            {printJobsQuery.data?.length === 0 && <p className="mt-3">No printer jobs yet.</p>}
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {printJobsQuery.data?.map((job) => (
                <article key={job.id} className="rounded-xl border border-border p-4">
                  <h3 className="font-semibold">
                    {job.orderNumber} · {job.destination}
                  </h3>
                  <p className="text-sm">
                    {job.status.replaceAll("_", " ")} · v{job.payloadVersion} · attempt{" "}
                    {job.attemptCount}
                  </p>
                  {!job.supported && (
                    <p className="text-sm text-destructive">
                      Unsupported payload; worker will not claim this job.
                    </p>
                  )}
                  {job.skipReason && (
                    <p className="text-sm text-destructive">
                      {job.skipReason === "v2_created_before_cutoff"
                        ? `Older v2 ticket predates the print cutoff (${job.v2CutoffAt}); no new claim or retry. Review before any manual action.`
                        : job.skipReason === "v2_cutoff_invalid"
                          ? "V2 printing disabled: PRINT_V2_CREATED_AFTER is invalid."
                          : "V2 printing disabled: PRINT_V2_CREATED_AFTER is not set."}
                    </p>
                  )}
                  {job.spoolerJobId && (
                    <p className="text-sm">Computer queue ID: {job.spoolerJobId}</p>
                  )}
                  {job.lastErrorMessage && (
                    <p className="text-sm text-destructive">{job.lastErrorMessage}</p>
                  )}
                  {job.canRetry && (
                    <Button
                      className="mt-3"
                      variant="outline"
                      disabled={retryReason.trim().length < 8 || retryPrintJob.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Confirm this single ticket did not print. Retry may produce a duplicate.",
                          )
                        )
                          retryPrintJob.mutate(job.id);
                      }}
                    >
                      Retry this ticket
                    </Button>
                  )}
                  {retryPrintJob.isError && retryPrintJob.variables === job.id && (
                    <p className="mt-2 text-sm text-destructive">
                      {retryPrintJob.error instanceof Error
                        ? retryPrintJob.error.message
                        : "Retry failed."}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
