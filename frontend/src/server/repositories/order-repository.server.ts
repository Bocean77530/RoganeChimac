import { asc, eq } from "drizzle-orm";
import type { AdminOrderDetail, PricedLineSnapshot } from "@/domain/order";
import type { DatabaseExecutor } from "@/db/client.server";
import { orderItemModifiers, orderItems, orders, orderStatusEvents } from "@/db/schema";
import { orderStatusLabel } from "../order-transitions.server";

export async function loadOrderLines(
  db: DatabaseExecutor,
  orderId: string,
): Promise<PricedLineSnapshot[]> {
  // These helpers also run inside payment transactions, where pg provides one
  // Client. Sequential queries avoid overlapping work on that transaction client.
  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.sortOrder));
  const modifiers = await db
    .select({
      orderItemId: orderItemModifiers.orderItemId,
      groupId: orderItemModifiers.groupCode,
      groupName: orderItemModifiers.groupName,
      optionId: orderItemModifiers.optionCode,
      optionName: orderItemModifiers.optionName,
      priceDeltaCents: orderItemModifiers.priceDeltaCents,
      sortOrder: orderItemModifiers.sortOrder,
    })
    .from(orderItemModifiers)
    .innerJoin(orderItems, eq(orderItems.id, orderItemModifiers.orderItemId))
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItemModifiers.sortOrder));

  return items.map((item) => ({
    clientLineId: item.clientLineId,
    menuItemId: item.menuItemSlug,
    name: item.name,
    koreanName: item.koreanName ?? undefined,
    unitPriceCents: item.unitPriceCents,
    quantity: item.quantity,
    notes: item.notes ?? undefined,
    lineTotalCents: item.lineTotalCents,
    modifiers: modifiers
      .filter((modifier) => modifier.orderItemId === item.id)
      .map(({ orderItemId: _orderItemId, sortOrder: _sortOrder, ...modifier }) => modifier),
  }));
}

export async function loadOrderTimeline(db: DatabaseExecutor, orderId: string) {
  const events = await db
    .select()
    .from(orderStatusEvents)
    .where(eq(orderStatusEvents.orderId, orderId))
    .orderBy(asc(orderStatusEvents.createdAt));
  return events.map((event) => ({
    from: event.fromStatus,
    to: event.toStatus,
    occurredAt: event.createdAt.toISOString(),
    label: orderStatusLabel(event.toStatus),
  }));
}

export async function loadAdminOrderDetail(
  db: DatabaseExecutor,
  orderId: string,
): Promise<AdminOrderDetail | undefined> {
  const order = (await db.select().from(orders).where(eq(orders.id, orderId)).limit(1))[0];
  if (!order) return undefined;

  const lines = await loadOrderLines(db, orderId);
  const statusEvents = await loadOrderTimeline(db, orderId);
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfillmentMethod: "pickup",
    placedAt: (order.placedAt ?? order.createdAt).toISOString(),
    requestedFor: order.requestedFor.toISOString(),
    readyBy: order.readyBy?.toISOString() ?? null,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerEmail: order.customerEmail,
    customerNotes: order.customerNotes,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    totalCents: order.totalCents,
    currency: "AUD",
    version: order.version,
    lines,
    totals: {
      currency: "AUD",
      subtotalCents: order.subtotalCents,
      discountCents: order.discountCents,
      totalCents: order.totalCents,
    },
    statusEvents,
  };
}
