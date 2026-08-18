import { and, eq } from "drizzle-orm";
import { withDatabase } from "./client.server";
import {
  businessHours,
  menuCategories,
  menuItems,
  modifierGroups,
  modifierOptions,
  promotions,
  restaurants,
} from "./schema";
import {
  businessHoursSeed,
  categorySeed,
  menuSeed,
  promotionSeed,
  restaurantSeed,
} from "./seed-data";

export async function seedDatabase(): Promise<void> {
  await withDatabase(async (db) => {
    await db.transaction(async (tx) => {
      const [restaurantRow] = await tx
        .insert(restaurants)
        .values({ id: crypto.randomUUID(), ...restaurantSeed })
        .onConflictDoUpdate({
          target: restaurants.slug,
          set: {
            name: restaurantSeed.name,
            timezone: restaurantSeed.timezone,
            currency: restaurantSeed.currency,
            addressLine1: restaurantSeed.addressLine1,
            suburb: restaurantSeed.suburb,
            country: restaurantSeed.country,
            phone: restaurantSeed.phone,
            email: restaurantSeed.email,
            abn: restaurantSeed.abn,
            pickupPrepMinutes: restaurantSeed.pickupPrepMinutes,
            pickupSlotIntervalMinutes: restaurantSeed.pickupSlotIntervalMinutes,
            pickupBookingDays: restaurantSeed.pickupBookingDays,
            pickupCapacityPerSlot: restaurantSeed.pickupCapacityPerSlot,
            updatedAt: new Date(),
          },
        })
        .returning({ id: restaurants.id });

      if (!restaurantRow) throw new Error("Failed to seed restaurant");

      // Preserve historical order snapshots while hiding superseded demo data.
      // The current menu/categories are reactivated by the upserts below.
      await tx
        .update(menuItems)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(menuItems.restaurantId, restaurantRow.id));
      await tx
        .update(menuCategories)
        .set({ active: false })
        .where(eq(menuCategories.restaurantId, restaurantRow.id));

      for (const hours of businessHoursSeed) {
        await tx
          .insert(businessHours)
          .values({ id: crypto.randomUUID(), restaurantId: restaurantRow.id, ...hours })
          .onConflictDoUpdate({
            target: [businessHours.restaurantId, businessHours.dayOfWeek, businessHours.opensAt],
            set: { closesAt: hours.closesAt, sortOrder: hours.sortOrder },
          });
      }

      const categoryIds = new Map<string, string>();
      for (const category of categorySeed) {
        const [row] = await tx
          .insert(menuCategories)
          .values({ id: crypto.randomUUID(), restaurantId: restaurantRow.id, ...category })
          .onConflictDoUpdate({
            target: [menuCategories.restaurantId, menuCategories.slug],
            set: { name: category.name, sortOrder: category.sortOrder, active: true },
          })
          .returning({ id: menuCategories.id });
        if (!row) throw new Error(`Failed to seed category ${category.slug}`);
        categoryIds.set(category.slug, row.id);
      }

      for (const item of menuSeed) {
        const categoryId = categoryIds.get(item.categorySlug);
        if (!categoryId) throw new Error(`Missing category ${item.categorySlug}`);

        const [itemRow] = await tx
          .insert(menuItems)
          .values({
            id: crypto.randomUUID(),
            restaurantId: restaurantRow.id,
            categoryId,
            slug: item.slug,
            name: item.name,
            koreanName: item.koreanName,
            description: item.description,
            imageKey: item.imageKey,
            priceCents: item.priceCents,
            active: true,
            soldOut: item.soldOut,
            popular: item.popular,
            chefsPick: item.chefsPick,
            dietTags: item.dietTags,
            spiceLevel: item.spiceLevel,
            sortOrder: item.sortOrder,
          })
          .onConflictDoUpdate({
            target: [menuItems.restaurantId, menuItems.slug],
            set: {
              categoryId,
              name: item.name,
              koreanName: item.koreanName,
              description: item.description,
              priceCents: item.priceCents,
              active: true,
              soldOut: item.soldOut,
              popular: item.popular,
              chefsPick: item.chefsPick,
              dietTags: item.dietTags,
              spiceLevel: item.spiceLevel,
              sortOrder: item.sortOrder,
              updatedAt: new Date(),
            },
          })
          .returning({ id: menuItems.id });

        if (!itemRow) throw new Error(`Failed to seed menu item ${item.slug}`);

        // Modifier groups are not soft-deletable. Rebuild them so a changed
        // photographed menu cannot retain obsolete demo choices.
        await tx.delete(modifierGroups).where(eq(modifierGroups.menuItemId, itemRow.id));

        for (const group of item.modifiers) {
          const [groupRow] = await tx
            .insert(modifierGroups)
            .values({
              id: crypto.randomUUID(),
              menuItemId: itemRow.id,
              code: group.code,
              name: group.name,
              minSelect: group.minSelect,
              maxSelect: group.maxSelect,
              sortOrder: group.sortOrder,
            })
            .onConflictDoUpdate({
              target: [modifierGroups.menuItemId, modifierGroups.code],
              set: {
                name: group.name,
                minSelect: group.minSelect,
                maxSelect: group.maxSelect,
                sortOrder: group.sortOrder,
              },
            })
            .returning({ id: modifierGroups.id });

          if (!groupRow) throw new Error(`Failed to seed modifier group ${group.code}`);

          for (const option of group.options) {
            await tx
              .insert(modifierOptions)
              .values({
                id: crypto.randomUUID(),
                modifierGroupId: groupRow.id,
                code: option.code,
                name: option.name,
                priceDeltaCents: option.priceDeltaCents,
                sortOrder: option.sortOrder,
                active: true,
              })
              .onConflictDoUpdate({
                target: [modifierOptions.modifierGroupId, modifierOptions.code],
                set: {
                  name: option.name,
                  priceDeltaCents: option.priceDeltaCents,
                  sortOrder: option.sortOrder,
                  active: true,
                },
              });
          }
        }
      }

      const existingPromotion = await tx
        .select({ id: promotions.id })
        .from(promotions)
        .where(
          and(
            eq(promotions.restaurantId, restaurantRow.id),
            eq(promotions.code, promotionSeed.code),
          ),
        )
        .limit(1);

      if (existingPromotion[0]) {
        await tx
          .update(promotions)
          .set({ ...promotionSeed, active: true, updatedAt: new Date() })
          .where(eq(promotions.id, existingPromotion[0].id));
      } else {
        await tx.insert(promotions).values({
          id: crypto.randomUUID(),
          restaurantId: restaurantRow.id,
          ...promotionSeed,
        });
      }
    });
  });
}
