import { useEffect, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import type { MenuItem } from "@/lib/menu-data";
import { formatAUD } from "@/lib/restaurant";
import { buildLineFromItem, useCart } from "@/lib/cart-store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DietBadges, SpiceMeter } from "./Badges";
import { toast } from "sonner";

export function ProductModal({ item, onClose }: { item: MenuItem | null; onClose: () => void }) {
  const addLine = useCart((s) => s.addLine);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<Record<string, string[]>>({});

  // Reset when item changes
  useEffect(() => {
    setQty(1);
    setNotes("");
    setSelected({});
  }, [item?.id]);

  if (!item) return null;

  const toggle = (groupId: string, optionId: string, max: number) => {
    setSelected((prev) => {
      const cur = prev[groupId] ?? [];
      if (max === 1) return { ...prev, [groupId]: [optionId] };
      if (cur.includes(optionId)) {
        return { ...prev, [groupId]: cur.filter((value) => value !== optionId) };
      }
      if (cur.length >= max) return prev;
      return { ...prev, [groupId]: [...cur, optionId] };
    });
  };

  const modsTotal = (item.modifiers ?? []).reduce((sum, g) => {
    for (const id of selected[g.id] ?? []) {
      const o = g.options.find((o) => o.id === id);
      sum += o?.priceDelta ?? 0;
    }
    return sum;
  }, 0);
  const itemTotal = (item.price + modsTotal) * qty;

  const invalidGroups = (item.modifiers ?? []).filter((group) => {
    const count = selected[group.id]?.length ?? 0;
    const min = group.min ?? (group.required ? 1 : 0);
    const max = group.max ?? (group.required ? 1 : group.options.length);
    return count < min || count > max;
  });

  const submit = () => {
    if (invalidGroups.length) {
      toast.error(`Please check: ${invalidGroups.map((group) => group.name).join(", ")}`);
      return;
    }
    addLine(buildLineFromItem(item, selected, qty, notes || undefined));
    toast.success(`${item.name} added to cart`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 p-0 md:p-6 animate-fade-up" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
        className="w-full md:max-w-2xl max-h-[92dvh] overflow-hidden rounded-t-3xl md:rounded-3xl bg-card shadow-lift flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <img src={item.image} alt={item.name} className="h-56 md:h-72 w-full object-cover" />
          <button aria-label="Close" onClick={onClose} className="absolute top-3 right-3 grid h-10 w-10 place-items-center rounded-full bg-background/90 hover:bg-background">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 md:p-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h2 className="font-display text-2xl font-bold">{item.name}</h2>
              {item.koreanName && <p className="text-muted-foreground">{item.koreanName}</p>}
            </div>
            <span className="font-bold text-lg">{formatAUD(item.price)}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <SpiceMeter level={item.spice} />
            <DietBadges diet={item.diet} />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{item.description}</p>

          {item.modifiers?.map((group) => {
            const min = group.min ?? (group.required ? 1 : 0);
            const max = group.max ?? (group.required ? 1 : group.options.length);
            const single = max === 1;
            return (
              <fieldset key={group.id} className="mt-6">
                <legend className="font-display font-bold flex items-center gap-2">
                  {group.name}
                  {min > 0 && <span className="text-xs font-medium text-primary uppercase tracking-wide">Required</span>}
                  {max > 1 && <span className="text-xs font-normal text-muted-foreground">Choose up to {max}</span>}
                </legend>
                <div className="mt-2 grid gap-2">
                  {group.options.map((opt) => {
                    const chosen = (selected[group.id] ?? []).includes(opt.id);
                    return (
                      <label
                        key={opt.id}
                        className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3 transition ${chosen ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary/40"}`}
                      >
                        <span className="flex items-center gap-3">
                          <input
                            type={single ? "radio" : "checkbox"}
                            name={group.id}
                            className="h-4 w-4 accent-primary"
                            checked={chosen}
                            onChange={() => toggle(group.id, opt.id, max)}
                          />
                          <span className="text-sm font-medium">{opt.name}</span>
                        </span>
                        {opt.priceDelta ? <span className="text-sm font-medium">+{formatAUD(opt.priceDelta)}</span> : null}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}

          <div className="mt-6">
            <label className="font-display font-bold" htmlFor="notes">Special instructions</label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. no coriander, extra sauce on the side" maxLength={300} className="mt-2" />
          </div>

          <p className="mt-6 text-xs text-muted-foreground">
            Please inform our team of any allergies before ordering. Our kitchen handles common allergens and cannot guarantee any item is allergen-free.
          </p>
        </div>

        <div className="border-t border-border bg-card px-5 py-4 flex items-center gap-3">
          <div className="flex items-center rounded-full border border-border">
            <button aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid h-11 w-11 place-items-center rounded-full hover:bg-accent">
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-8 text-center font-semibold">{qty}</span>
            <button aria-label="Increase quantity" onClick={() => setQty((q) => Math.min(20, q + 1))} className="grid h-11 w-11 place-items-center rounded-full hover:bg-accent">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <Button onClick={submit} className="flex-1 h-12 bg-primary hover:bg-primary-dark text-primary-foreground font-semibold">
            Add to cart · {formatAUD(itemTotal)}
          </Button>
        </div>
      </div>
    </div>
  );
}
