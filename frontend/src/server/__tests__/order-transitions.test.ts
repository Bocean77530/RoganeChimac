import { describe, expect, it } from "vitest";
import type { OrderStatus } from "@/domain/order";
import { canTransitionOrderStatus, orderStatusLabel } from "../order-transitions.server";

describe("order status transitions", () => {
  it.each<[OrderStatus, OrderStatus]>([
    ["pending_payment", "paid"],
    ["pending_payment", "expired"],
    ["paid", "accepted"],
    ["accepted", "preparing"],
    ["preparing", "ready"],
    ["ready", "collected"],
    ["paid", "cancelled"],
  ])("allows %s -> %s", (from, to) => {
    expect(canTransitionOrderStatus(from, to)).toBe(true);
  });

  it.each<[OrderStatus, OrderStatus]>([
    ["pending_payment", "preparing"],
    ["paid", "ready"],
    ["ready", "preparing"],
    ["collected", "cancelled"],
    ["expired", "paid"],
    ["cancelled", "accepted"],
  ])("rejects %s -> %s", (from, to) => {
    expect(canTransitionOrderStatus(from, to)).toBe(false);
  });

  it("has a public label for every status", () => {
    const statuses: OrderStatus[] = [
      "pending_payment",
      "paid",
      "accepted",
      "preparing",
      "ready",
      "collected",
      "expired",
      "cancelled",
    ];
    expect(statuses.map(orderStatusLabel).every(Boolean)).toBe(true);
  });
});
