import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, MapPin, ShoppingBag } from "lucide-react";
import { useMemo, useState } from "react";

import { getMenuCatalogFn } from "@/api/menu";
import { MenuItemCard } from "@/components/MenuItemCard";
import { ProductModal } from "@/components/ProductModal";
import { Button } from "@/components/ui/button";
import type { MenuItem } from "@/lib/menu-data";
import { publicMenuItems, usePublicMenu } from "@/lib/public-menu";
import { formatRestaurantHours, restaurant } from "@/lib/restaurant";
import { canonicalLink, pageSeoMeta } from "@/lib/seo";
import chickenImage from "@/assets/dish-kfc.jpg";

export const Route = createFileRoute("/korean-fried-chicken-dickson")({
  loader: async () => {
    try {
      return await getMenuCatalogFn({ data: { restaurantSlug: restaurant.slug } });
    } catch {
      return null;
    }
  },
  head: () => ({
    meta: pageSeoMeta({
      title: "Korean Fried Chicken in Dickson, Canberra | Rogane Chimac",
      description:
        "Try Korean fried chicken at Rogane Chimac in Dickson, Canberra. Browse crispy wings, boneless chicken, flavours, sauces, current prices and online pickup.",
      path: "/korean-fried-chicken-dickson",
      imagePath: chickenImage,
      imageAlt: "Korean fried chicken at Rogane Chimac in Dickson, Canberra",
    }),
    links: [
      ...canonicalLink("/korean-fried-chicken-dickson"),
      { rel: "preload", as: "image", href: chickenImage, fetchPriority: "high" },
    ],
  }),
  component: KoreanFriedChickenPage,
});

function KoreanFriedChickenPage() {
  const [active, setActive] = useState<MenuItem | null>(null);
  const initialCatalog = Route.useLoaderData();
  const menuQuery = usePublicMenu(initialCatalog ?? undefined);
  const friedChicken = useMemo(
    () =>
      menuQuery.data
        ? publicMenuItems(menuQuery.data).filter((item) => item.category === "fried-chicken")
        : [],
    [menuQuery.data],
  );

  return (
    <>
      <section className="container-page grid items-center gap-10 py-14 md:grid-cols-2 md:py-20">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            Rogane Chimac · Dickson
          </p>
          <h1 className="mt-2 font-display text-4xl font-extrabold leading-tight md:text-6xl">
            Korean Fried Chicken in Dickson
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Choose crispy bone-in chicken wings or boneless Korean fried chicken, then select your
            portion, flavour and extra sauce. Order online for pickup from our Korean restaurant in
            Dickson Plaza, Canberra.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button
              asChild
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary-dark"
            >
              <Link to="/order">
                <ShoppingBag className="mr-2 h-4 w-4" /> Order Pickup
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/menu">View Full Korean Menu</Link>
            </Button>
          </div>
        </div>
        <img
          src={chickenImage}
          alt="Korean fried chicken at Rogane Chimac in Dickson, Canberra"
          width={1200}
          height={900}
          fetchPriority="high"
          className="aspect-[4/3] w-full rounded-3xl object-cover shadow-lift"
        />
      </section>

      <section className="border-y border-border bg-card/40">
        <div className="container-page grid gap-6 py-8 sm:grid-cols-2">
          <div className="flex gap-3">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <h2 className="font-display text-lg font-bold">Pickup in Dickson</h2>
              <p className="text-sm text-muted-foreground">
                {restaurant.address.line1}, {restaurant.address.suburb}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <h2 className="font-display text-lg font-bold">Lunch and dinner</h2>
              <p className="text-sm text-muted-foreground">
                Monday–Saturday · {formatRestaurantHours(restaurant.hours[0].periods)}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="container-page py-14 md:py-20" aria-labelledby="fried-chicken-menu">
        <p className="text-xs font-bold uppercase tracking-widest text-primary">Current menu</p>
        <h2
          id="fried-chicken-menu"
          className="mt-1 font-display text-3xl font-extrabold md:text-4xl"
        >
          Wings and Boneless Fried Chicken
        </h2>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Open a dish to see the current portion sizes, available flavours and sauce choices. Prices
          below are loaded from the same live menu used by online ordering.
        </p>

        {menuQuery.isPending && (
          <p className="mt-8 rounded-2xl border border-border p-8 text-muted-foreground">
            Loading the current fried chicken menu…
          </p>
        )}
        {menuQuery.isError && (
          <p className="mt-8 rounded-2xl border border-destructive/30 bg-destructive/10 p-8 text-destructive">
            The current menu is temporarily unavailable. Please call {restaurant.phone}.
          </p>
        )}
        {friedChicken.length > 0 && (
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {friedChicken.map((item) => (
              <MenuItemCard key={item.id} item={item} onSelect={setActive} />
            ))}
          </div>
        )}
      </section>

      <section className="bg-ink text-cream">
        <div className="container-page grid gap-10 py-14 md:grid-cols-2 md:py-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">Good to know</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold">
              Korean chicken made for your order
            </h2>
            <p className="mt-4 leading-relaxed text-cream/80">
              Rogane Chimac serves fried chicken alongside bibimbap, noodles, soups, hot pots,
              tteokbokki and Korean side dishes. Pickup orders can be placed and paid securely
              online before collection.
            </p>
          </div>
          <div className="space-y-5">
            <div>
              <h3 className="font-display text-lg font-bold">Where is Rogane Chimac?</h3>
              <p className="mt-1 text-sm text-cream/75">
                We are at {restaurant.address.line1}, {restaurant.address.suburb}.
              </p>
            </div>
            <div>
              <h3 className="font-display text-lg font-bold">Can I order Korean chicken online?</h3>
              <p className="mt-1 text-sm text-cream/75">
                Yes. Choose a pickup time, customise your chicken and complete secure card payment
                through our online ordering page.
              </p>
            </div>
            <div>
              <h3 className="font-display text-lg font-bold">Do you offer different flavours?</h3>
              <p className="mt-1 text-sm text-cream/75">
                Available flavours and sauces are shown when you open a fried chicken item. The live
                menu is the source of truth if an option changes or sells out.
              </p>
            </div>
          </div>
        </div>
      </section>

      <ProductModal item={active} onClose={() => setActive(null)} />
    </>
  );
}
