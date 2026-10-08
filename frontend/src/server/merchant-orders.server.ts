import "@tanstack/react-start/server-only";

import { desc, inArray } from "drizzle-orm";
import type { AdminOrderDetail, OrderStatus } from "@/domain/order";
import type { ServiceResult } from "@/domain/common";
import { withDatabase } from "@/db/client.server";
import { orders } from "@/db/schema";
import { requireAdminAccess } from "./admin-auth.server";
import { transitionOrderStatus } from "./order-transitions.server";
import { loadAdminOrderDetail } from "./repositories/order-repository.server";
import { failure, internalError, serviceError, success } from "./service-errors.server";

export async function listMerchantOrders(
  token: string,
): Promise<ServiceResult<AdminOrderDetail[]>> {
  requireAdminAccess(token);
  try {
    return await withDatabase(async (db) => {
      const recent = await db
        .select({ id: orders.id })
        .from(orders)
        .where(inArray(orders.status, ["paid", "accepted", "preparing", "ready", "collected"]))
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
  if (!["accepted", "preparing", "ready", "collected"].includes(input.toStatus)) {
    return failure(serviceError("INVALID_STATUS_TRANSITION", "This status cannot be set here."));
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
