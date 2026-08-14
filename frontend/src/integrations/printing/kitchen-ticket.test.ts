import { describe, expect, it } from "vitest";

import type { AdminOrderDetail } from "../../domain/order";
import { createKitchenTicket, groupLineModifiers } from "./kitchen-ticket.ts";

const order: AdminOrderDetail = {
  id: "order-1",
  orderNumber: "ST-1001",
  status: "accepted",
  paymentStatus: "paid",
  fulfillmentMethod: "pickup",
  placedAt: "2026-08-14T09:30:00.000Z",
  requestedFor: "2026-08-14T10:00:00.000Z",
  readyBy: "2026-08-14T10:00:00.000Z",
  customerName: "Alex Kim",
  customerPhone: "0400000000",
  customerEmail: "alex@example.com",
  customerNotes: "Sesame allergy",
  itemCount: 1,
  totalCents: 2_290,
  currency: "AUD",
  version: 2,
  lines: [
    {
      clientLineId: "line-1",
      menuItemId: "bibimbap",
      name: "Beef Bibimbap",
      unitPriceCents: 2_290,
      quantity: 1,
      lineTotalCents: 2_290,
      modifiers: [
        {
          groupId: "spice",
          groupName: "Spice",
          optionId: "mild",
          optionName: "Mild",
          priceDeltaCents: 0,
        },
        {
          groupId: "extras",
          groupName: "Extras",
          optionId: "egg",
          optionName: "Egg",
          priceDeltaCents: 0,
        },
        {
          groupId: "extras",
          groupName: "Extras",
          optionId: "kimchi",
          optionName: "Kimchi",
          priceDeltaCents: 0,
        },
      ],
    },
  ],
  totals: { currency: "AUD", subtotalCents: 2_290, discountCents: 0, totalCents: 2_290 },
  statusEvents: [],
};

describe("kitchen ticket", () => {
  it("creates a prepaid kitchen ticket from the immutable order snapshot", () => {
    const ticket = createKitchenTicket({ order, restaurantName: "Seoul Table", copyNumber: 2 });

    expect(ticket.copyNumber).toBe(2);
    expect(ticket.order.tender).toBe("PREPAID_ONLINE");
    expect(ticket.orderNotes).toBe("Sesame allergy");
    expect(ticket.order.lines[0]?.name).toBe("Beef Bibimbap");
  });

  it("groups modifier options without losing their display order", () => {
    expect(groupLineModifiers(order.lines[0]?.modifiers ?? [])).toEqual([
      { groupId: "spice", groupName: "Spice", optionNames: ["Mild"] },
      { groupId: "extras", groupName: "Extras", optionNames: ["Egg", "Kimchi"] },
    ]);
  });

  it("rejects an unpaid kitchen ticket", () => {
    expect(() =>
      createKitchenTicket({
        order: { ...order, paymentStatus: "pending" },
        restaurantName: "Seoul Table",
      }),
    ).toThrow(/paid orders/);
  });
});
