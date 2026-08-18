import type { IntegrationKind } from "../../domain/integrations";
import type { OrderStatus } from "../../domain/order";
import { restaurant } from "../../lib/restaurant";

export function formatAdminMoney(amountCents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(amountCents / 100);
}

export function formatAdminTime(isoDate: string, timezone = restaurant.timezone): string {
  return new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  }).format(new Date(isoDate));
}

export function orderStatusLabel(status: OrderStatus): string {
  return {
    pending_payment: "Payment pending",
    paid: "New",
    accepted: "Accepted",
    preparing: "Preparing",
    ready: "Ready",
    collected: "Collected",
    expired: "Expired",
    cancelled: "Cancelled",
  }[status];
}

export function integrationKindLabel(kind: IntegrationKind): string {
  return kind === "pos" ? "POS" : "Kitchen print";
}
