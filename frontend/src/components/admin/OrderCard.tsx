import { Link } from "@tanstack/react-router";
import { AlertTriangle, Clock3, UserRound } from "lucide-react";
import type { OrderStatus } from "../../domain/order";
import type { AdminOrderView } from "./admin-client";
import { formatAdminMoney, formatAdminTime } from "./admin-format";
import { IntegrationStatusBadge } from "./IntegrationStatusBadge";
import { OrderActions } from "./OrderActions";

export function OrderCard({
  order,
  isUpdating,
  onTransition,
}: {
  order: AdminOrderView;
  isUpdating: boolean;
  onTransition: (order: AdminOrderView, nextStatus: OrderStatus) => void;
}) {
  const needsAttention = Object.values(order.integrations).some((state) =>
    ["manual_action_required", "dead_letter"].includes(state.status),
  );

  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            to="/admin/orders/$orderId"
            params={{ orderId: order.id }}
            className="font-display text-xl font-extrabold hover:text-primary"
          >
            {order.orderNumber}
          </Link>
          <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold">
            <Clock3 className="h-4 w-4" /> Pickup {formatAdminTime(order.requestedFor)}
          </p>
        </div>
        <span className="rounded-full bg-green/10 px-2 py-1 text-xs font-bold text-green">
          PAID
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
        <span className="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
          <UserRound className="h-4 w-4 shrink-0" />
          <span className="truncate">{order.customerName}</span>
        </span>
        <strong>{formatAdminMoney(order.totalCents)}</strong>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{order.itemCount} items</p>

      {order.customerNotes && (
        <p className="mt-3 flex gap-2 rounded-xl border border-primary/25 bg-primary/10 p-2 text-xs font-semibold text-primary">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="line-clamp-2">{order.customerNotes}</span>
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        <IntegrationStatusBadge state={order.integrations.pos} />
        <IntegrationStatusBadge state={order.integrations.kitchen_print} />
      </div>

      {needsAttention && (
        <p className="mt-2 text-xs font-semibold text-primary">
          Integration needs attention. The kitchen order remains active.
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
        <Link
          to="/admin/orders/$orderId"
          params={{ orderId: order.id }}
          className="text-sm font-semibold text-primary hover:underline"
        >
          View details
        </Link>
        <OrderActions
          compact
          status={order.status}
          disabled={isUpdating}
          onTransition={(nextStatus) => onTransition(order, nextStatus)}
        />
      </div>
    </article>
  );
}
