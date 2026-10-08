import type { AdminOrderDetail } from "./order";

export type LocalPrintDestination = "kitchen" | "front";

export type LocalPrintPayload = {
  schemaVersion: 1;
  destination: LocalPrintDestination;
  orderNumber: string;
  placedAt: string;
  paidAt: string;
  estimatedFor: string;
  method: "pickup";
  customer: { name: string; phone: string };
  items: Array<{
    quantity: number;
    name: string;
    koreanName?: string;
    options: Array<{ groupName: string; name: string }>;
    notes?: string;
    unitPriceCents: number;
    lineTotalCents: number;
  }>;
  orderNotes?: string;
  totals: AdminOrderDetail["totals"];
};

export function localPrintPayload(
  order: AdminOrderDetail,
  destination: LocalPrintDestination,
  paidAt: Date,
): LocalPrintPayload {
  return {
    schemaVersion: 1,
    destination,
    orderNumber: order.orderNumber,
    placedAt: order.placedAt,
    paidAt: paidAt.toISOString(),
    estimatedFor: order.requestedFor,
    method: "pickup",
    customer: { name: order.customerName, phone: order.customerPhone },
    items: order.lines.map((line) => ({
      quantity: line.quantity,
      name: line.name,
      koreanName: line.koreanName,
      options: line.modifiers.map((modifier) => ({
        groupName: modifier.groupName,
        name: modifier.optionName,
      })),
      notes: line.notes,
      unitPriceCents: line.unitPriceCents,
      lineTotalCents: line.lineTotalCents,
    })),
    orderNotes: order.customerNotes ?? undefined,
    totals: order.totals,
  };
}
