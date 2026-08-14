import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MenuItem } from "./menu-data";
import { restaurant } from "./restaurant";

export type CartModifier = { groupId: string; groupName: string; optionId: string; name: string; priceDelta: number };

export type CartLine = {
  lineId: string;
  itemId: string;
  name: string;
  koreanName?: string;
  image: string;
  basePrice: number;
  quantity: number;
  notes?: string;
  modifiers: CartModifier[];
};

export type OrderMethod = "pickup" | "delivery";

type State = {
  lines: CartLine[];
  method: OrderMethod;
  scheduledFor: string | null; // ISO or null for ASAP
  deliveryAddress: string;
  promoCode: string | null;
  addLine: (line: Omit<CartLine, "lineId">) => void;
  updateQuantity: (lineId: string, qty: number) => void;
  removeLine: (lineId: string) => void;
  clear: () => void;
  setMethod: (m: OrderMethod) => void;
  setScheduledFor: (v: string | null) => void;
  setDeliveryAddress: (v: string) => void;
  setPromoCode: (v: string | null) => void;
};

export const lineTotal = (line: CartLine) =>
  (line.basePrice + line.modifiers.reduce((s, m) => s + m.priceDelta, 0)) * line.quantity;

export const useCart = create<State>()(
  persist(
    (set) => ({
      lines: [],
      method: "pickup",
      scheduledFor: null,
      deliveryAddress: "",
      promoCode: null,
      addLine: (line) =>
        set((s) => ({
          lines: [...s.lines, { ...line, lineId: crypto.randomUUID() }],
        })),
      updateQuantity: (lineId, qty) =>
        set((s) => ({
          lines: qty <= 0 ? s.lines.filter((l) => l.lineId !== lineId) : s.lines.map((l) => (l.lineId === lineId ? { ...l, quantity: qty } : l)),
        })),
      removeLine: (lineId) => set((s) => ({ lines: s.lines.filter((l) => l.lineId !== lineId) })),
      clear: () => set({ lines: [], promoCode: null }),
      setMethod: (method) => set({ method }),
      setScheduledFor: (v) => set({ scheduledFor: v }),
      setDeliveryAddress: (deliveryAddress) => set({ deliveryAddress }),
      setPromoCode: (v) => set({ promoCode: v }),
    }),
    { name: "seoultable-cart-v1" },
  ),
);

export type Totals = {
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  itemCount: number;
  belowMinimum: boolean;
};

export function computeTotals(state: Pick<State, "lines" | "method" | "promoCode">): Totals {
  const subtotal = state.lines.reduce((s, l) => s + lineTotal(l), 0);
  const itemCount = state.lines.reduce((s, l) => s + l.quantity, 0);
  const deliveryFee = state.method === "delivery" && subtotal > 0 ? restaurant.ordering.deliveryFee : 0;

  let discount = 0;
  if (state.promoCode?.toUpperCase() === "SEOUL10" && subtotal >= 2000) {
    discount = Math.round(subtotal * 0.1);
  }

  const belowMinimum = state.method === "delivery" && subtotal > 0 && subtotal < restaurant.ordering.deliveryMinimum;
  return { subtotal, deliveryFee, discount, total: Math.max(0, subtotal - discount) + deliveryFee, itemCount, belowMinimum };
}

// Helper to seed a new cart line from a menu item + selected mods
export function buildLineFromItem(
  item: MenuItem,
  selectedMods: Record<string, string[]>,
  quantity: number,
  notes?: string,
): Omit<CartLine, "lineId"> {
  const modifiers: CartModifier[] = [];
  for (const group of item.modifiers ?? []) {
    for (const optId of selectedMods[group.id] ?? []) {
      const opt = group.options.find((o) => o.id === optId);
      if (opt) modifiers.push({ groupId: group.id, groupName: group.name, optionId: opt.id, name: opt.name, priceDelta: opt.priceDelta ?? 0 });
    }
  }
  return { itemId: item.id, name: item.name, koreanName: item.koreanName, image: item.image, basePrice: item.price, quantity, notes, modifiers };
}
