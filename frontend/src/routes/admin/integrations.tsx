import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { adminOrdersClient } from "../../components/admin/admin-client";
import { IntegrationJobsPanel } from "../../components/admin/IntegrationJobsPanel";
import { Button } from "../../components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/integrations")({
  component: AdminIntegrationsPage,
});

function AdminIntegrationsPage() {
  const queryClient = useQueryClient();
  const jobsQuery = useQuery({
    queryKey: ["admin", "integration-jobs"],
    queryFn: async () => {
      const orders = await adminOrdersClient.listOrders();
      const jobs = await Promise.all(
        orders.map((order) => adminOrdersClient.listIntegrationJobs(order.id)),
      );
      return jobs
        .flat()
        .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    },
    refetchInterval: 5_000,
  });
  const retryMutation = useMutation({
    mutationFn: (jobId: string) => adminOrdersClient.retryIntegrationJob(jobId),
    onSuccess: async () => {
      toast.success("Integration job queued for retry");
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Retry could not be queued."),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            Delivery health
          </p>
          <h1 className="mt-1 font-display text-3xl font-extrabold">POS and printing</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Demo adapters are active. Browser printing is manual; a future store bridge will
            acknowledge automatic LAN printer jobs.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={jobsQuery.isFetching}
          onClick={() => jobsQuery.refetch()}
        >
          Refresh jobs
        </Button>
      </div>
      {jobsQuery.isPending ? (
        <div className="rounded-3xl border border-border bg-card p-12 text-center text-muted-foreground">
          Loading integration jobs…
        </div>
      ) : jobsQuery.isError ? (
        <div className="rounded-3xl border border-destructive/30 bg-destructive/10 p-6 text-center text-destructive">
          Integration jobs could not be loaded.
        </div>
      ) : (
        <IntegrationJobsPanel
          jobs={jobsQuery.data ?? []}
          retryingJobId={retryMutation.isPending ? retryMutation.variables : undefined}
          onRetry={(jobId) => retryMutation.mutate(jobId)}
        />
      )}
    </div>
  );
}
