import { Cloud, CloudOff, RefreshCw } from "lucide-react";

export function KdsConnectionBanner({
  isFetching,
  isError = false,
  lastUpdatedAt,
}: {
  isFetching: boolean;
  isError?: boolean;
  lastUpdatedAt?: number;
}) {
  const StatusIcon = isError ? CloudOff : Cloud;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm">
      <StatusIcon className={`h-4 w-4 ${isError ? "text-destructive" : "text-green"}`} />
      <strong>{isError ? "Kitchen display disconnected" : "Kitchen display connected"}</strong>
      <span className="text-muted-foreground">
        {isError
          ? "Orders may be out of date. Retry the connection."
          : lastUpdatedAt
            ? `Last synced ${new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(lastUpdatedAt)}`
            : "Waiting for first sync"}
      </span>
      {isFetching && !isError && (
        <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Refreshing
        </span>
      )}
    </div>
  );
}
