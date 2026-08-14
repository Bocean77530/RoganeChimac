import type { OrderStatus } from "../../domain/order";
import type { AdminOrderView } from "./admin-client";
import { OrderColumn } from "./OrderColumn";

const boardStatuses = ["paid", "accepted", "preparing", "ready"] as const;

export function OrderBoard({
  orders,
  updatingOrderId,
  onTransition,
}: {
  orders: AdminOrderView[];
  updatingOrderId?: string;
  onTransition: (order: AdminOrderView, nextStatus: OrderStatus) => void;
}) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4" aria-label="Active pickup orders">
      {boardStatuses.map((status) => (
        <OrderColumn
          key={status}
          status={status}
          orders={orders.filter((order) => order.status === status)}
          updatingOrderId={updatingOrderId}
          onTransition={onTransition}
        />
      ))}
    </div>
  );
}
