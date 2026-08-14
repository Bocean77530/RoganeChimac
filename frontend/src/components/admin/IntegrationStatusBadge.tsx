import { AlertTriangle, CheckCircle2, Clock3, Loader2, XCircle } from "lucide-react";
import type { IntegrationState } from "../../domain/integrations";
import { integrationKindLabel } from "./admin-format";

const statusPresentation = {
  queued: {
    label: "Queued",
    icon: Clock3,
    className: "border-border bg-muted text-muted-foreground",
  },
  processing: {
    label: "Processing",
    icon: Loader2,
    className: "border-blue-200 bg-blue-50 text-blue-800",
  },
  retry_scheduled: {
    label: "Retry scheduled",
    icon: Clock3,
    className: "border-amber-200 bg-amber-50 text-amber-900",
  },
  succeeded: {
    label: "Synced",
    icon: CheckCircle2,
    className: "border-green/25 bg-green/10 text-green",
  },
  manual_action_required: {
    label: "Needs attention",
    icon: AlertTriangle,
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  dead_letter: {
    label: "Failed",
    icon: XCircle,
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  cancelled: {
    label: "Cancelled",
    icon: XCircle,
    className: "border-border bg-muted text-muted-foreground",
  },
} as const;

export function IntegrationStatusBadge({ state }: { state: IntegrationState }) {
  const presentation = statusPresentation[state.status];
  const Icon = presentation.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-bold ${presentation.className}`}
      title={state.lastError}
    >
      <Icon className={`h-3 w-3 ${state.status === "processing" ? "animate-spin" : ""}`} />
      {integrationKindLabel(state.kind)}: {presentation.label}
    </span>
  );
}
