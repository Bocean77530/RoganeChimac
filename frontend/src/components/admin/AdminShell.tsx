import { Link, useRouterState } from "@tanstack/react-router";
import { ClipboardList, ListPlus, PlugZap, UtensilsCrossed } from "lucide-react";
import type { ReactNode } from "react";

const links = [
  { href: "/admin", label: "Order board", icon: ClipboardList },
  { href: "/admin/menu", label: "Menu", icon: ListPlus },
  { href: "/admin/integrations", label: "Integrations", icon: PlugZap },
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="min-h-dvh bg-muted/35">
      <header className="border-b border-border bg-ink text-cream">
        <div className="container-page flex min-h-16 flex-wrap items-center gap-4 py-3">
          <Link to="/admin" className="flex items-center gap-2 font-display text-lg font-bold">
            <UtensilsCrossed className="h-5 w-5" />
            Rogane Chimac Operations
          </Link>
          <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground">
            Demo
          </span>
          <nav className="ml-auto flex items-center gap-1" aria-label="Operations navigation">
            {links.map(({ href, label, icon: Icon }) => {
              const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  to={href}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold transition ${active ? "bg-cream text-ink" : "text-cream/75 hover:bg-white/10 hover:text-cream"}`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="container-page py-6">{children}</main>
    </div>
  );
}
