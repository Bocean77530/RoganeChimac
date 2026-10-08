import "@tanstack/react-start/server-only";

import { createServerFn } from "@tanstack/react-start";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { ServiceResult } from "@/domain/common";
import type { CreateOrderInput, CreatedOrder } from "@/domain/order";
import { dineInLocalPrintPayload } from "@/domain/local-print";
import { withDatabase } from "@/db/client.server";
import {
  idempotencyKeys,
  integrationJobs,
  orderItemModifiers,
  orderItems,
  orderQuotes,
  orders,
  orderStatusEvents,
  pickupSlots,
  promotions,
  restaurantTables,
  restaurants,
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
  return `RC-${orderId.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}

async function createdOrderFromRow(row: typeof orders.$inferSelect): Promise<CreatedOrder> {
  const secret = trackingSecret();
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    trackingToken: await deriveTrackingToken(row.id, secret),
    status: row.status,
    paymentStatus: row.paymentStatus,
    fulfillment:
      row.fulfillmentMethod === "dine_in"
        ? { type: "dine_in", tableLabel: row.tableLabel! }
        : { type: "pickup", pickupAt: row.requestedFor.toISOString() },
    ...(row.fulfillmentMethod === "pickup" ? { pickupAt: row.requestedFor.toISOString() } : {}),
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
): Promise<ServiceResult<CreatedOrder>> {
  const parsed = createOrderSchema.safeParse(rawInput);
  if (!parsed.success) {
    return failure(
      serviceError("VALIDATION_ERROR", "Please check the customer and order details.", false, {
        order: parsed.error.issues.map((issue) => issue.message),
      }),
    );
  }

  const input = parsed.data;
  const requestHash = await hashObject(input);

  try {
    return await withDatabase(async (db) =>
      db.transaction(async (tx) => {
        const quote = (
          await tx
            .select()
            .from(orderQuotes)
            .where(eq(orderQuotes.id, input.quoteId))
            .for("update")
            .limit(1)
        )[0];
        if (!quote) abortWith(serviceError("QUOTE_EXPIRED", "The quote is no longer available."));
        const now = new Date();

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
            await tx.select().from(orders).where(eq(orders.id, existing.resourceId)).limit(1)
          )[0];
          if (!existingOrder) {
            abortWith(
              serviceError("REQUEST_IN_PROGRESS", "This checkout is still being processed."),
            );
          }
          return success(await createdOrderFromRow(existingOrder));
        }

        if (quote.expiresAt <= now) {
          abortWith(
            serviceError("QUOTE_EXPIRED", "The quote has expired. Please review the cart."),
          );
        }
        if (quote.consumedAt) {
          abortWith(serviceError("QUOTE_ALREADY_CONSUMED", "The quote has already been used."));
        }

        let slot: typeof pickupSlots.$inferSelect | undefined;
        let table: typeof restaurantTables.$inferSelect | undefined;
        if (quote.fulfillmentMethod === "pickup") {
          [slot] = await tx
            .update(pickupSlots)
            .set({
              reservedCount: sql`${pickupSlots.reservedCount} + 1`,
              updatedAt: now,
            })
            .where(
              and(
                eq(pickupSlots.id, quote.pickupSlotId!),
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
        } else if (
          quote.fulfillmentMethod === "dine_in" &&
          quote.paymentMethod === "pay_at_counter"
        ) {
          const [restaurant] = await tx
            .select({ dineInEnabled: restaurants.dineInEnabled })
            .from(restaurants)
            .where(eq(restaurants.id, quote.restaurantId))
            .limit(1);
          [table] = await tx
            .select()
            .from(restaurantTables)
            .where(
              and(
                eq(restaurantTables.id, quote.tableId!),
                eq(restaurantTables.restaurantId, quote.restaurantId),
                eq(restaurantTables.tokenVersion, quote.tableVersion!),
                eq(restaurantTables.active, true),
              ),
            )
            .for("update")
            .limit(1);
          if (!restaurant?.dineInEnabled || !table) {
            abortWith(serviceError("TABLE_CODE_INVALID", "This table code is no longer valid."));
          }
        } else {
          abortWith(
            serviceError("PAYMENT_METHOD_UNAVAILABLE", "This payment method is unavailable."),
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
        const dineIn = Boolean(table);
        const [created] = await tx
          .insert(orders)
          .values({
            id,
            restaurantId: quote.restaurantId,
            quoteId: quote.id,
            pickupSlotId: quote.pickupSlotId,
            tableId: table?.id,
            tableLabel: table?.label,
            orderNumber: orderNumber(id),
            trackingTokenHash: await hashTrackingToken(trackingToken, secret),
            fulfillmentMethod: dineIn ? "dine_in" : "pickup",
            paymentMethod: dineIn ? "pay_at_counter" : "online",
            status: dineIn ? "submitted" : "pending_payment",
            paymentStatus: dineIn ? "unpaid" : "pending",
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
            requestedFor: slot?.startsAt ?? now,
            paymentDueAt: dineIn ? null : paymentDueAt,
            placedAt: dineIn ? now : null,
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

        if (table) {
          for (const destination of ["kitchen", "front"] as const) {
            await tx
              .insert(integrationJobs)
              .values({
                id: crypto.randomUUID(),
                restaurantId: quote.restaurantId,
                orderId: created.id,
                kind: "kitchen_print",
                provider: "local_worker",
                idempotencyKey: `local_print:${created.id}:${destination}`,
                payloadVersion: 2,
                payload: dineInLocalPrintPayload({
                  destination,
                  orderId: created.id,
                  orderNumber: created.orderNumber,
                  placedAt: now,
                  tableId: table.id,
                  tableLabel: table.label,
                  customerName: created.customerName,
                  customerPhone: created.customerPhone,
                  customerNotes: created.customerNotes ?? undefined,
                  lines: quote.linesSnapshot,
                  totals: {
                    currency: "AUD",
                    subtotalCents: created.subtotalCents,
                    discountCents: created.discountCents,
                    totalCents: created.totalCents,
                  },
                }),
                nextAttemptAt: now,
                maxAttempts: 3,
              })
              .onConflictDoNothing({
                target: [integrationJobs.restaurantId, integrationJobs.idempotencyKey],
              });
          }
        }

        await tx.insert(orderStatusEvents).values({
          id: crypto.randomUUID(),
          orderId: created.id,
          fromStatus: null,
          toStatus: dineIn ? "submitted" : "pending_payment",
          actorType: "system",
          reason: dineIn ? "Dine-in order submitted; pay at counter" : "Checkout created",
          createdAt: now,
        });
        const [consumedQuote] = await tx
          .update(orderQuotes)
          .set({ consumedAt: now })
          .where(and(eq(orderQuotes.id, quote.id), isNull(orderQuotes.consumedAt)))
          .returning({ id: orderQuotes.id });
        if (!consumedQuote) {
          abortWith(serviceError("QUOTE_ALREADY_CONSUMED", "The quote has already been used."));
        }
        await tx
          .update(idempotencyKeys)
          .set({ state: "completed", resourceId: created.id, updatedAt: now })
          .where(eq(idempotencyKeys.id, insertedKey[0]!.id));

        return success(await createdOrderFromRow(created));
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
