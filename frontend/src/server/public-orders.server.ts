import "@tanstack/react-start/server-only";

import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { ServiceResult } from "@/domain/common";
import type { PublicOrderView } from "@/domain/order";
import { withDatabase } from "@/db/client.server";
import { orders, payments } from "@/db/schema";
import {
  deriveTrackingToken,
  hashTrackingToken,
  trackingSecret,
} from "./crypto.server";
import { loadOrderLines, loadOrderTimeline } from "./repositories/order-repository.server";
import { failure, internalError, serviceError, success } from "./service-errors.server";

export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  if (!local || !domain) return "***";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

export type PublicOrderAccessView = PublicOrderView & {
  trackingToken: string;
};

async function publicOrderView(
  db: Parameters<typeof loadOrderLines>[0],
  order: typeof orders.$inferSelect,
): Promise<PublicOrderView> {
  const [lines, timeline] = await Promise.all([
    loadOrderLines(db, order.id),
    loadOrderTimeline(db, order.id),
  ]);

  return {
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    pickupAt: order.requestedFor.toISOString(),
    placedAt: order.placedAt?.toISOString() ?? null,
    maskedEmail: maskEmail(order.customerEmail),
    lines,
    totals: {
      currency: "AUD",
      subtotalCents: order.subtotalCents,
      discountCents: order.discountCents,
      totalCents: order.totalCents,
    },
    timeline,
  };
}

export async function getPublicOrder(input: {
  trackingToken: string;
}): Promise<ServiceResult<PublicOrderView>> {
  const token = input.trackingToken.trim();
  if (token.length < 32 || token.length > 128) {
    return failure(serviceError("ORDER_NOT_FOUND", "Order not found."));
  }

  try {
    const tokenHash = await hashTrackingToken(token, trackingSecret());
    return await withDatabase(async (db) => {
      const order = (
        await db.select().from(orders).where(eq(orders.trackingTokenHash, tokenHash)).limit(1)
      )[0];
      if (!order) return failure(serviceError("ORDER_NOT_FOUND", "Order not found."));

      return success(await publicOrderView(db, order));
    });
  } catch (error) {
    console.error("Failed to load public order", error);
    return failure(internalError());
  }
}

export const getPublicOrderServerFn = createServerFn({ method: "GET" })
  .validator(z.object({ trackingToken: z.string().trim().min(32).max(128) }))
  .handler(({ data }) => getPublicOrder(data));

export async function getPublicOrderByPaymentSession(input: {
  sessionId: string;
}): Promise<ServiceResult<PublicOrderAccessView>> {
  const sessionId = input.sessionId.trim();
  if (sessionId.length < 16 || sessionId.length > 255) {
    return failure(serviceError("ORDER_NOT_FOUND", "Order not found."));
  }

  try {
    return await withDatabase(async (db) => {
      const match = (
        await db
          .select({ order: orders })
          .from(payments)
          .innerJoin(orders, eq(orders.id, payments.orderId))
          .where(eq(payments.providerSessionId, sessionId))
          .limit(1)
      )[0];
      if (!match) return failure(serviceError("ORDER_NOT_FOUND", "Order not found."));

      const secret = trackingSecret();
      return success({
        ...(await publicOrderView(db, match.order)),
        trackingToken: await deriveTrackingToken(match.order.id, secret),
      });
    });
  } catch (error) {
    console.error("Failed to load public order by payment session", error);
    return failure(internalError());
  }
}

export const getPublicOrderByPaymentSessionServerFn = createServerFn({
  method: "GET",
})
  .validator(z.object({ sessionId: z.string().trim().min(16).max(255) }))
  .handler(({ data }) => getPublicOrderByPaymentSession(data));
