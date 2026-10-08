const key = "rogane-pending-checkout-v1";

export type PendingCheckoutAttempt = {
  fingerprint: string;
  quoteId: string;
  expiresAt: string;
  attemptId: string;
};

export function readPendingCheckout(
  storage: Pick<Storage, "getItem" | "removeItem">,
  fingerprint: string,
  now = Date.now(),
): PendingCheckoutAttempt | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const saved: unknown = JSON.parse(raw);
    if (typeof saved !== "object" || saved === null) return null;
    const value = saved as Partial<PendingCheckoutAttempt>;
    if (
      value.fingerprint !== fingerprint ||
      typeof value.quoteId !== "string" ||
      typeof value.attemptId !== "string" ||
      typeof value.expiresAt !== "string" ||
      Date.parse(value.expiresAt) <= now + 5_000
    ) {
      storage.removeItem(key);
      return null;
    }
    return value as PendingCheckoutAttempt;
  } catch {
    return null;
  }
}

export function savePendingCheckout(
  storage: Pick<Storage, "setItem">,
  attempt: PendingCheckoutAttempt,
): void {
  try {
    storage.setItem(key, JSON.stringify(attempt));
  } catch {
    /* Checkout still works when storage is unavailable. */
  }
}

export function clearPendingCheckout(storage: Pick<Storage, "removeItem">): void {
  try {
    storage.removeItem(key);
  } catch {
    /* Storage may be unavailable. */
  }
}
