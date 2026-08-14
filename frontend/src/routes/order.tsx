import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ShoppingBag } from "lucide-react";
import { categories, menu, menuByCategory, type MenuItem } from "@/lib/menu-data";
import { computeTotals, useCart } from "@/lib/cart-store";
import { formatAUD, restaurant, isOpenNow } from "@/lib/restaurant";
import { MenuItemCard } from "@/components/MenuItemCard";
import { ProductModal } from "@/components/ProductModal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CartDrawer } from "@/components/CartDrawer";

export const Route = createFileRoute("/order")({
  head: () => ({
    meta: [
      { title: "Order Online | Seoul Table" },
      { name: "description", content: "Order Korean BBQ, fried chicken, bibimbap and more for pickup from Seoul Table." },
    ],
  }),
  component: OrderPage,
});

function OrderPage() {
  const [active, setActive] = useState<MenuItem | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<null | "vegetarian" | "vegan" | "gluten-free" | "spicy">(null);
  const [activeCat, setActiveCat] = useState<string>("popular");
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const { lines, promoCode } = useCart();
  const [cartOpen, setCartOpen] = useState(false);
  const totals = computeTotals({ lines, promoCode });

  const grouped = useMemo(() => menuByCategory(), []);
  const openNow = isOpenNow();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items: MenuItem[]) =>
      items.filter((i) => {
        if (q && !(i.name.toLowerCase().includes(q) || i.koreanName?.toLowerCase().includes(q) || i.description.toLowerCase().includes(q))) return false;
        if (filter === "vegetarian" && !i.diet?.includes("vegetarian") && !i.diet?.includes("vegan")) return false;
        if (filter === "vegan" && !i.diet?.includes("vegan")) return false;
        if (filter === "gluten-free" && !i.diet?.includes("gluten-free")) return false;
        if (filter === "spicy" && (i.spice ?? 0) < 2) return false;
        return true;
      });
  }, [query, filter]);

  // Track active category on scroll
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const id = (e.target as HTMLElement).dataset.cat;
            if (id) setActiveCat(id);
          }
        }
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    Object.values(sectionRefs.current).forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    const el = sectionRefs.current[id];
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 180;
    window.scrollTo({ top: y, behavior: "smooth" });
  };

  return (
    <>
      {/* Ordering header */}
      <div className="border-b border-border bg-card/40">
        <div className="container-page py-6">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-extrabold">{restaurant.name}</h1>
              <p className="text-sm text-muted-foreground">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${openNow ? "bg-green/15 text-green" : "bg-muted text-muted-foreground"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${openNow ? "bg-green" : "bg-muted-foreground"}`} /> {openNow ? "Open now" : "Currently closed"}
                </span>
                {" · "}Pickup ready in ~{restaurant.ordering.pickupPrepMinutes} min
              </p>
            </div>
            <div className="ml-auto rounded-full border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-semibold text-primary">
              Pickup only
            </div>
          </div>
        </div>
      </div>

      {/* Sticky category rail */}
      <div className="sticky top-16 md:top-20 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="container-page py-3 flex items-center gap-3">
          <div className="relative hidden md:block w-64 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search menu…" className="pl-9" aria-label="Search menu" />
          </div>
          <div className="flex-1 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-2 w-max">
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => scrollTo(c.id)}
                  className={`shrink-0 rounded-full border px-4 h-9 text-sm font-medium transition ${activeCat === c.id ? "bg-ink text-cream border-ink" : "bg-card border-border hover:bg-accent"}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="container-page pb-3 md:hidden">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search menu…" className="pl-9" aria-label="Search menu" />
          </div>
        </div>
        <div className="container-page pb-3 flex flex-wrap gap-2">
          {(["vegetarian", "vegan", "gluten-free", "spicy"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter((cur) => (cur === f ? null : f))}
              className={`rounded-full border px-3 h-7 text-xs font-medium capitalize transition ${filter === f ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-accent"}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="container-page pb-40 pt-6 grid gap-10 lg:grid-cols-[1fr_360px]">
        <div className="space-y-12">
          {categories.map((c) => {
            const items = filtered(grouped[c.id] ?? []);
            if (!items.length) return null;
            return (
              <section
                key={c.id}
                data-cat={c.id}
                ref={(el) => { sectionRefs.current[c.id] = el; }}
                aria-labelledby={`cat-${c.id}`}
              >
                <h2 id={`cat-${c.id}`} className="font-display text-2xl md:text-3xl font-extrabold">{c.name}</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {items.map((item) => <MenuItemCard key={item.id} item={item} onSelect={setActive} />)}
                </div>
              </section>
            );
          })}
          {filtered(menu).length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center">
              <p className="font-display text-lg font-semibold">No dishes match your search</p>
              <p className="text-sm text-muted-foreground">Try clearing filters or a different keyword.</p>
              <Button variant="outline" className="mt-4" onClick={() => { setQuery(""); setFilter(null); }}>Clear filters</Button>
            </div>
          )}
        </div>

        {/* Desktop sticky cart summary */}
        <aside className="hidden lg:block">
          <div className="sticky top-40 rounded-3xl border border-border bg-card p-5 shadow-card">
            <h3 className="font-display text-lg font-bold">Your order</h3>
            <p className="text-xs text-muted-foreground">Pickup</p>
            {lines.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">Your cart is empty. Add a dish to get started.</p>
            ) : (
              <>
                <ul className="mt-4 space-y-2 max-h-80 overflow-y-auto">
                  {lines.map((l) => (
                    <li key={l.lineId} className="flex justify-between gap-2 text-sm">
                      <span className="truncate"><span className="font-semibold">{l.quantity}×</span> {l.name}</span>
                      <span className="font-medium">{formatAUD((l.basePrice + l.modifiers.reduce((a,m)=>a+m.priceDelta,0)) * l.quantity)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatAUD(totals.subtotal)}</span></div>
                  {totals.discount > 0 && <div className="flex justify-between text-green"><span>Discount</span><span>−{formatAUD(totals.discount)}</span></div>}
                  <div className="flex justify-between font-display text-lg font-bold pt-1"><span>Total</span><span>{formatAUD(totals.total)}</span></div>
                </div>
                <Button asChild className="mt-4 w-full h-11 bg-primary hover:bg-primary-dark text-primary-foreground">
                  <Link to="/checkout">Checkout</Link>
                </Button>
              </>
            )}
          </div>
        </aside>
      </div>

      {/* Mobile sticky cart button */}
      {lines.length > 0 && (
        <div className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          <button
            onClick={() => setCartOpen(true)}
            className="flex w-full items-center justify-between gap-3 rounded-full bg-primary text-primary-foreground px-5 h-13 py-3 shadow-lift"
          >
            <span className="inline-flex items-center gap-2 font-semibold"><ShoppingBag className="h-5 w-5" /> View Cart · {totals.itemCount} items</span>
            <span className="font-bold">{formatAUD(totals.total)}</span>
          </button>
        </div>
      )}

      <ProductModal item={active} onClose={() => setActive(null)} />
      <CartDrawer open={cartOpen} onOpenChange={setCartOpen} />
    </>
  );
}
