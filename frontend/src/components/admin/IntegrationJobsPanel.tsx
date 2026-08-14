import { AlertTriangle, RefreshCw } from "lucide-react";
import type { AdminIntegrationJob } from "./admin-client";
import { integrationKindLabel } from "./admin-format";
import { Button } from "../ui/button";

const retryableStatuses = new Set(["retry_scheduled", "manual_action_required", "dead_letter"]);

export function IntegrationJobsPanel({
  jobs,
  retryingJobId,
  onRetry,
}: {
  jobs: AdminIntegrationJob[];
  retryingJobId?: string;
  onRetry: (jobId: string) => void;
}) {
  return (
    <section className="rounded-3xl border border-border bg-card p-5">
      <h2 className="font-display text-xl font-bold">Integration jobs</h2>
      {jobs.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No integration jobs have been created.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {jobs.map((job) => (
            <li key={job.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {integrationKindLabel(job.kind)} · {job.provider}
                </p>
                <p className="text-xs text-muted-foreground">
                  {job.status.replaceAll("_", " ")} · attempt {job.attemptCount}/{job.maxAttempts}
                </p>
                {job.lastError && (
                  <p className="mt-1 inline-flex items-start gap-1 text-xs font-medium text-primary">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {job.lastError}
                  </p>
                )}
                {job.externalReference && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Reference: {job.externalReference}
                  </p>
                )}
              </div>
              {retryableStatuses.has(job.status) && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={retryingJobId === job.id}
                  onClick={() => onRetry(job.id)}
                >
                  <RefreshCw
                    className={`mr-1 h-3.5 w-3.5 ${retryingJobId === job.id ? "animate-spin" : ""}`}
                  />
                  Retry
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
