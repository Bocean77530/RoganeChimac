import { and, asc, eq, inArray, max, sql } from "drizzle-orm";
import type { Database, DatabaseExecutor } from "@/db/client.server";
import {
  menuCategories,
  menuImages,
  menuItems,
  modifierGroups,
  modifierOptions,
  promotions,
  restaurants,
} from "@/db/schema";
import type { CreateMenuItemInput, DietTag, MenuCatalog, MenuItemView } from "@/domain/menu";

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

export async function loadMenuCatalog(
  db: DatabaseExecutor,
  restaurantSlug: string,
): Promise<MenuCatalog | undefined> {
  const restaurant = await findRestaurantBySlug(db, restaurantSlug);
  if (!restaurant) return undefined;

  const categories = await db
    .select({
      id: menuCategories.id,
      slug: menuCategories.slug,
      name: menuCategories.name,
      sortOrder: menuCategories.sortOrder,
    })
    .from(menuCategories)
    .where(and(eq(menuCategories.restaurantId, restaurant.id), eq(menuCategories.active, true)))
    .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.name));

  const rows = await db
    .select({
      itemId: menuItems.id,
      itemSlug: menuItems.slug,
      itemName: menuItems.name,
      itemKoreanName: menuItems.koreanName,
      itemDescription: menuItems.description,
      itemImageKey: menuItems.imageKey,
      itemPriceCents: menuItems.priceCents,
      itemSoldOut: menuItems.soldOut,
      itemPopular: menuItems.popular,
      itemChefsPick: menuItems.chefsPick,
      itemDietTags: menuItems.dietTags,
      itemSpiceLevel: menuItems.spiceLevel,
      itemSortOrder: menuItems.sortOrder,
      categoryId: menuCategories.id,
      categorySlug: menuCategories.slug,
      groupId: modifierGroups.id,
      groupCode: modifierGroups.code,
      groupName: modifierGroups.name,
      groupMin: modifierGroups.minSelect,
      groupMax: modifierGroups.maxSelect,
      optionId: modifierOptions.id,
      optionCode: modifierOptions.code,
      optionName: modifierOptions.name,
      optionPriceDelta: modifierOptions.priceDeltaCents,
    })
    .from(menuItems)
    .innerJoin(menuCategories, eq(menuCategories.id, menuItems.categoryId))
    .leftJoin(modifierGroups, eq(modifierGroups.menuItemId, menuItems.id))
    .leftJoin(
      modifierOptions,
      and(eq(modifierOptions.modifierGroupId, modifierGroups.id), eq(modifierOptions.active, true)),
    )
    .where(
      and(
        eq(menuItems.restaurantId, restaurant.id),
        eq(menuItems.active, true),
        eq(menuCategories.active, true),
      ),
    )
    .orderBy(
      asc(menuCategories.sortOrder),
      asc(menuItems.sortOrder),
      asc(modifierGroups.sortOrder),
      asc(modifierOptions.sortOrder),
    );

  const items = new Map<string, MenuItemView>();
  for (const row of rows) {
    let item = items.get(row.itemId);
    if (!item) {
      item = {
        id: row.itemId,
        slug: row.itemSlug,
        name: row.itemName,
        koreanName: row.itemKoreanName,
        description: row.itemDescription,
        imageKey: row.itemImageKey,
        priceCents: row.itemPriceCents,
        categoryId: row.categoryId,
        categorySlug: row.categorySlug,
        soldOut: row.itemSoldOut,
        popular: row.itemPopular,
        chefsPick: row.itemChefsPick,
        dietTags: row.itemDietTags as DietTag[],
        spiceLevel: row.itemSpiceLevel as 0 | 1 | 2 | 3,
        sortOrder: row.itemSortOrder,
        modifiers: [],
      };
      items.set(row.itemId, item);
    }

    if (!row.groupId || !row.groupCode || !row.groupName) continue;
    let group = item.modifiers.find((candidate) => candidate.id === row.groupCode);
    if (!group) {
      group = {
        id: row.groupCode,
        name: row.groupName,
        minSelect: row.groupMin ?? 0,
        maxSelect: row.groupMax ?? 0,
        options: [],
      };
      item.modifiers.push(group);
    }
    if (row.optionId && row.optionCode && row.optionName) {
      group.options.push({
        id: row.optionCode,
        name: row.optionName,
        priceDeltaCents: row.optionPriceDelta ?? 0,
      });
    }
  }

  return { categories, items: [...items.values()] };
}

export async function insertMenuItem(
  db: DatabaseExecutor,
  input: CreateMenuItemInput,
): Promise<{ id: string }> {
  const restaurant = await findRestaurantBySlug(db, input.restaurantSlug);
  if (!restaurant) throw new Error("Restaurant not found.");

  const category = (
    await db
      .select({ id: menuCategories.id })
      .from(menuCategories)
      .where(
        and(
          eq(menuCategories.id, input.categoryId),
          eq(menuCategories.restaurantId, restaurant.id),
          eq(menuCategories.active, true),
        ),
      )
      .limit(1)
  )[0];
  if (!category) throw new Error("Menu category not found.");

  const [sortResult] = await db
    .select({ highest: max(menuItems.sortOrder) })
    .from(menuItems)
    .where(eq(menuItems.categoryId, category.id));

  const baseSlug = slugify(input.name);
  const slug = `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;
  const id = crypto.randomUUID();
  await db.insert(menuItems).values({
    id,
    restaurantId: restaurant.id,
    categoryId: category.id,
    slug,
    name: input.name,
    koreanName: input.koreanName || null,
    description: input.description,
    imageKey: input.imageKey,
    priceCents: input.priceCents,
    active: true,
    soldOut: input.soldOut,
    popular: input.popular,
    chefsPick: input.chefsPick,
    dietTags: input.dietTags,
    spiceLevel: input.spiceLevel,
    sortOrder: (sortResult?.highest ?? -1) + 1,
  });
  return { id };
}

export async function deleteMenuItem(
  db: DatabaseExecutor,
  restaurantSlug: string,
  menuItemId: string,
): Promise<boolean> {
  const restaurant = await findRestaurantBySlug(db, restaurantSlug);
  if (!restaurant) return false;
  const deleted = await db
    .delete(menuItems)
    .where(and(eq(menuItems.id, menuItemId), eq(menuItems.restaurantId, restaurant.id)))
    .returning({ id: menuItems.id });
  return deleted.length > 0;
}

export type UpsertMenuItemImageInput = {
  restaurantSlug: string;
  menuItemId: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  dataBase64: string;
  byteSize: number;
  sha256: string;
};

export async function upsertMenuItemImage(
  db: Database,
  input: UpsertMenuItemImageInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const restaurant = await findRestaurantBySlug(tx, input.restaurantSlug);
    if (!restaurant) throw new Error("Restaurant not found.");

    const item = (
      await tx
        .select({ id: menuItems.id })
        .from(menuItems)
        .where(
          and(
            eq(menuItems.id, input.menuItemId),
            eq(menuItems.restaurantId, restaurant.id),
            eq(menuItems.active, true),
          ),
        )
        .limit(1)
    )[0];
    if (!item) throw new Error("Menu item not found.");

    const [stored] = await tx
      .insert(menuImages)
      .values({
        id: crypto.randomUUID(),
        menuItemId: item.id,
        contentType: input.contentType,
        dataBase64: input.dataBase64,
        byteSize: input.byteSize,
        sha256: input.sha256,
      })
      .onConflictDoUpdate({
        target: menuImages.menuItemId,
        set: {
          contentType: input.contentType,
          dataBase64: input.dataBase64,
          byteSize: input.byteSize,
          sha256: input.sha256,
          updatedAt: new Date(),
        },
      })
      .returning({ id: menuImages.id });
    if (!stored) throw new Error("The menu image could not be saved.");

    await tx
      .update(menuItems)
      .set({
        imageKey: `uploaded:${stored.id}:${input.sha256}`,
        revision: sql`${menuItems.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(menuItems.id, item.id));
  });
}

export async function findMenuImage(db: DatabaseExecutor, imageId: string) {
  return (
    await db
      .select({
        contentType: menuImages.contentType,
        dataBase64: menuImages.dataBase64,
        byteSize: menuImages.byteSize,
        sha256: menuImages.sha256,
        updatedAt: menuImages.updatedAt,
      })
      .from(menuImages)
      .where(eq(menuImages.id, imageId))
      .limit(1)
  )[0];
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "menu-item";
}
