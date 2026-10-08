import type { OrderStatus, PaymentStatus } from "@/domain/order";

type PollableOrder = { status: OrderStatus; paymentStatus: PaymentStatus };

export function trackingPollInterval(order: PollableOrder | undefined): number | false {
  if (!order) return 5_000;
  if (["cancelled", "expired", "collected"].includes(order.status)) return false;
  if (order.status === "pending_payment" && order.paymentStatus === "failed") return 10_000;
  return 5_000;
}

export function paymentConfirmationPollInterval(order: PollableOrder | undefined): number | false {
  if (!order) return 1_500;
  if (["cancelled", "expired", "collected"].includes(order.status)) return false;
  if (order.status === "pending_payment" && order.paymentStatus === "failed") return 10_000;
  return ["pending", "unpaid"].includes(order.paymentStatus) ? 1_500 : false;
}
