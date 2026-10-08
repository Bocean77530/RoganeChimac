import { describe, expect, it } from "vitest";
import { paymentConfirmationPollInterval, trackingPollInterval } from "./order-polling";

describe("order polling", () => {
  it("keeps a recoverable failed payment in sync with a later success", () => {
    const failed = { status: "pending_payment", paymentStatus: "failed" } as const;
    const paid = { status: "paid", paymentStatus: "paid" } as const;
    expect(trackingPollInterval(failed)).toBe(10_000);
    expect(paymentConfirmationPollInterval(failed)).toBe(10_000);
    expect(trackingPollInterval(paid)).toBe(5_000);
    expect(paymentConfirmationPollInterval(paid)).toBe(false);
  });

  it("stops for closed orders while polling an ordinary pending payment quickly", () => {
    for (const status of ["expired", "cancelled", "collected"] as const) {
      expect(trackingPollInterval({ status, paymentStatus: "pending" })).toBe(false);
      expect(paymentConfirmationPollInterval({ status, paymentStatus: "pending" })).toBe(false);
    }
    const pending = { status: "pending_payment", paymentStatus: "pending" } as const;
    expect(trackingPollInterval(pending)).toBe(5_000);
    expect(paymentConfirmationPollInterval(pending)).toBe(1_500);
  });
});
