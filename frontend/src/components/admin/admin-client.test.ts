import { describe, expect, it } from "vitest";

import {
  AdminClientError,
  createMockAdminOrdersClient,
  getNextOrderStatus,
} from "./admin-client.ts";

describe("admin order workflow", () => {
  it("defines the one-way kitchen workflow", () => {
    expect(getNextOrderStatus("paid")).toBe("accepted");
    expect(getNextOrderStatus("accepted")).toBe("preparing");
    expect(getNextOrderStatus("preparing")).toBe("ready");
    expect(getNextOrderStatus("ready")).toBe("collected");
    expect(getNextOrderStatus("collected")).toBeNull();
    expect(getNextOrderStatus("pending_payment")).toBeNull();
  });

  it("atomically advances an order and creates its first print job", async () => {
    const client = createMockAdminOrdersClient();
    const order = await client.getOrder("order-st-1042");
    expect(order).not.toBeNull();

    const updated = await client.transitionOrder({
      orderId: "order-st-1042",
      expectedVersion: order?.version ?? 0,
      to: "accepted",
      idempotencyKey: "transition-order-st-1042-accepted",
    });

    expect(updated.status).toBe("accepted");
    expect(updated.version).toBe((order?.version ?? 0) + 1);
    expect(updated.integrations.kitchen_print.status).toBe("queued");
    expect(await client.listIntegrationJobs(updated.id)).toContainEqual(
      expect.objectContaining({ kind: "kitchen_print", status: "queued" }),
    );
  });

  it("rejects a stale order version", async () => {
    const client = createMockAdminOrdersClient();
    const expectedError = {
      code: "ORDER_VERSION_CONFLICT",
    } satisfies Partial<AdminClientError>;

    await expect(
      client.transitionOrder({
        orderId: "order-st-1042",
        expectedVersion: 99,
        to: "accepted",
        idempotencyKey: "stale-transition",
      }),
    ).rejects.toMatchObject(expectedError);
  });

  it("replays the same transition without incrementing the version twice", async () => {
    const client = createMockAdminOrdersClient();
    const input = {
      orderId: "order-st-1042",
      expectedVersion: 1,
      to: "accepted" as const,
      idempotencyKey: "repeatable-transition",
    };

    const first = await client.transitionOrder(input);
    const replay = await client.transitionOrder(input);

    expect(replay).toEqual(first);
    expect(replay.version).toBe(2);
  });
});
