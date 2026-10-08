import "@tanstack/react-start/server-only";

import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { AdminOrderDetail, OrderStatus } from "@/domain/order";
import type { ServiceResult } from "@/domain/common";
import { withDatabase } from "@/db/client.server";
import { counterPaymentRecords, orders } from "@/db/schema";
import { requireAdminAccess } from "./admin-auth.server";
import { transitionOrderStatus } from "./order-transitions.server";
import { loadAdminOrderDetail } from "./repositories/order-repository.server";
import {
  abortWith,
  failure,
  internalError,
  ServiceFailure,
  serviceError,
  success,
} from "./service-errors.server";

export async function listMerchantOrders(
  token: string,
): Promise<ServiceResult<AdminOrderDetail[]>> {
  requireAdminAccess(token);
  try {
    return await withDatabase(async (db) => {
      const recent = await db
        .select({ id: orders.id })
        .from(orders)
        .where(
          or(
            inArray(orders.status, [
              "submitted",
              "paid",
              "accepted",
              "preparing",
              "ready",
              "collected",
              "cancelled",
            ]),
            and(eq(orders.fulfillmentMethod, "dine_in"), eq(orders.status, "pending_payment")),
          ),
        )
        .orderBy(desc(orders.placedAt))
        .limit(50);
      const details = await Promise.all(recent.map((row) => loadAdminOrderDetail(db, row.id)));
      return success(details.filter((detail): detail is AdminOrderDetail => Boolean(detail)));
    });
  } catch (error) {
    console.error("Failed to list merchant orders", error);
    return failure(internalError());
  }
}

export async function updateMerchantOrder(input: {
  adminToken: string;
  orderId: string;
  expectedVersion: number;
  toStatus: OrderStatus;
}): Promise<ServiceResult<AdminOrderDetail>> {
  requireAdminAccess(input.adminToken);
  if (!["accepted", "preparing", "ready", "collected", "cancelled"].includes(input.toStatus)) {
    return failure(serviceError("INVALID_STATUS_TRANSITION", "This status cannot be set here."));
  }
  if (input.toStatus === "cancelled") {
    const eligible = await withDatabase(async (db) => {
      const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
      return (
        order?.fulfillmentMethod === "dine_in" &&
        order.paymentMethod === "pay_at_counter" &&
        order.paymentStatus === "unpaid" &&
        order.version === input.expectedVersion
      );
    });
    if (!eligible)
      return failure(
        serviceError(
          "INVALID_STATUS_TRANSITION",
          "Only unpaid pay-at-counter table orders can be cancelled here.",
        ),
      );
  }
  const changed = await transitionOrderStatus({
    orderId: input.orderId,
    expectedVersion: input.expectedVersion,
    toStatus: input.toStatus,
    actorType: "admin",
  });
  if (!changed.ok) return changed;
  try {
    return await withDatabase(async (db) => {
      const detail = await loadAdminOrderDetail(db, input.orderId);
      return detail
        ? success(detail)
        : failure(serviceError("ORDER_NOT_FOUND", "Order not found."));
    });
  } catch (error) {
    console.error("Failed to reload merchant order", error);
    return failure(internalError());
  }
}

export async function recordCounterPayment(input: {
  adminToken: string;
  orderId: string;
  idempotencyKey: string;
  method: "cash" | "card" | "other";
  operatorName: string;
}): Promise<ServiceResult<AdminOrderDetail>> {
  requireAdminAccess(input.adminToken);
  const operatorName = input.operatorName.trim();
  if (
    !input.orderId ||
    input.idempotencyKey.length < 8 ||
    input.idempotencyKey.length > 128 ||
    !operatorName ||
    operatorName.length > 100 ||
    !["cash", "card", "other"].includes(input.method)
  ) {
    return failure(serviceError("VALIDATION_ERROR", "Invalid counter payment details."));
  }
  try {
    return await withDatabase((db) =>
      db.transaction(async (tx) => {
        const [order] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, input.orderId))
          .for("update")
          .limit(1);
        if (!order) abortWith(serviceError("ORDER_NOT_FOUND", "Order not found."));
        if (
          order.fulfillmentMethod !== "dine_in" ||
          order.paymentMethod !== "pay_at_counter" ||
          order.status === "cancelled"
        ) {
          abortWith(
            serviceError("PAYMENT_METHOD_UNAVAILABLE", "This order cannot be paid at the counter."),
          );
        }
        const [existing] = await tx
          .select()
          .from(counterPaymentRecords)
          .where(eq(counterPaymentRecords.orderId, order.id))
          .limit(1);
        if (existing) {
          if (
            existing.idempotencyKey !== input.idempotencyKey ||
            existing.method !== input.method ||
            existing.operatorName !== operatorName
          ) {
            abortWith(
              serviceError(
                "PAYMENT_ALREADY_RECORDED",
                "A counter payment was already recorded for this order.",
              ),
            );
          }
          return success((await loadAdminOrderDetail(tx, order.id))!);
        }
        if (order.paymentStatus !== "unpaid")
          abortWith(serviceError("PAYMENT_ALREADY_RECORDED", "Payment is already recorded."));
        const [keyOwner] = await tx
          .select({ orderId: counterPaymentRecords.orderId })
          .from(counterPaymentRecords)
          .where(eq(counterPaymentRecords.idempotencyKey, input.idempotencyKey))
          .limit(1);
        if (keyOwner)
          abortWith(
            serviceError(
              "IDEMPOTENCY_KEY_REUSED",
              "This payment attempt belongs to another order.",
            ),
          );
        const now = new Date();
        await tx.insert(counterPaymentRecords).values({
          id: crypto.randomUUID(),
          orderId: order.id,
          idempotencyKey: input.idempotencyKey,
          method: input.method,
          amountCents: order.totalCents,
          currency: "AUD",
          operatorName,
          recordedAt: now,
        });
        await tx
          .update(orders)
          .set({ paymentStatus: "paid", version: sql`${orders.version} + 1`, updatedAt: now })
          .where(eq(orders.id, order.id));
        return success((await loadAdminOrderDetail(tx, order.id))!);
      }),
    );
  } catch (error) {
    if (error instanceof ServiceFailure) return failure(error.serviceError);
    console.error("Failed to record counter payment", error);
    return failure(internalError());
  }
}
