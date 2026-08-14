import { categories, menu } from "@/lib/menu-data";
import { restaurant } from "@/lib/restaurant";

const dayNumbers: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

export const restaurantSeed = {
  slug: "seoul-table",
  name: restaurant.name,
  timezone: "Australia/Melbourne",
  currency: "AUD" as const,
  addressLine1: restaurant.address.line1,
  suburb: restaurant.address.suburb,
  country: restaurant.address.country,
  phone: restaurant.phone,
  email: restaurant.email,
  abn: restaurant.abn,
  pickupPrepMinutes: restaurant.ordering.pickupPrepMinutes,
  pickupSlotIntervalMinutes: 15,
  pickupBookingDays: 7,
  pickupCapacityPerSlot: 8,
};

export const businessHoursSeed = restaurant.hours.map((hours, sortOrder) => ({
  dayOfWeek: dayNumbers[hours.day]!,
  opensAt: hours.open,
  closesAt: hours.close,
  sortOrder,
}));

// "Popular" is a derived collection rather than a real menu category.
export const categorySeed = categories
  .filter((category) => category.id !== "popular")
  .map((category, sortOrder) => ({
    slug: category.id,
    name: category.name,
    sortOrder,
  }));

export const menuSeed = menu.map((item, sortOrder) => ({
  slug: item.id,
  name: item.name,
  koreanName: item.koreanName,
  description: item.description,
  categorySlug: item.category,
  // The frontend can map this stable key to its existing bundled image import.
  imageKey: item.id,
  priceCents: item.price,
  soldOut: item.soldOut ?? false,
  popular: item.popular ?? false,
  chefsPick: item.chefsPick ?? false,
  sortOrder,
  modifiers: (item.modifiers ?? []).map((group, groupSortOrder) => ({
    code: group.id,
    name: group.name,
    minSelect: group.min ?? (group.required ? 1 : 0),
    maxSelect: group.max ?? (group.required ? 1 : group.options.length),
    sortOrder: groupSortOrder,
    options: group.options.map((option, optionSortOrder) => ({
      code: option.id,
      name: option.name,
      priceDeltaCents: option.priceDelta ?? 0,
      sortOrder: optionSortOrder,
    })),
  })),
}));

export const promotionSeed = {
  code: "SEOUL10",
  discountType: "percent" as const,
  value: 10,
  minimumSubtotalCents: 2_000,
};
