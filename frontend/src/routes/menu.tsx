import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { categories, menu, type MenuItem } from "@/lib/menu-data";
import { MenuItemCard } from "@/components/MenuItemCard";
import { ProductModal } from "@/components/ProductModal";

export const Route = createFileRoute("/menu")({
  head: () => ({
    meta: [
      { title: "Menu | Seoul Table Korean Restaurant" },
      { name: "description", content: "Full menu of Korean BBQ, fried chicken, bibimbap, noodles, stews and desserts at Seoul Table." },
    ],
  }),
  component: MenuPage,
});

function MenuPage() {
  const [active, setActive] = useState<MenuItem | null>(null);
  return (
    <>
      <section className="container-page py-14">
        <p className="text-xs uppercase tracking-widest text-primary font-bold">Our menu</p>
        <h1 className="mt-1 font-display text-4xl md:text-6xl font-extrabold">Everything we cook</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">Have a look at the whole menu, then <Link to="/order" className="text-primary font-semibold hover:underline">start an order</Link> when you're hungry.</p>
      </section>
      {categories.filter((c) => c.id !== "popular").map((c) => {
        const items = menu.filter((m) => m.category === c.id);
        if (!items.length) return null;
        return (
          <section key={c.id} className="container-page py-8">
            <h2 className="font-display text-2xl md:text-3xl font-extrabold">{c.name}</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => <MenuItemCard key={item.id} item={item} onSelect={setActive} />)}
            </div>
          </section>
        );
      })}
      <ProductModal item={active} onClose={() => setActive(null)} />
    </>
  );
}
