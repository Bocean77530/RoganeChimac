import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { OrderStatus } from "../../domain/order";
import {
  AdminClientError,
  adminOrdersClient,
  type AdminOrderView,
} from "../../components/admin/admin-client";
import { KdsConnectionBanner } from "../../components/admin/KdsConnectionBanner";
import { OrderBoard } from "../../components/admin/OrderBoard";
import { Button } from "../../components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/")({
  component: AdminOrdersPage,
});

function AdminOrdersPage() {
  const queryClient = useQueryClient();
  const ordersQuery = useQuery({
    queryKey: ["admin", "orders"],
    queryFn: () => adminOrdersClient.listOrders(),
    refetchInterval: 5_000,
  });
  const transitionMutation = useMutation({
    mutationFn: ({ order, to }: { order: AdminOrderView; to: OrderStatus }) =>
      adminOrdersClient.transitionOrder({
        orderId: order.id,
        expectedVersion: order.version,
        to,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: async (order) => {
      toast.success(`${order.orderNumber} is now ${order.status.replaceAll("_", " ")}`);
      await queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
    },
    onError: (error) => {
      toast.error(adminErrorMessage(error));
      if (error instanceof AdminClientError && error.code === "ORDER_VERSION_CONFLICT") {
        void queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
      }
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Pickup service</p>
          <h1 className="mt-1 font-display text-3xl font-extrabold">Live order board</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Paid orders only. Integration failures never remove a kitchen order.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => ordersQuery.refetch()}
          disabled={ordersQuery.isFetching}
        >
          Refresh orders
        </Button>
      </div>

      <KdsConnectionBanner
        isFetching={ordersQuery.isFetching}
        isError={ordersQuery.isError}
        lastUpdatedAt={ordersQuery.dataUpdatedAt || undefined}
      />

      {ordersQuery.isPending ? (
        <div className="rounded-3xl border border-border bg-card p-12 text-center text-muted-foreground">
          Loading kitchen orders…
        </div>
      ) : ordersQuery.isError ? (
        <div className="rounded-3xl border border-destructive/30 bg-destructive/10 p-6 text-center">
          <p className="font-semibold text-destructive">Orders could not be loaded.</p>
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={() => ordersQuery.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : (
        <OrderBoard
          orders={ordersQuery.data ?? []}
          updatingOrderId={
            transitionMutation.isPending ? transitionMutation.variables?.order.id : undefined
          }
          onTransition={(order, to) => transitionMutation.mutate({ order, to })}
        />
      )}
    </div>
  );
}

function adminErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The order could not be updated.";
}
