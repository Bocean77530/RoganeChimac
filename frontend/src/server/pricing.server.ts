import "@tanstack/react-start/server-only";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ServiceResult } from "@/domain/common";
import type {
  CheckoutDraftLine,
  OrderQuote,
  OrderTotalsSnapshot,
  PricedLineSnapshot,
  QuoteOrderInput,
} from "@/domain/order";
import { orderQuotes } from "@/db/schema";
import { withDatabase } from "@/db/client.server";
import { hashObject } from "./crypto.server";
import { resolvePickupSelection } from "./availability.server";
import {
  findPromotion,
  findRestaurantBySlug,
  loadPricingItems,
  type PricingMenuItem,
  type PricingPromotion,
} from "./repositories/menu-repository.server";
import { failure, internalError, serviceError, success } from "./service-errors.server";

const draftLineSchema = z.object({
  clientLineId: z.string().trim().min(1).max(100),
  menuItemId: z.string().trim().min(1).max(100),
  quantity: z.number().int().min(1).max(20),
  modifierOptionIds: z.array(z.string().trim().min(1).max(100)).max(20),
  notes: z.string().trim().max(300).optional(),
});

const quoteOrderSchema = z.object({
  restaurantSlug: z.string().trim().min(1).max(80),
  fulfillment: z.discriminatedUnion("mode", [
    z.object({ type: z.literal("pickup"), mode: z.literal("asap") }),
    z.object({
      type: z.literal("pickup"),
      mode: z.literal("scheduled"),
      slotId: z.string().uuid(),
    }),
  ]),
  lines: z.array(draftLineSchema).min(1).max(50),
  promoCode: z.string().trim().max(64).optional(),
});

export type PriceOrderResult = {
  lines: PricedLineSnapshot[];
  totals: OrderTotalsSnapshot;
  promotionId?: string;
  promotionCode?: string;
};

function invalidModifiers(message: string): ServiceResult<PriceOrderResult> {
  return failure(serviceError("INVALID_MODIFIERS", message));
}

function checkedMoney(value: number): number | null {
  return Number.isSafeInteger(value) && value >= 0 && value <= 10_000_000 ? value : null;
}

export function priceOrder(input: {
  lines: CheckoutDraftLine[];
  catalog: PricingMenuItem[];
  promotion?: PricingPromotion;
  now?: Date;
}): ServiceResult<PriceOrderResult> {
  const now = input.now ?? new Date();
  const catalog = new Map(input.catalog.map((item) => [item.slug, item]));
  const clientLineIds = new Set<string>();
  const pricedLines: PricedLineSnapshot[] = [];

  for (const line of input.lines) {
    if (
      !line.clientLineId ||
      clientLineIds.has(line.clientLineId) ||
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > 20 ||
      (line.notes?.length ?? 0) > 300
    ) {
      return failure(serviceError("VALIDATION_ERROR", "The cart contains an invalid line."));
    }
    clientLineIds.add(line.clientLineId);

    const item = catalog.get(line.menuItemId);
    if (!item || !item.active || item.soldOut) {
      return failure(
        serviceError("MENU_ITEM_UNAVAILABLE", `${line.menuItemId} is no longer available.`),
      );
    }

    const requestedIds = line.modifierOptionIds;
    if (new Set(requestedIds).size !== requestedIds.length) {
      return invalidModifiers(`Duplicate modifiers were selected for ${item.name}.`);
    }

    const selectedByGroup = new Map<string, (typeof item.groups)[number]["options"]>();
    const allSelected = [];
    for (const selectedId of requestedIds) {
      const matching = item.groups.flatMap((group) =>
        group.options
          .filter((option) => option.id === selectedId || option.code === selectedId)
          .map((option) => ({ group, option })),
      );
      if (matching.length !== 1 || !matching[0]!.option.active) {
        return invalidModifiers(`A selected modifier is not available for ${item.name}.`);
      }
      const { group, option } = matching[0]!;
      const selected = selectedByGroup.get(group.id) ?? [];
      selected.push(option);
      selectedByGroup.set(group.id, selected);
      allSelected.push({ group, option });
    }

    for (const group of item.groups) {
      const count = selectedByGroup.get(group.id)?.length ?? 0;
      if (count < group.minSelect || count > group.maxSelect) {
        return invalidModifiers(
          `${group.name} requires between ${group.minSelect} and ${group.maxSelect} selections.`,
        );
      }
    }

    const modifiers = allSelected.map(({ group, option }) => ({
      groupId: group.code,
      groupName: group.name,
      optionId: option.code,
      optionName: option.name,
      priceDeltaCents: option.priceDeltaCents,
    }));
    const unitPriceCents =
      item.priceCents + modifiers.reduce((sum, modifier) => sum + modifier.priceDeltaCents, 0);
    const lineTotalCents = checkedMoney(unitPriceCents * line.quantity);
    if (unitPriceCents < 0 || lineTotalCents === null) {
      return failure(serviceError("VALIDATION_ERROR", "The order amount is invalid."));
    }

    pricedLines.push({
      clientLineId: line.clientLineId,
      menuItemId: item.slug,
      name: item.name,
      koreanName: item.koreanName ?? undefined,
      unitPriceCents: item.priceCents,
      quantity: line.quantity,
      modifiers,
      notes: line.notes?.trim() || undefined,
      lineTotalCents,
    });
  }

  const subtotalCents = checkedMoney(
    pricedLines.reduce((sum, line) => sum + line.lineTotalCents, 0),
  );
  if (subtotalCents === null || subtotalCents === 0) {
    return failure(serviceError("VALIDATION_ERROR", "The order total is invalid."));
  }

  let discountCents = 0;
  const promotion = input.promotion;
  if (promotion) {
    const eligible =
      promotion.active &&
      (!promotion.startsAt || promotion.startsAt <= now) &&
      (!promotion.endsAt || promotion.endsAt > now) &&
      (promotion.maxUses === null || promotion.useCount < promotion.maxUses) &&
      subtotalCents >= promotion.minimumSubtotalCents;
    if (!eligible) {
      return failure(serviceError("PROMO_INVALID", "The promo code is invalid or ineligible."));
    }
    discountCents =
      promotion.discountType === "percent"
        ? Math.round((subtotalCents * promotion.value) / 100)
        : promotion.value;
    discountCents = Math.min(subtotalCents, discountCents);
  }

  return success({
    lines: pricedLines,
    totals: {
      currency: "AUD",
      subtotalCents,
      discountCents,
      totalCents: subtotalCents - discountCents,
    },
    promotionId: promotion?.id,
    promotionCode: promotion?.code,
  });
}

export async function quoteOrder(rawInput: QuoteOrderInput): Promise<ServiceResult<OrderQuote>> {
  const parsed = quoteOrderSchema.safeParse(rawInput);
  if (!parsed.success) {
    return failure(
      serviceError("VALIDATION_ERROR", "Please check the order details.", false, {
        order: parsed.error.issues.map((issue) => issue.message),
      }),
    );
  }

  const input = parsed.data;
  const now = new Date();
  try {
    return await withDatabase(async (db) => {
      const restaurant = await findRestaurantBySlug(db, input.restaurantSlug);
      if (!restaurant) {
        return failure(serviceError("RESTAURANT_NOT_FOUND", "Restaurant not found."));
      }
      if (!restaurant.orderingEnabled) {
        return failure(serviceError("ORDERING_DISABLED", "Online ordering is unavailable."));
      }

      const slot = await resolvePickupSelection(db, restaurant, input.fulfillment, now);
      if (!slot) {
        return failure(
          serviceError("PICKUP_SLOT_UNAVAILABLE", "That pickup time is no longer available."),
        );
      }

      const catalog = await loadPricingItems(
        db,
        restaurant.id,
        input.lines.map((line) => line.menuItemId),
      );
      const promotion = input.promoCode
        ? await findPromotion(db, restaurant.id, input.promoCode)
        : undefined;
      if (input.promoCode && !promotion) {
        return failure(serviceError("PROMO_INVALID", "The promo code is invalid or ineligible."));
      }

      const priced = priceOrder({ lines: input.lines, catalog, promotion, now });
      if (!priced.ok) return priced;

      const quoteId = crypto.randomUUID();
      const ttlSeconds = Math.max(60, Number(process.env.QUOTE_TTL_SECONDS ?? 600));
      const expiresAt = new Date(now.getTime() + ttlSeconds * 1_000);
      await db.insert(orderQuotes).values({
        id: quoteId,
        restaurantId: restaurant.id,
        pickupSlotId: slot.id,
        requestHash: await hashObject(input),
        linesSnapshot: priced.data.lines,
        currency: priced.data.totals.currency,
        subtotalCents: priced.data.totals.subtotalCents,
        discountCents: priced.data.totals.discountCents,
        totalCents: priced.data.totals.totalCents,
        promotionId: priced.data.promotionId,
        promotionCode: priced.data.promotionCode,
        expiresAt,
      });

      return success({
        quoteId,
        expiresAt: expiresAt.toISOString(),
        fulfillment: { slotId: slot.id, pickupAt: slot.startsAt.toISOString() },
        lines: priced.data.lines,
        totals: priced.data.totals,
      });
    });
  } catch (error) {
    console.error("Failed to create order quote", error);
    return failure(internalError());
  }
}

export const quoteOrderServerFn = createServerFn({ method: "POST" })
  .validator(quoteOrderSchema)
  .handler(({ data }) => quoteOrder(data));
