import "@tanstack/react-start/server-only";

import { createServerFn } from "@tanstack/react-start";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { ServiceResult } from "@/domain/common";
import type { CreateOrderInput, PendingOrder } from "@/domain/order";
import { withDatabase } from "@/db/client.server";
import {
  idempotencyKeys,
  orderItemModifiers,
  orderItems,
  orderQuotes,
  orders,
  orderStatusEvents,
  pickupSlots,
  promotions,
} from "@/db/schema";
import {
  deriveTrackingToken,
  hashObject,
  hashTrackingToken,
  trackingSecret,
} from "./crypto.server";
import {
  abortWith,
  failure,
  internalError,
  ServiceFailure,
  serviceError,
  success,
} from "./service-errors.server";

const createOrderSchema = z.object({
  quoteId: z.string().uuid(),
  attemptId: z.string().trim().min(8).max(128),
  customer: z.object({
    name: z.string().trim().min(2).max(100),
    phone: z.string().trim().min(8).max(32),
    email: z.string().trim().email().max(320),
  }),
  notes: z.string().trim().max(300).optional(),
  termsAccepted: z.literal(true),
  termsVersion: z.string().trim().min(1).max(64),
});

function orderNumber(orderId: string): string {
  return `ST-${orderId.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}

async function pendingOrderFromRow(
  row: typeof orders.$inferSelect,
  pickupAt: Date,
): Promise<PendingOrder> {
  const secret = trackingSecret();
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    trackingToken: await deriveTrackingToken(row.id, secret),
    status: "pending_payment",
    paymentStatus: "pending",
    pickupAt: pickupAt.toISOString(),
    customerEmail: row.customerEmail,
    totals: {
      currency: "AUD",
      subtotalCents: row.subtotalCents,
      discountCents: row.discountCents,
      totalCents: row.totalCents,
    },
  };
}

export async function createPendingOrder(
  rawInput: CreateOrderInput,
): Promise<ServiceResult<PendingOrder>> {
  const parsed = createOrderSchema.safeParse(rawInput);
  if (!parsed.success) {
    return failure(
      serviceError("VALIDATION_ERROR", "Please check the customer and order details.", false, {
        order: parsed.error.issues.map((issue) => issue.message),
      }),
    );
  }

  const input = parsed.data;
  const now = new Date();
  const requestHash = await hashObject(input);

  try {
    return await withDatabase(async (db) =>
      db.transaction(async (tx) => {
        const quote = (
          await tx.select().from(orderQuotes).where(eq(orderQuotes.id, input.quoteId)).limit(1)
        )[0];
        if (!quote) abortWith(serviceError("QUOTE_EXPIRED", "The quote is no longer available."));

        const insertedKey = await tx
          .insert(idempotencyKeys)
          .values({
            id: crypto.randomUUID(),
            restaurantId: quote.restaurantId,
            scope: "create_order",
            key: input.attemptId,
            requestHash,
            expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1_000),
          })
          .onConflictDoNothing({
            target: [idempotencyKeys.restaurantId, idempotencyKeys.scope, idempotencyKeys.key],
          })
          .returning({ id: idempotencyKeys.id });

        if (!insertedKey[0]) {
          const existing = (
            await tx
              .select()
              .from(idempotencyKeys)
              .where(
                and(
                  eq(idempotencyKeys.restaurantId, quote.restaurantId),
                  eq(idempotencyKeys.scope, "create_order"),
                  eq(idempotencyKeys.key, input.attemptId),
                ),
              )
              .limit(1)
          )[0];
          if (!existing || existing.requestHash !== requestHash) {
            abortWith(
              serviceError(
                "IDEMPOTENCY_KEY_REUSED",
                "This checkout attempt was already used for different details.",
              ),
            );
          }
          if (existing.state !== "completed" || !existing.resourceId) {
            abortWith(
              serviceError("REQUEST_IN_PROGRESS", "This checkout is still being processed.", true),
            );
          }

          const existingOrder = (
            await tx
              .select({ order: orders, pickupAt: pickupSlots.startsAt })
              .from(orders)
              .innerJoin(pickupSlots, eq(pickupSlots.id, orders.pickupSlotId))
              .where(eq(orders.id, existing.resourceId))
              .limit(1)
          )[0];
          if (!existingOrder || existingOrder.order.status !== "pending_payment") {
            abortWith(serviceError("REQUEST_IN_PROGRESS", "This checkout has already moved on."));
          }
          return success(await pendingOrderFromRow(existingOrder.order, existingOrder.pickupAt));
        }

        if (quote.expiresAt <= now) {
          abortWith(
            serviceError("QUOTE_EXPIRED", "The quote has expired. Please review the cart."),
          );
        }
        if (quote.consumedAt) {
          abortWith(serviceError("QUOTE_ALREADY_CONSUMED", "The quote has already been used."));
        }

        const [slot] = await tx
          .update(pickupSlots)
          .set({
            reservedCount: sql`${pickupSlots.reservedCount} + 1`,
            updatedAt: now,
          })
          .where(
            and(
              eq(pickupSlots.id, quote.pickupSlotId),
              eq(pickupSlots.restaurantId, quote.restaurantId),
              eq(pickupSlots.enabled, true),
              lt(pickupSlots.reservedCount, pickupSlots.capacity),
              sql`${pickupSlots.startsAt} > ${now}`,
            ),
          )
          .returning();
        if (!slot) {
          abortWith(
            serviceError("PICKUP_SLOT_UNAVAILABLE", "That pickup time is no longer available."),
          );
        }

        if (quote.promotionId) {
          const updatedPromotion = await tx
            .update(promotions)
            .set({ useCount: sql`${promotions.useCount} + 1`, updatedAt: now })
            .where(
              and(
                eq(promotions.id, quote.promotionId),
                eq(promotions.active, true),
                or(isNull(promotions.maxUses), lt(promotions.useCount, promotions.maxUses)),
              ),
            )
            .returning({ id: promotions.id });
          if (!updatedPromotion[0]) {
            abortWith(serviceError("PROMO_INVALID", "The promo code is no longer available."));
          }
        }

        const id = crypto.randomUUID();
        const secret = trackingSecret();
        const trackingToken = await deriveTrackingToken(id, secret);
        const pendingSeconds = Math.max(
          1_860,
          Number(process.env.PENDING_ORDER_TTL_SECONDS ?? 1_800),
        );
        const paymentDueAt = new Date(now.getTime() + pendingSeconds * 1_000);
        const [created] = await tx
          .insert(orders)
          .values({
            id,
            restaurantId: quote.restaurantId,
            quoteId: quote.id,
            pickupSlotId: quote.pickupSlotId,
            orderNumber: orderNumber(id),
            trackingTokenHash: await hashTrackingToken(trackingToken, secret),
            customerName: input.customer.name.trim(),
            customerPhone: input.customer.phone.replace(/[\s()-]/g, ""),
            customerEmail: input.customer.email.trim().toLowerCase(),
            customerNotes: input.notes?.trim() || null,
            termsVersion: input.termsVersion,
            termsAcceptedAt: now,
            currency: quote.currency,
            subtotalCents: quote.subtotalCents,
            discountCents: quote.discountCents,
            totalCents: quote.totalCents,
            promotionCode: quote.promotionCode,
            requestedFor: slot.startsAt,
            paymentDueAt,
          })
          .returning();
        if (!created) throw new Error("Order insert returned no row");

        for (const [lineIndex, line] of quote.linesSnapshot.entries()) {
          const itemId = crypto.randomUUID();
          await tx.insert(orderItems).values({
            id: itemId,
            orderId: created.id,
            clientLineId: line.clientLineId,
            menuItemSlug: line.menuItemId,
            name: line.name,
            koreanName: line.koreanName,
            unitPriceCents: line.unitPriceCents,
            quantity: line.quantity,
            lineTotalCents: line.lineTotalCents,
            notes: line.notes,
            sortOrder: lineIndex,
          });

          if (line.modifiers.length > 0) {
            await tx.insert(orderItemModifiers).values(
              line.modifiers.map((modifier, modifierIndex) => ({
                id: crypto.randomUUID(),
                orderItemId: itemId,
                groupCode: modifier.groupId,
                groupName: modifier.groupName,
                optionCode: modifier.optionId,
                optionName: modifier.optionName,
                priceDeltaCents: modifier.priceDeltaCents,
                sortOrder: modifierIndex,
              })),
            );
          }
        }

        await tx.insert(orderStatusEvents).values({
          id: crypto.randomUUID(),
          orderId: created.id,
          fromStatus: null,
          toStatus: "pending_payment",
          actorType: "system",
          reason: "Checkout created",
          createdAt: now,
        });
        await tx
          .update(orderQuotes)
          .set({ consumedAt: now })
          .where(and(eq(orderQuotes.id, quote.id), isNull(orderQuotes.consumedAt)));
        await tx
          .update(idempotencyKeys)
          .set({ state: "completed", resourceId: created.id, updatedAt: now })
          .where(eq(idempotencyKeys.id, insertedKey[0]!.id));

        return success({
          id: created.id,
          orderNumber: created.orderNumber,
          trackingToken,
          status: "pending_payment",
          paymentStatus: "pending",
          pickupAt: created.requestedFor.toISOString(),
          customerEmail: created.customerEmail,
          totals: {
            currency: "AUD",
            subtotalCents: created.subtotalCents,
            discountCents: created.discountCents,
            totalCents: created.totalCents,
          },
        });
      }),
    );
  } catch (error) {
    if (error instanceof ServiceFailure) return failure(error.serviceError);
    console.error("Failed to create pending order", error);
    return failure(internalError());
  }
}

export const createPendingOrderServerFn = createServerFn({ method: "POST" })
  .validator(createOrderSchema)
  .handler(({ data }) => createPendingOrder(data));
