import { Flame, Leaf, WheatOff, Nut, Fish } from "lucide-react";
import type { DietTag } from "@/lib/menu-data";

export function DietBadges({ diet }: { diet?: DietTag[] }) {
  if (!diet?.length) return null;
  const map: Record<DietTag, { label: string; Icon: typeof Leaf; className: string }> = {
    vegetarian: { label: "Vegetarian", Icon: Leaf, className: "bg-green/15 text-green" },
    vegan: { label: "Vegan", Icon: Leaf, className: "bg-green/15 text-green" },
    "gluten-free": { label: "Gluten-free", Icon: WheatOff, className: "bg-yellow/20 text-yellow" },
    "contains-nuts": { label: "Contains nuts", Icon: Nut, className: "bg-yellow/20 text-yellow" },
    seafood: { label: "Seafood", Icon: Fish, className: "bg-primary/10 text-primary" },
  };
  return (
    <div className="flex flex-wrap gap-1">
      {diet.map((d) => {
        const { label, Icon, className } = map[d];
        return (
          <span key={d} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>
            <Icon className="h-3 w-3" aria-hidden /> {label}
          </span>
        );
      })}
    </div>
  );
}

export function SpiceMeter({ level }: { level?: number }) {
  if (!level) return null;
  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label={`Spice level ${level} out of 3`}
      title={`Spice level ${level}/3`}
    >
      {[1, 2, 3].map((i) => (
        <Flame key={i} className={`h-3.5 w-3.5 ${i <= level ? "text-primary fill-primary" : "text-border"}`} />
      ))}
    </span>
  );
}
