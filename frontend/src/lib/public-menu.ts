import { useQuery } from "@tanstack/react-query";
import { getMenuCatalogFn } from "@/api/menu";
import type { MenuCatalog } from "@/domain/menu";
import { imageForMenuKey, type Category, type MenuItem } from "@/lib/menu-data";
import { restaurant } from "@/lib/restaurant";

export function usePublicMenu(initialData?: MenuCatalog) {
  return useQuery({
    queryKey: ["menu", restaurant.slug],
    queryFn: () => getMenuCatalogFn({ data: { restaurantSlug: restaurant.slug } }),
    initialData,
    staleTime: 30_000,
  });
}

export function publicCategories(catalog: MenuCatalog): Category[] {
  const categories = catalog.categories.map(({ slug, name }) => ({ id: slug, name }));
  return catalog.items.some((item) => item.popular)
    ? [{ id: "popular", name: "Popular" }, ...categories]
    : categories;
}

export function publicMenuItems(catalog: MenuCatalog): MenuItem[] {
  return catalog.items.map((item) => ({
    id: item.slug,
    name: item.name,
    koreanName: item.koreanName ?? undefined,
    description: item.description,
    price: item.priceCents,
    image: imageForMenuKey(item.imageKey),
    category: item.categorySlug,
    diet: item.dietTags,
    spice: item.spiceLevel,
    popular: item.popular,
    chefsPick: item.chefsPick,
    soldOut: item.soldOut,
    modifiers: item.modifiers.map((group) => ({
      id: group.id,
      name: group.name,
      required: group.minSelect > 0,
      min: group.minSelect,
      max: group.maxSelect,
      options: group.options.map((option) => ({
        id: option.id,
        name: option.name,
        priceDelta: option.priceDeltaCents,
      })),
    })),
  }));
}

export function groupPublicMenu(
  categories: Category[],
  items: MenuItem[],
): Record<string, MenuItem[]> {
  const grouped: Record<string, MenuItem[]> = {};
  for (const category of categories) grouped[category.id] = [];
  for (const item of items) grouped[item.category]?.push(item);
  if (grouped.popular) grouped.popular = items.filter((item) => item.popular);
  return grouped;
}
