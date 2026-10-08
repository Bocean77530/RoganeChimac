import { describe, expect, it } from "vitest";
import { clearPendingCheckout, readPendingCheckout, savePendingCheckout } from "./checkout-attempt";

describe("pending checkout recovery", () => {
  it("reuses the same quote and attempt after a lost response or refresh", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    };
    const attempt = {
      fingerprint: "cart+customer+table+payment",
      quoteId: "quote-1",
      attemptId: "attempt-1",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    savePendingCheckout(storage, attempt);
    expect(readPendingCheckout(storage, attempt.fingerprint)).toEqual(attempt);
    expect(readPendingCheckout(storage, "changed payment method")).toBeNull();
    expect(values.size).toBe(0);
    savePendingCheckout(storage, attempt);
    clearPendingCheckout(storage);
    expect(readPendingCheckout(storage, attempt.fingerprint)).toBeNull();
  });
});
