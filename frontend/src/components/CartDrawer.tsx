import { Link } from "@tanstack/react-router";
import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { computeTotals, lineTotal, useCart } from "@/lib/cart-store";
import { formatAUD, restaurant } from "@/lib/restaurant";
import { Button } from "@/components/ui/button";

export function CartDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { lines, updateQuantity, removeLine, method, promoCode } = useCart();
  const totals = computeTotals({ lines, method, promoCode });
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onOpenChange(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex justify-end" onClick={() => onOpenChange(false)}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cart"
        className="relative z-[1] flex h-dvh max-h-dvh w-full sm:max-w-md flex-col overflow-hidden bg-background shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 h-16">
          <h2 className="font-display text-xl font-bold">Your order</h2>
          <button aria-label="Close cart" onClick={() => onOpenChange(false)} className="grid h-10 w-10 place-items-center rounded-full hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>

        {lines.length === 0 ? (
          <div className="flex-1 grid place-items-center p-10 text-center">
            <div>
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-accent">
                <ShoppingBag className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="mt-4 font-display text-lg font-semibold">Your cart is empty</p>
              <p className="mt-1 text-sm text-muted-foreground">Add something delicious from our menu.</p>
              <Button asChild className="mt-6" onClick={() => onOpenChange(false)}>
                <Link to="/order">Browse menu</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {lines.map((l) => (
              <div key={l.lineId} className="flex gap-3 rounded-2xl border border-border bg-card p-3">
                <img src={l.image} alt="" className="h-16 w-16 rounded-xl object-cover shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{l.name}</p>
                      {l.modifiers.length > 0 && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {l.modifiers.map((m) => m.name).join(" · ")}
                        </p>
                      )}
                      {l.notes && <p className="mt-0.5 text-xs italic text-muted-foreground">"{l.notes}"</p>}
                    </div>
                    <button aria-label="Remove" onClick={() => removeLine(l.lineId)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-accent">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center rounded-full border border-border">
                      <button aria-label="Decrease" onClick={() => updateQuantity(l.lineId, l.quantity - 1)} className="grid h-8 w-8 place-items-center">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-6 text-center text-sm font-medium">{l.quantity}</span>
                      <button aria-label="Increase" onClick={() => updateQuantity(l.lineId, l.quantity + 1)} className="grid h-8 w-8 place-items-center">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="font-semibold">{formatAUD(lineTotal(l))}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {lines.length > 0 && (
          <div className="border-t border-border p-5 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">{formatAUD(totals.subtotal)}</span>
            </div>
            {totals.deliveryFee > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Delivery</span>
                <span className="font-medium">{formatAUD(totals.deliveryFee)}</span>
              </div>
            )}
            {totals.discount > 0 && (
              <div className="flex justify-between text-sm text-green">
                <span>Discount</span>
                <span>−{formatAUD(totals.discount)}</span>
              </div>
            )}
            <div className="flex justify-between font-display text-lg font-bold">
              <span>Total</span>
              <span>{formatAUD(totals.total)}</span>
            </div>
            {totals.belowMinimum && (
              <p className="text-xs text-primary">
                Delivery minimum is {formatAUD(restaurant.ordering.deliveryMinimum)}. Add {formatAUD(restaurant.ordering.deliveryMinimum - totals.subtotal)} more to check out.
              </p>
            )}
            <Button
              asChild
              disabled={totals.belowMinimum}
              className="w-full h-12 bg-primary hover:bg-primary-dark text-primary-foreground text-base font-semibold"
              onClick={() => onOpenChange(false)}
            >
              <Link to="/checkout">Checkout</Link>
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
