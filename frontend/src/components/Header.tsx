import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, ShoppingBag, X } from "lucide-react";
import { useState } from "react";
import { restaurant, isOpenNow } from "@/lib/restaurant";
import { useCart } from "@/lib/cart-store";
import { Button } from "@/components/ui/button";
import { CartDrawer } from "./CartDrawer";

const nav = [
  { to: "/", label: "Home" },
  { to: "/menu", label: "Menu" },
  { to: "/order", label: "Order Online" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
] as const;

export function Header() {
  const [open, setOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const itemCount = useCart((s) => s.lines.reduce((a, l) => a + l.quantity, 0));
  const openNow = isOpenNow();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="container-page flex h-16 items-center gap-3 md:h-20">
        <Link to="/" className="flex items-center gap-2 shrink-0" aria-label={restaurant.name}>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground font-display text-lg font-bold">S</span>
          <span className="font-display text-lg md:text-xl font-bold tracking-tight">
            {restaurant.name}
          </span>
        </Link>

        <nav className="hidden md:flex ml-8 items-center gap-6">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={`text-sm font-medium transition-colors hover:text-primary ${pathname === n.to ? "text-primary" : "text-foreground/80"}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium">
            <span className={`h-1.5 w-1.5 rounded-full ${openNow ? "bg-green" : "bg-muted-foreground"}`} aria-hidden />
            {openNow ? "Open now" : "Closed"}
          </span>

          <button
            onClick={() => setCartOpen(true)}
            aria-label={`Cart, ${itemCount} items`}
            className="relative grid h-11 w-11 place-items-center rounded-full border border-border bg-card hover:bg-accent transition"
          >
            <ShoppingBag className="h-5 w-5" />
            {itemCount > 0 && (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
                {itemCount}
              </span>
            )}
          </button>

          <Button asChild className="hidden md:inline-flex bg-primary hover:bg-primary-dark text-primary-foreground">
            <Link to="/order">Order Now</Link>
          </Button>

          <button
            className="md:hidden grid h-11 w-11 place-items-center rounded-full border border-border"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-background md:hidden animate-fade-up">
          <div className="container-page flex h-16 items-center justify-between">
            <span className="font-display text-lg font-bold">Menu</span>
            <button aria-label="Close menu" onClick={() => setOpen(false)} className="grid h-11 w-11 place-items-center rounded-full border border-border">
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="container-page mt-8 flex flex-col gap-2">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} onClick={() => setOpen(false)} className="rounded-2xl border border-border bg-card px-5 py-4 text-xl font-display font-semibold">
                {n.label}
              </Link>
            ))}
            <Button asChild size="lg" className="mt-4 h-14 bg-primary hover:bg-primary-dark text-primary-foreground text-base">
              <Link to="/order" onClick={() => setOpen(false)}>Order Now</Link>
            </Button>
          </nav>
        </div>
      )}

      <CartDrawer open={cartOpen} onOpenChange={setCartOpen} />
    </header>
  );
}
