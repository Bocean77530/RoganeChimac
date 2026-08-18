import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { MenuItem } from "@/lib/menu-data";
import { publicCategories, publicMenuItems, usePublicMenu } from "@/lib/public-menu";
import { MenuItemCard } from "@/components/MenuItemCard";
import { ProductModal } from "@/components/ProductModal";
import { Button } from "@/components/ui/button";
import { getMenuCatalogFn } from "@/api/menu";
import { restaurant } from "@/lib/restaurant";
import { canonicalLink, pageSeoMeta } from "@/lib/seo";
import chickenImage from "@/assets/dish-kfc.jpg";

export const Route = createFileRoute("/menu")({
  loader: async () => {
    try {
      return await getMenuCatalogFn({ data: { restaurantSlug: restaurant.slug } });
    } catch {
      return null;
    }
  },
  head: () => ({
    meta: pageSeoMeta({
      title: "Korean Menu & Fried Chicken in Dickson | Rogane Chimac",
      description:
        "Browse Rogane Chimac's Korean menu in Dickson, Canberra: fried chicken, bibimbap, noodles, hot pots, soups, tteokbokki and pickup prices.",
      path: "/menu",
      imagePath: chickenImage,
    }),
    links: canonicalLink("/menu"),
  }),
  component: MenuPage,
});

function MenuPage() {
  const [active, setActive] = useState<MenuItem | null>(null);
  const initialCatalog = Route.useLoaderData();
  const menuQuery = usePublicMenu(initialCatalog ?? undefined);
  const categories = useMemo(
    () => (menuQuery.data ? publicCategories(menuQuery.data) : []),
    [menuQuery.data],
  );
  const menuItems = useMemo(
    () => (menuQuery.data ? publicMenuItems(menuQuery.data) : []),
    [menuQuery.data],
  );
  return (
    <>
      <section className="container-page py-14">
        <p className="text-xs uppercase tracking-widest text-primary font-bold">Our menu</p>
        <h1 className="mt-1 font-display text-4xl md:text-6xl font-extrabold">
          Korean Menu in Dickson
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Browse Korean fried chicken, bibimbap, noodles, hot pots, soups, tteokbokki and sides,
          with current pickup prices. When you are ready,{" "}
          <Link to="/order" className="text-primary font-semibold hover:underline">
            start an order
          </Link>{" "}
          when you're hungry.
        </p>
      </section>
      {menuQuery.isPending && (
        <div className="container-page py-12 text-center text-muted-foreground">
          Loading the current menu…
        </div>
      )}
      {menuQuery.isError && (
        <div className="container-page py-12 text-center">
          <p className="font-semibold text-destructive">The menu is temporarily unavailable.</p>
          <Button variant="outline" className="mt-4" onClick={() => menuQuery.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {categories
        .filter((c) => c.id !== "popular")
        .map((c) => {
          const items = menuItems.filter((m) => m.category === c.id);
          if (!items.length) return null;
          return (
            <section key={c.id} className="container-page py-8">
              <h2 className="font-display text-2xl md:text-3xl font-extrabold">
                {c.id === "fried-chicken" ? (
                  <Link to="/korean-fried-chicken-dickson" className="hover:text-primary">
                    Korean {c.name} in Dickson
                  </Link>
                ) : (
                  c.name
                )}
              </h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => (
                  <MenuItemCard key={item.id} item={item} onSelect={setActive} />
                ))}
              </div>
            </section>
          );
        })}
      <ProductModal item={active} onClose={() => setActive(null)} />
    </>
  );
}
