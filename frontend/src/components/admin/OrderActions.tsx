import type { OrderStatus } from "../../domain/order";
import { Button } from "../ui/button";
import { getNextOrderStatus } from "./admin-client";

const actionLabel: Partial<Record<OrderStatus, string>> = {
  accepted: "Accept order",
  preparing: "Start preparing",
  ready: "Mark ready",
  collected: "Mark collected",
};

export function OrderActions({
  status,
  disabled = false,
  compact = false,
  onTransition,
}: {
  status: OrderStatus;
  disabled?: boolean;
  compact?: boolean;
  onTransition: (nextStatus: OrderStatus) => void;
}) {
  const nextStatus = getNextOrderStatus(status);
  if (!nextStatus) return null;

  return (
    <Button
      type="button"
      size={compact ? "sm" : "default"}
      disabled={disabled}
      onClick={() => onTransition(nextStatus)}
      className="bg-primary text-primary-foreground hover:bg-primary-dark"
    >
      {disabled ? "Updating…" : actionLabel[nextStatus]}
    </Button>
  );
}
