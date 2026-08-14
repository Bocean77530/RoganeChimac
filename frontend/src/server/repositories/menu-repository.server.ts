import { and, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/client.server";
import { menuItems, modifierGroups, modifierOptions, promotions, restaurants } from "@/db/schema";

export type PricingModifierOption = {
  id: string;
  code: string;
  name: string;
  priceDeltaCents: number;
  active: boolean;
};

export type PricingModifierGroup = {
  id: string;
  code: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: PricingModifierOption[];
};

export type PricingMenuItem = {
  id: string;
  slug: string;
  name: string;
  koreanName: string | null;
  priceCents: number;
  active: boolean;
  soldOut: boolean;
  groups: PricingModifierGroup[];
};

export type PricingPromotion = {
  id: string;
  code: string;
  discountType: "percent" | "fixed";
  value: number;
  minimumSubtotalCents: number;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
  maxUses: number | null;
  useCount: number;
};

export async function findRestaurantBySlug(db: DatabaseExecutor, slug: string) {
  return (await db.select().from(restaurants).where(eq(restaurants.slug, slug)).limit(1))[0];
}

export async function loadPricingItems(
  db: DatabaseExecutor,
  restaurantId: string,
  itemSlugs: string[],
): Promise<PricingMenuItem[]> {
  if (itemSlugs.length === 0) return [];

  const rows = await db
    .select({
      itemId: menuItems.id,
      itemSlug: menuItems.slug,
      itemName: menuItems.name,
      itemKoreanName: menuItems.koreanName,
      itemPriceCents: menuItems.priceCents,
      itemActive: menuItems.active,
      itemSoldOut: menuItems.soldOut,
      groupId: modifierGroups.id,
      groupCode: modifierGroups.code,
      groupName: modifierGroups.name,
      groupMin: modifierGroups.minSelect,
      groupMax: modifierGroups.maxSelect,
      optionId: modifierOptions.id,
      optionCode: modifierOptions.code,
      optionName: modifierOptions.name,
      optionPriceDelta: modifierOptions.priceDeltaCents,
      optionActive: modifierOptions.active,
    })
    .from(menuItems)
    .leftJoin(modifierGroups, eq(modifierGroups.menuItemId, menuItems.id))
    .leftJoin(modifierOptions, eq(modifierOptions.modifierGroupId, modifierGroups.id))
    .where(
      and(
        eq(menuItems.restaurantId, restaurantId),
        inArray(menuItems.slug, [...new Set(itemSlugs)]),
      ),
    )
    .orderBy(menuItems.sortOrder, modifierGroups.sortOrder, modifierOptions.sortOrder);

  const items = new Map<string, PricingMenuItem>();
  for (const row of rows) {
    let item = items.get(row.itemId);
    if (!item) {
      item = {
        id: row.itemId,
        slug: row.itemSlug,
        name: row.itemName,
        koreanName: row.itemKoreanName,
        priceCents: row.itemPriceCents,
        active: row.itemActive,
        soldOut: row.itemSoldOut,
        groups: [],
      };
      items.set(row.itemId, item);
    }

    if (!row.groupId || !row.groupCode || !row.groupName) continue;
    let group = item.groups.find((candidate) => candidate.id === row.groupId);
    if (!group) {
      group = {
        id: row.groupId,
        code: row.groupCode,
        name: row.groupName,
        minSelect: row.groupMin ?? 0,
        maxSelect: row.groupMax ?? 0,
        options: [],
      };
      item.groups.push(group);
    }

    if (
      row.optionId &&
      row.optionCode &&
      row.optionName &&
      !group.options.some((option) => option.id === row.optionId)
    ) {
      group.options.push({
        id: row.optionId,
        code: row.optionCode,
        name: row.optionName,
        priceDeltaCents: row.optionPriceDelta ?? 0,
        active: row.optionActive ?? false,
      });
    }
  }

  return [...items.values()];
}

export async function findPromotion(
  db: DatabaseExecutor,
  restaurantId: string,
  code: string,
): Promise<PricingPromotion | undefined> {
  return (
    await db
      .select()
      .from(promotions)
      .where(
        and(
          eq(promotions.restaurantId, restaurantId),
          sql`lower(${promotions.code}) = lower(${code})`,
        ),
      )
      .limit(1)
  )[0];
}
