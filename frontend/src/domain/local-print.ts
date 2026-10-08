import type { AdminOrderDetail, PricedLineSnapshot } from "./order";

export type LocalPrintDestination = "kitchen" | "front";

export type PickupLocalPrintPayload = {
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

export type DineInLocalPrintPayload = {
  schemaVersion: 2;
  destination: LocalPrintDestination;
  orderId: string;
  orderNumber: string;
  placedAt: string;
  method: "dine_in";
  table: { id: string; label: string };
  payment:
    | { method: "pay_at_counter"; status: "unpaid"; label: "PAY AT COUNTER" }
    | { method: "online"; status: "paid"; label: "PAID ONLINE"; paidAt: string };
  customer: { name: string; phone: string };
  items: PickupLocalPrintPayload["items"];
  orderNotes?: string;
  totals: AdminOrderDetail["totals"];
};

export type LocalPrintPayload = PickupLocalPrintPayload | DineInLocalPrintPayload;

export function localPrintPayload(
  order: AdminOrderDetail,
  destination: LocalPrintDestination,
  paidAt: Date,
): PickupLocalPrintPayload {
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

export function dineInLocalPrintPayload(input: {
  destination: LocalPrintDestination;
  orderId: string;
  orderNumber: string;
  placedAt: Date;
  tableId: string;
  tableLabel: string;
  customerName: string;
  customerPhone: string;
  customerNotes?: string;
  lines: PricedLineSnapshot[];
  totals: AdminOrderDetail["totals"];
  payment?: DineInLocalPrintPayload["payment"];
}): DineInLocalPrintPayload {
  return {
    schemaVersion: 2,
    destination: input.destination,
    orderId: input.orderId,
    orderNumber: input.orderNumber,
    placedAt: input.placedAt.toISOString(),
    method: "dine_in",
    table: { id: input.tableId, label: input.tableLabel },
    payment: input.payment ?? {
      method: "pay_at_counter",
      status: "unpaid",
      label: "PAY AT COUNTER",
    },
    customer: { name: input.customerName, phone: input.customerPhone },
    items: input.lines.map((line) => ({
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
    orderNotes: input.customerNotes,
    totals: input.totals,
  };
}
