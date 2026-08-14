import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { KitchenTicket as KitchenTicketData } from "../../domain/integrations";
import { KitchenTicket } from "./KitchenTicket";

const ticket: KitchenTicketData = {
  restaurantName: "Seoul Table",
  placedAt: "2026-08-14T09:30:00.000Z",
  orderNotes: "PEANUT ALLERGY",
  copyNumber: 2,
  order: {
    id: "order-1",
    orderNumber: "ST-1001",
    requestedFor: "2026-08-14T10:00:00.000Z",
    customerName: "Alex Kim",
    customerPhone: "0400 000 000",
    tender: "PREPAID_ONLINE",
    lines: [
      {
        clientLineId: "line-1",
        menuItemId: "kfc",
        name: "Korean Fried Chicken",
        unitPriceCents: 1_790,
        quantity: 2,
        modifiers: [
          {
            groupId: "flavour",
            groupName: "Flavour",
            optionId: "soy-garlic",
            optionName: "Soy Garlic",
            priceDeltaCents: 0,
          },
        ],
        notes: "Sauce on side",
        lineTotalCents: 3_580,
      },
    ],
    totals: {
      currency: "AUD",
      subtotalCents: 3_580,
      discountCents: 0,
      totalCents: 3_580,
    },
  },
};

describe("KitchenTicket", () => {
  it("renders pickup, payment, modifiers, notes and reprint markers", () => {
    const markup = renderToStaticMarkup(<KitchenTicket ticket={ticket} />);

    expect(markup).toContain("ST-1001");
    expect(markup).toContain("PAID ONLINE");
    expect(markup).toContain("REPRINT #2");
    expect(markup).toContain("Flavour: Soy Garlic");
    expect(markup).toContain("ITEM NOTE: Sauce on side");
    expect(markup).toContain("PEANUT ALLERGY");
  });
});
