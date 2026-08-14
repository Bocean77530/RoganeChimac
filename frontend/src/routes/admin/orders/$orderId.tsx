import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { OrderStatus } from "../../../domain/order";
import { AdminClientError, adminOrdersClient } from "../../../components/admin/admin-client";
import { IntegrationJobsPanel } from "../../../components/admin/IntegrationJobsPanel";
import { OrderDetail } from "../../../components/admin/OrderDetail";
import { Button } from "../../../components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/orders/$orderId")({
  component: AdminOrderDetailPage,
});

function AdminOrderDetailPage() {
  const { orderId } = Route.useParams();
  const queryClient = useQueryClient();
  const orderQuery = useQuery({
    queryKey: ["admin", "orders", orderId],
    queryFn: () => adminOrdersClient.getOrder(orderId),
    refetchInterval: 5_000,
  });
  const jobsQuery = useQuery({
    queryKey: ["admin", "integration-jobs", orderId],
    queryFn: () => adminOrdersClient.listIntegrationJobs(orderId),
    refetchInterval: 5_000,
  });

  const transitionMutation = useMutation({
    mutationFn: (to: OrderStatus) => {
      const order = orderQuery.data;
      if (!order) throw new Error("Order not found.");
      return adminOrdersClient.transitionOrder({
        orderId: order.id,
        expectedVersion: order.version,
        to,
        idempotencyKey: crypto.randomUUID(),
      });
    },
    onSuccess: async (order) => {
      toast.success(`${order.orderNumber} updated`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "orders"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "integration-jobs", orderId] }),
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "The order could not be updated.");
      if (error instanceof AdminClientError && error.code === "ORDER_VERSION_CONFLICT") {
        void queryClient.invalidateQueries({ queryKey: ["admin", "orders", orderId] });
      }
    },
  });

  const retryMutation = useMutation({
    mutationFn: (jobId: string) => adminOrdersClient.retryIntegrationJob(jobId),
    onSuccess: async () => {
      toast.success("Integration job queued for retry");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "orders"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "integration-jobs", orderId] }),
      ]);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Retry could not be queued."),
  });

  if (orderQuery.isPending) {
    return (
      <div className="rounded-3xl border border-border bg-card p-12 text-center text-muted-foreground">
        Loading order…
      </div>
    );
  }

  if (orderQuery.isError || !orderQuery.data) {
    return (
      <div className="rounded-3xl border border-border bg-card p-12 text-center">
        <h1 className="font-display text-2xl font-bold">Order not found</h1>
        <p className="mt-2 text-muted-foreground">
          It may have been removed or you may not have access.
        </p>
        <Button asChild className="mt-5">
          <Link to="/admin">Back to order board</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link to="/admin" className="inline-flex text-sm font-semibold text-primary hover:underline">
        ← Back to order board
      </Link>
      <OrderDetail
        order={orderQuery.data}
        isUpdating={transitionMutation.isPending}
        onTransition={(to) => transitionMutation.mutate(to)}
      />
      <IntegrationJobsPanel
        jobs={jobsQuery.data ?? []}
        retryingJobId={retryMutation.isPending ? retryMutation.variables : undefined}
        onRetry={(jobId) => retryMutation.mutate(jobId)}
      />
    </div>
  );
}
