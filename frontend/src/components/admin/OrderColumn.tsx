import type { OrderStatus } from "../../domain/order";
import type { AdminOrderView } from "./admin-client";
import { orderStatusLabel } from "./admin-format";
import { OrderCard } from "./OrderCard";

export function OrderColumn({
  status,
  orders,
  updatingOrderId,
  onTransition,
}: {
  status: Extract<OrderStatus, "paid" | "accepted" | "preparing" | "ready">;
  orders: AdminOrderView[];
  updatingOrderId?: string;
  onTransition: (order: AdminOrderView, nextStatus: OrderStatus) => void;
}) {
  return (
    <section className="min-w-[280px] flex-1 rounded-3xl border border-border bg-background/70 p-3">
      <header className="flex items-center justify-between px-1 pb-3">
        <h2 className="font-display text-lg font-bold">{orderStatusLabel(status)}</h2>
        <span className="grid h-7 min-w-7 place-items-center rounded-full bg-ink px-2 text-xs font-bold text-cream">
          {orders.length}
        </span>
      </header>
      <div className="space-y-3">
        {orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            isUpdating={updatingOrderId === order.id}
            onTransition={onTransition}
          />
        ))}
        {orders.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            No orders
          </div>
        )}
      </div>
    </section>
  );
}
