import { Link } from "@tanstack/react-router";
import { AlertTriangle, Clock3, Mail, Phone, Printer } from "lucide-react";
import type { OrderStatus } from "../../domain/order";
import { Button } from "../ui/button";
import type { AdminOrderView } from "./admin-client";
import { formatAdminMoney, formatAdminTime, orderStatusLabel } from "./admin-format";
import { IntegrationStatusBadge } from "./IntegrationStatusBadge";
import { OrderActions } from "./OrderActions";

export function OrderDetail({
  order,
  isUpdating,
  onTransition,
}: {
  order: AdminOrderView;
  isUpdating: boolean;
  onTransition: (nextStatus: OrderStatus) => void;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <section className="rounded-3xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary">
                Pickup order
              </p>
              <h1 className="mt-1 font-display text-3xl font-extrabold">{order.orderNumber}</h1>
              <p className="mt-2 inline-flex items-center gap-1 font-semibold">
                <Clock3 className="h-4 w-4" /> Pickup {formatAdminTime(order.requestedFor)}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="rounded-full bg-ink px-3 py-1 text-sm font-bold text-cream">
                {orderStatusLabel(order.status)}
              </span>
              <span className="text-xs font-bold text-green">PAID ONLINE</span>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
            <OrderActions status={order.status} disabled={isUpdating} onTransition={onTransition} />
            <Button asChild variant="outline">
              <Link to="/admin/print/orders/$orderId" params={{ orderId: order.id }}>
                <Printer className="mr-2 h-4 w-4" /> Print ticket
              </Link>
            </Button>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-5">
          <h2 className="font-display text-xl font-bold">Items</h2>
          <ul className="mt-3 divide-y divide-border">
            {order.lines.map((line) => (
              <li key={line.clientLineId} className="py-4">
                <div className="flex justify-between gap-3">
                  <p className="font-semibold">
                    <strong>{line.quantity}×</strong> {line.name}
                  </p>
                  <strong>{formatAdminMoney(line.lineTotalCents)}</strong>
                </div>
                {line.modifiers.length > 0 && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {line.modifiers
                      .map((modifier) => `${modifier.groupName}: ${modifier.optionName}`)
                      .join(" · ")}
                  </p>
                )}
                {line.notes && (
                  <p className="mt-2 text-sm font-semibold text-primary">ITEM NOTE: {line.notes}</p>
                )}
              </li>
            ))}
          </ul>
          <div className="space-y-1 border-t border-border pt-4 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatAdminMoney(order.totals.subtotalCents)}</span>
            </div>
            {order.totals.discountCents > 0 && (
              <div className="flex justify-between text-green">
                <span>Discount</span>
                <span>−{formatAdminMoney(order.totals.discountCents)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1 font-display text-xl font-bold">
              <span>Total</span>
              <span>{formatAdminMoney(order.totals.totalCents)}</span>
            </div>
          </div>
        </section>

        {order.customerNotes && (
          <section className="rounded-3xl border-2 border-primary bg-primary/10 p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-primary">
              <AlertTriangle className="h-5 w-5" /> Order note / allergy
            </h2>
            <p className="mt-2 whitespace-pre-wrap font-semibold">{order.customerNotes}</p>
          </section>
        )}
      </div>

      <aside className="space-y-5">
        <section className="rounded-3xl border border-border bg-card p-5">
          <h2 className="font-display text-lg font-bold">Customer</h2>
          <p className="mt-3 font-semibold">{order.customerName}</p>
          <a
            className="mt-2 flex items-center gap-2 text-sm text-primary hover:underline"
            href={`tel:${order.customerPhone}`}
          >
            <Phone className="h-4 w-4" /> {order.customerPhone}
          </a>
          <a
            className="mt-2 flex items-center gap-2 break-all text-sm text-primary hover:underline"
            href={`mailto:${order.customerEmail}`}
          >
            <Mail className="h-4 w-4" /> {order.customerEmail}
          </a>
        </section>

        <section className="rounded-3xl border border-border bg-card p-5">
          <h2 className="font-display text-lg font-bold">Connections</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <IntegrationStatusBadge state={order.integrations.pos} />
            <IntegrationStatusBadge state={order.integrations.kitchen_print} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Integration failures do not remove this order from the kitchen queue.
          </p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-5">
          <h2 className="font-display text-lg font-bold">Status history</h2>
          <ol className="mt-3 space-y-3">
            {order.statusEvents.map((event, index) => (
              <li
                key={`${event.occurredAt}:${index}`}
                className="border-l-2 border-primary pl-3 text-sm"
              >
                <p className="font-semibold">{event.label}</p>
                <p className="text-xs text-muted-foreground">{formatAdminTime(event.occurredAt)}</p>
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  );
}
