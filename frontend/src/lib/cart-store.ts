import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MenuItem } from "./menu-data";

export type CartModifier = {
  groupId: string;
  groupName: string;
  optionId: string;
  name: string;
  priceDelta: number;
};

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

type State = {
  lines: CartLine[];
  promoCode: string | null;
  fulfillment:
    | { type: "pickup" }
    | { type: "table_pending"; tableCode: string }
    | { type: "dine_in"; tableCode: string; tableId: string; tableLabel: string };
  beginTableScan: (tableCode: string) => void;
  setTable: (table: { tableCode: string; tableId: string; tableLabel: string }) => void;
  switchToPickup: () => void;
  addLine: (line: Omit<CartLine, "lineId">) => void;
  updateQuantity: (lineId: string, qty: number) => void;
  removeLine: (lineId: string) => void;
  clear: () => void;
  setPromoCode: (v: string | null) => void;
};

export const lineTotal = (line: CartLine) =>
  (line.basePrice + line.modifiers.reduce((s, m) => s + m.priceDelta, 0)) * line.quantity;

export const canCheckoutCart = (state: Pick<State, "lines" | "fulfillment">) =>
  state.lines.length > 0 && state.fulfillment.type !== "table_pending";

export const useCart = create<State>()(
  persist(
    (set) => ({
      lines: [],
      promoCode: null,
      fulfillment: { type: "pickup" },
      beginTableScan: (tableCode) =>
        set((s) => {
          if (s.fulfillment.type === "table_pending" && s.fulfillment.tableCode === tableCode)
            return s;
          const sameTable =
            s.fulfillment.type === "dine_in" && s.fulfillment.tableCode === tableCode;
          return sameTable
            ? { fulfillment: { type: "table_pending", tableCode } }
            : { fulfillment: { type: "table_pending", tableCode }, lines: [], promoCode: null };
        }),
      setTable: (table) =>
        set((s) =>
          (s.fulfillment.type === "dine_in" &&
            s.fulfillment.tableId === table.tableId &&
            s.fulfillment.tableCode === table.tableCode) ||
          (s.fulfillment.type === "table_pending" && s.fulfillment.tableCode === table.tableCode)
            ? { fulfillment: { type: "dine_in", ...table } }
            : { fulfillment: { type: "dine_in", ...table }, lines: [], promoCode: null },
        ),
      switchToPickup: () => set({ fulfillment: { type: "pickup" }, lines: [], promoCode: null }),
      addLine: (line) =>
        set((s) => ({
          lines: [...s.lines, { ...line, lineId: crypto.randomUUID() }],
        })),
      updateQuantity: (lineId, qty) =>
        set((s) => ({
          lines:
            qty <= 0
              ? s.lines.filter((l) => l.lineId !== lineId)
              : s.lines.map((l) => (l.lineId === lineId ? { ...l, quantity: qty } : l)),
        })),
      removeLine: (lineId) => set((s) => ({ lines: s.lines.filter((l) => l.lineId !== lineId) })),
      clear: () => set({ lines: [], promoCode: null }),
      setPromoCode: (v) => set({ promoCode: v }),
    }),
    {
      name: "rogane-chimac-cart-v1",
      version: 3,
      migrate: (persisted) => {
        const previous = persisted as Partial<State>;
        return {
          lines: Array.isArray(previous.lines) ? previous.lines : [],
          promoCode: typeof previous.promoCode === "string" ? previous.promoCode : null,
          fulfillment: { type: "pickup" },
        } as State;
      },
    },
  ),
);

export type Totals = {
  subtotal: number;
  discount: number;
  total: number;
  itemCount: number;
};

export function computeTotals(state: Pick<State, "lines" | "promoCode">): Totals {
  const subtotal = state.lines.reduce((s, l) => s + lineTotal(l), 0);
  const itemCount = state.lines.reduce((s, l) => s + l.quantity, 0);

  let discount = 0;
  if (state.promoCode?.toUpperCase() === "ROGANE10" && subtotal >= 2000) {
    discount = Math.round(subtotal * 0.1);
  }

  return {
    subtotal,
    discount,
    total: Math.max(0, subtotal - discount),
    itemCount,
  };
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
      if (opt)
        modifiers.push({
          groupId: group.id,
          groupName: group.name,
          optionId: opt.id,
          name: opt.name,
          priceDelta: opt.priceDelta ?? 0,
        });
    }
  }
  return {
    itemId: item.id,
    name: item.name,
    koreanName: item.koreanName,
    image: item.image,
    basePrice: item.price,
    quantity,
    notes,
    modifiers,
  };
}
