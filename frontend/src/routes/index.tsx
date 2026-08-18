import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Clock, CreditCard, Flame, Leaf, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { restaurant, formatRestaurantHours } from "@/lib/restaurant";
import { publicMenuItems, usePublicMenu } from "@/lib/public-menu";
import { getMenuCatalogFn } from "@/api/menu";
import { canonicalLink, pageSeoMeta } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { MenuItemCard } from "@/components/MenuItemCard";
import { ProductModal } from "@/components/ProductModal";
import hero from "@/assets/hero-korean.jpg";
import type { MenuItem } from "@/lib/menu-data";

export const Route = createFileRoute("/")({
  loader: async () => {
    try {
      return await getMenuCatalogFn({ data: { restaurantSlug: restaurant.slug } });
    } catch {
      return null;
    }
  },
  head: () => ({
    meta: pageSeoMeta({
      title: "Korean Restaurant & Fried Chicken in Dickson | Rogane Chimac",
      description:
        "Visit Rogane Chimac in Dickson, Canberra for Korean fried chicken, bibimbap, noodles, hot pots and Korean comfort food. View the menu or order pickup online.",
      path: "/",
      imagePath: hero,
    }),
    links: [
      ...canonicalLink("/"),
      { rel: "preload", as: "image", href: hero, fetchPriority: "high" },
    ],
  }),
  component: Home,
});

function Home() {
  const [active, setActive] = useState<MenuItem | null>(null);
  const initialCatalog = Route.useLoaderData();
  const menuQuery = usePublicMenu(initialCatalog ?? undefined);
  const popular = useMemo(
    () =>
      menuQuery.data
        ? publicMenuItems(menuQuery.data)
            .filter((item) => item.popular)
            .slice(0, 6)
        : [],
    [menuQuery.data],
  );

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="container-page grid gap-10 py-14 md:py-24 md:grid-cols-2 items-center">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Korean restaurant · Dickson
            </span>
            <h1 className="mt-4 font-display text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[0.95]">
              Korean Food &amp; <br />
              <span className="text-primary">Fried Chicken</span> <br />
              in Dickson
            </h1>
            <p className="mt-5 max-w-lg text-base md:text-lg text-muted-foreground">
              {restaurant.description}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                asChild
                size="lg"
                className="h-12 bg-primary hover:bg-primary-dark text-primary-foreground px-6 text-base"
              >
                <Link to="/order">
                  Order Online <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-6 text-base border-2">
                <Link to="/menu">View Menu</Link>
              </Button>
            </div>
            <div className="mt-6 flex items-center gap-4 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4" /> Pickup in ~{restaurant.ordering.pickupPrepMinutes} min
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CreditCard className="h-4 w-4" /> Secure online card payment
              </span>
            </div>
          </div>
          <div className="relative animate-fade-up">
            <div className="absolute -inset-4 rounded-[2rem] bg-primary/15 blur-2xl" aria-hidden />
            <img
              src={hero}
              alt="Korean food served at Rogane Chimac in Dickson, Canberra"
              width={1600}
              height={1200}
              fetchPriority="high"
              className="relative aspect-[4/5] md:aspect-square w-full rounded-[2rem] object-cover shadow-lift"
            />
            <div className="absolute -bottom-4 -left-4 hidden md:block rounded-2xl bg-card p-4 shadow-lift border border-border">
              <div className="flex items-center gap-2">
                <Flame className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Signature dish</p>
                  <p className="font-semibold text-sm">Korean Fried Chicken</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Value props */}
      <section className="border-y border-border bg-card/40">
        <div className="container-page grid gap-6 py-10 sm:grid-cols-2 md:grid-cols-4">
          {[
            {
              Icon: Sparkles,
              title: "Korean favourites",
              body: "Fried chicken, bibimbap, noodles, hot pots and more.",
            },
            { Icon: Flame, title: "Freshly cooked", body: "Made to order in our open kitchen." },
            {
              Icon: Clock,
              title: "Fast pickup",
              body: `Ready in about ${restaurant.ordering.pickupPrepMinutes} minutes.`,
            },
            {
              Icon: Leaf,
              title: "Vegetarian options",
              body: "Plenty of meat-free favourites too.",
            },
          ].map((v) => (
            <div key={v.title} className="flex gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <v.Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="font-display font-bold">{v.title}</p>
                <p className="text-sm text-muted-foreground">{v.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Popular */}
      <section className="container-page py-16 md:py-20">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-widest text-primary font-bold">Most loved</p>
            <h2 className="mt-1 font-display text-3xl md:text-4xl font-extrabold">
              Popular Dishes
            </h2>
          </div>
          <Link to="/order" className="text-sm font-medium text-primary hover:underline">
            See full menu →
          </Link>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {popular.map((m) => (
            <MenuItemCard key={m.id} item={m} onSelect={setActive} />
          ))}
        </div>
        {menuQuery.isError && (
          <p className="mt-6 text-sm text-muted-foreground">
            Popular dishes are temporarily unavailable.
          </p>
        )}
        <p className="mt-8 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Looking for crispy Korean chicken in Canberra? Explore Rogane Chimac&apos;s bone-in wings,
          boneless fried chicken, sauces, flavours and portion options on our{" "}
          <Link
            to="/korean-fried-chicken-dickson"
            className="font-semibold text-primary hover:underline"
          >
            Korean fried chicken in Dickson page
          </Link>
          .
        </p>
      </section>

      {/* Story */}
      <section className="bg-primary text-primary-foreground">
        <div className="container-page py-16 md:py-24 grid gap-8 md:grid-cols-2 items-center">
          <div>
            <p className="text-xs uppercase tracking-widest opacity-80 font-bold">Our story</p>
            <h2 className="mt-1 font-display text-3xl md:text-5xl font-extrabold leading-tight">
              A Korean table, shared.
            </h2>
            <p className="mt-4 opacity-90 max-w-lg">
              Rogane Chimac serves Korean favourites from Dickson Plaza, with lunch and dinner
              service six days a week. Browse the current menu online and choose a convenient pickup
              time.
            </p>
            <div className="mt-6">
              <Button asChild size="lg" variant="secondary" className="h-12 px-6">
                <Link to="/about">Read more about us</Link>
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {popular.slice(0, 4).map((m) => (
              <img
                key={m.id}
                src={m.image}
                alt={m.name}
                loading="lazy"
                className="aspect-square w-full rounded-2xl object-cover"
              />
            ))}
          </div>
        </div>
      </section>

      {/* Location */}
      <section className="border-t border-border bg-card/40">
        <div className="container-page py-16 md:py-20 grid gap-10 md:grid-cols-2 items-center">
          <div>
            <p className="text-xs uppercase tracking-widest text-primary font-bold">Visit us</p>
            <h2 className="mt-1 font-display text-3xl md:text-4xl font-extrabold">
              {restaurant.address.line1}
            </h2>
            <p className="text-muted-foreground">{restaurant.address.suburb}</p>
            <div className="mt-4 space-y-1 text-sm">
              <p>
                <strong>Phone:</strong> {restaurant.phone}
              </p>
              {restaurant.email && (
                <p>
                  <strong>Email:</strong> {restaurant.email}
                </p>
              )}
            </div>
            <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm max-w-md">
              {restaurant.hours.map((h) => (
                <li key={h.day} className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{h.day}</span>
                  <span className="text-right">{formatRestaurantHours(h.periods)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex gap-3">
              <Button asChild className="bg-primary hover:bg-primary-dark text-primary-foreground">
                <Link to="/order">Order Pickup</Link>
              </Button>
              <Button asChild variant="outline">
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={`https://maps.google.com/?q=${encodeURIComponent(restaurant.address.line1 + " " + restaurant.address.suburb)}`}
                >
                  Get Directions
                </a>
              </Button>
            </div>
          </div>
          <div className="aspect-[4/3] w-full rounded-3xl border border-border bg-muted grid place-items-center text-muted-foreground overflow-hidden">
            <iframe
              title="Map"
              className="h-full w-full"
              loading="lazy"
              src={`https://www.google.com/maps?q=${encodeURIComponent(restaurant.address.line1 + " " + restaurant.address.suburb)}&output=embed`}
            />
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="container-page py-16">
        <div className="rounded-3xl bg-ink text-cream p-8 md:p-14 text-center">
          <h2 className="font-display text-3xl md:text-5xl font-extrabold">Hungry yet?</h2>
          <p className="mt-3 opacity-80">
            Choose a pickup time, pay securely online and follow the kitchen status from your phone.
          </p>
          <Button
            asChild
            size="lg"
            className="mt-6 h-12 px-6 bg-primary hover:bg-primary-dark text-primary-foreground"
          >
            <Link to="/order">Start your order</Link>
          </Button>
        </div>
      </section>

      <ProductModal item={active} onClose={() => setActive(null)} />
    </>
  );
}
