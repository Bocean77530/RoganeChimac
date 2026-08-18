import { Plus } from "lucide-react";
import type { MenuItem } from "@/lib/menu-data";
import { formatAUD } from "@/lib/restaurant";
import { DietBadges, SpiceMeter } from "./Badges";

export function MenuItemCard({
  item,
  onSelect,
}: {
  item: MenuItem;
  onSelect: (i: MenuItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      disabled={item.soldOut}
      className="group relative flex text-left w-full overflow-hidden rounded-2xl border border-border bg-card shadow-card hover:shadow-lift hover:-translate-y-0.5 transition disabled:opacity-60"
    >
      <div className="flex-1 p-4 md:p-5 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          {item.popular && (
            <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
              Popular
            </span>
          )}
          {item.chefsPick && (
            <span className="rounded-full bg-yellow/20 text-yellow px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
              Chef's pick
            </span>
          )}
          {item.soldOut && (
            <span className="rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
              Sold out
            </span>
          )}
        </div>
        <h3 className="mt-1.5 font-display text-lg font-bold leading-tight">{item.name}</h3>
        {item.koreanName && <p className="text-sm text-muted-foreground">{item.koreanName}</p>}
        <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
        <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold">{formatAUD(item.price)}</span>
            <SpiceMeter level={item.spice} />
          </div>
          <DietBadges diet={item.diet} />
        </div>
      </div>
      <div className="relative w-28 md:w-40 shrink-0">
        <img
          src={item.image}
          alt={`${item.name} at Rogane Chimac Korean restaurant in Dickson`}
          width={480}
          height={360}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <span className="absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-lift group-hover:scale-110 transition">
          <Plus className="h-5 w-5" />
        </span>
      </div>
    </button>
  );
}
