import { and, eq, sql } from "drizzle-orm";
import type { ServiceResult } from "@/domain/common";
import type { OrderStatus } from "@/domain/order";
import type { DatabaseExecutor } from "@/db/client.server";
import { orderStatusEvents, orders, pickupSlots } from "@/db/schema";
import {
  abortWith,
  failure,
  internalError,
  ServiceFailure,
  serviceError,
  success,
} from "./service-errors.server";
import { withDatabase } from "@/db/client.server";

const transitions: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_payment: ["paid", "expired", "cancelled"],
  paid: ["accepted", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["collected", "cancelled"],
  collected: [],
  expired: [],
  cancelled: [],
};

const statusLabels: Record<OrderStatus, string> = {
  pending_payment: "Payment pending",
  paid: "Payment received",
  accepted: "Order accepted",
  preparing: "Preparing",
  ready: "Ready for pickup",
  collected: "Collected",
  expired: "Payment expired",
  cancelled: "Cancelled",
};

export function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus): boolean {
  return transitions[from].includes(to);
}

export function orderStatusLabel(status: OrderStatus): string {
  return statusLabels[status];
}

export type TransitionActor = "system" | "admin" | "payment" | "integration";

export async function applyOrderTransition(
  db: DatabaseExecutor,
  input: {
    orderId: string;
    expectedVersion: number;
    toStatus: OrderStatus;
    actorType: TransitionActor;
    actorReference?: string;
    reason?: string;
    now?: Date;
  },
) {
  const current = (await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1))[0];
  if (!current) {
    abortWith(serviceError("ORDER_NOT_FOUND", "Order not found."));
  }
  if (current.version !== input.expectedVersion) {
    abortWith(serviceError("ORDER_VERSION_CONFLICT", "The order was updated elsewhere.", true));
  }
  if (!canTransitionOrderStatus(current.status, input.toStatus)) {
    abortWith(
      serviceError(
        "INVALID_STATUS_TRANSITION",
        `Cannot move an order from ${current.status} to ${input.toStatus}.`,
      ),
    );
  }

  const now = input.now ?? new Date();
  const [updated] = await db
    .update(orders)
    .set({
      status: input.toStatus,
      version: sql`${orders.version} + 1`,
      updatedAt: now,
      placedAt: input.toStatus === "paid" ? now : current.placedAt,
      readyBy: input.toStatus === "ready" ? now : current.readyBy,
    })
    .where(and(eq(orders.id, current.id), eq(orders.version, input.expectedVersion)))
    .returning();

  if (!updated) {
    abortWith(serviceError("ORDER_VERSION_CONFLICT", "The order was updated elsewhere.", true));
  }

  if (input.toStatus === "cancelled" || input.toStatus === "expired") {
    await db
      .update(pickupSlots)
      .set({
        reservedCount: sql`greatest(0, ${pickupSlots.reservedCount} - 1)`,
        updatedAt: now,
      })
      .where(eq(pickupSlots.id, current.pickupSlotId));
  }

  await db.insert(orderStatusEvents).values({
    id: crypto.randomUUID(),
    orderId: current.id,
    fromStatus: current.status,
    toStatus: input.toStatus,
    actorType: input.actorType,
    actorReference: input.actorReference,
    reason: input.reason,
    createdAt: now,
  });

  return updated;
}

export async function transitionOrderStatus(input: {
  orderId: string;
  expectedVersion: number;
  toStatus: OrderStatus;
  actorType?: TransitionActor;
  actorReference?: string;
  reason?: string;
}): Promise<ServiceResult<{ id: string; status: OrderStatus; version: number }>> {
  if (!input.orderId || !Number.isInteger(input.expectedVersion)) {
    return failure(serviceError("VALIDATION_ERROR", "Invalid status update."));
  }

  try {
    return await withDatabase(async (db) =>
      db.transaction(async (tx) => {
        const updated = await applyOrderTransition(tx, {
          ...input,
          actorType: input.actorType ?? "admin",
        });
        return success({ id: updated.id, status: updated.status, version: updated.version });
      }),
    );
  } catch (error) {
    if (error instanceof ServiceFailure) return failure(error.serviceError);
    console.error("Failed to transition order", error);
    return failure(internalError());
  }
}
