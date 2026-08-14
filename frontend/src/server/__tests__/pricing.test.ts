import { describe, expect, it } from "vitest";
import { priceOrder } from "../pricing.server";
import type { PricingMenuItem, PricingPromotion } from "../repositories/menu-repository.server";

const catalogItem: PricingMenuItem = {
  id: "menu-db-id",
  slug: "bibimbap",
  name: "Classic Bibimbap",
  koreanName: "비빔밥",
  priceCents: 1_990,
  active: true,
  soldOut: false,
  groups: [
    {
      id: "protein-db-id",
      code: "protein",
      name: "Protein",
      minSelect: 1,
      maxSelect: 1,
      options: [
        {
          id: "beef-db-id",
          code: "beef",
          name: "Beef",
          priceDeltaCents: 300,
          active: true,
        },
        {
          id: "tofu-db-id",
          code: "tofu",
          name: "Tofu",
          priceDeltaCents: 0,
          active: true,
        },
      ],
    },
  ],
};

const promotion: PricingPromotion = {
  id: "promo-id",
  code: "SEOUL10",
  discountType: "percent",
  value: 10,
  minimumSubtotalCents: 2_000,
  startsAt: null,
  endsAt: null,
  active: true,
  maxUses: null,
  useCount: 0,
};

function line(overrides: Record<string, unknown> = {}) {
  return {
    clientLineId: "line-1",
    menuItemId: "bibimbap",
    quantity: 1,
    modifierOptionIds: ["beef"],
    ...overrides,
  };
}

describe("priceOrder", () => {
  it("uses server catalog prices and snapshots modifiers", () => {
    const result = priceOrder({ lines: [line()], catalog: [catalogItem] });

    expect(result).toEqual({
      ok: true,
      data: {
        lines: [
          expect.objectContaining({
            menuItemId: "bibimbap",
            unitPriceCents: 1_990,
            lineTotalCents: 2_290,
            modifiers: [
              expect.objectContaining({
                groupId: "protein",
                optionId: "beef",
                priceDeltaCents: 300,
              }),
            ],
          }),
        ],
        totals: {
          currency: "AUD",
          subtotalCents: 2_290,
          discountCents: 0,
          totalCents: 2_290,
        },
        promotionId: undefined,
        promotionCode: undefined,
      },
    });
  });

  it("applies the promotion only at or above its server-side minimum", () => {
    const eligible = priceOrder({
      lines: [line()],
      catalog: [catalogItem],
      promotion,
    });
    expect(eligible.ok && eligible.data.totals).toEqual({
      currency: "AUD",
      subtotalCents: 2_290,
      discountCents: 229,
      totalCents: 2_061,
    });

    const ineligible = priceOrder({
      lines: [line({ modifierOptionIds: ["tofu"] })],
      catalog: [catalogItem],
      promotion,
    });
    expect(ineligible).toMatchObject({ ok: false, error: { code: "PROMO_INVALID" } });
  });

  it("rejects missing, duplicate, foreign, and over-limit modifiers", () => {
    const missing = priceOrder({
      lines: [line({ modifierOptionIds: [] })],
      catalog: [catalogItem],
    });
    const duplicate = priceOrder({
      lines: [line({ modifierOptionIds: ["beef", "beef"] })],
      catalog: [catalogItem],
    });
    const foreign = priceOrder({
      lines: [line({ modifierOptionIds: ["not-for-this-product"] })],
      catalog: [catalogItem],
    });
    const overLimit = priceOrder({
      lines: [line({ modifierOptionIds: ["beef", "tofu"] })],
      catalog: [catalogItem],
    });

    for (const result of [missing, duplicate, foreign, overLimit]) {
      expect(result).toMatchObject({ ok: false, error: { code: "INVALID_MODIFIERS" } });
    }
  });

  it("rejects sold-out products and unsafe quantities", () => {
    const unavailable = priceOrder({
      lines: [line()],
      catalog: [{ ...catalogItem, soldOut: true }],
    });
    const invalidQuantity = priceOrder({
      lines: [line({ quantity: 21 })],
      catalog: [catalogItem],
    });

    expect(unavailable).toMatchObject({
      ok: false,
      error: { code: "MENU_ITEM_UNAVAILABLE" },
    });
    expect(invalidQuantity).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });
});
