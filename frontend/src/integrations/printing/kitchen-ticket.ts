import type { KitchenTicket } from "../../domain/integrations";
import type { AdminOrderDetail } from "../../domain/order";

type CreateKitchenTicketInput = {
  order: AdminOrderDetail;
  restaurantName: string;
  copyNumber?: number;
};

export function createKitchenTicket({
  order,
  restaurantName,
  copyNumber = 1,
}: CreateKitchenTicketInput): KitchenTicket {
  if (!Number.isInteger(copyNumber) || copyNumber < 1) {
    throw new RangeError("copyNumber must be a positive integer");
  }

  if (order.paymentStatus !== "paid" && order.paymentStatus !== "partially_refunded") {
    throw new Error("Kitchen tickets can only be created for paid orders");
  }

  return {
    restaurantName,
    placedAt: order.placedAt,
    orderNotes: order.customerNotes ?? undefined,
    copyNumber,
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      requestedFor: order.requestedFor,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      lines: order.lines,
      totals: order.totals,
      tender: "PREPAID_ONLINE",
    },
  };
}

export function groupLineModifiers(
  modifiers: AdminOrderDetail["lines"][number]["modifiers"],
): Array<{ groupId: string; groupName: string; optionNames: string[] }> {
  const groups = new Map<string, { groupId: string; groupName: string; optionNames: string[] }>();

  for (const modifier of modifiers) {
    const existing = groups.get(modifier.groupId);
    if (existing) {
      existing.optionNames.push(modifier.optionName);
    } else {
      groups.set(modifier.groupId, {
        groupId: modifier.groupId,
        groupName: modifier.groupName,
        optionNames: [modifier.optionName],
      });
    }
  }

  return [...groups.values()];
}
