import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { ServiceResult } from "@/domain/common";
import type { CanonicalPosOrder } from "@/domain/integrations";
import type { OrderStatus, PaymentStatus } from "@/domain/order";
import type { NormalizedPaymentEvent } from "@/domain/payment";
import { withDatabase, type DatabaseExecutor } from "@/db/client.server";
import {
  integrationJobs,
  orderItems,
  orders,
  paymentProviderEvents,
  paymentRefunds,
  payments,
  restaurants,
} from "@/db/schema";
import { hashObject } from "./crypto.server";
import { applyOrderTransition } from "./order-transitions.server";
import { loadAdminOrderDetail } from "./repositories/order-repository.server";
import {
  failure,
  internalError,
  ServiceFailure,
  serviceError,
  success,
} from "./service-errors.server";

export type PreparedPaymentAttempt = {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  paymentAttempt: number;
  total: { currency: "AUD"; amountCents: number };
  itemCount: number;
  customerEmail: string;
  expiresAt: string;
};

export type PaymentAttemptView = PreparedPaymentAttempt & {
  provider: string;
  sessionId: string | null;
  status: PaymentStatus;
  livemode: boolean;
};

export type ApplyPaymentEventResult = {
  duplicate: boolean;
  orderId?: string;
  orderStatus?: OrderStatus;
  paymentStatus?: PaymentStatus;
  posJobCreated: boolean;
};

async function paymentView(
  db: DatabaseExecutor,
  payment: typeof payments.$inferSelect,
): Promise<PaymentAttemptView> {
  // A DatabaseExecutor may be a transaction backed by one pg Client. Keep
  // statements sequential so the same client never executes overlapping queries.
  const order = await db.select().from(orders).where(eq(orders.id, payment.orderId)).limit(1);
  const countRow = await db
    .select({ count: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int` })
    .from(orderItems)
    .where(eq(orderItems.orderId, payment.orderId));
  if (!order[0]) throw new Error("Payment references a missing order");
  return {
    paymentId: payment.id,
    orderId: order[0].id,
    orderNumber: order[0].orderNumber,
    paymentAttempt: payment.attemptNumber,
    total: { currency: "AUD", amountCents: payment.amountCents },
    itemCount: countRow[0]?.count ?? 0,
    customerEmail: order[0].customerEmail,
    expiresAt: payment.expiresAt.toISOString(),
    provider: payment.provider,
    sessionId: payment.providerSessionId,
    status: payment.status,
    livemode: payment.livemode,
  };
}

export async function preparePaymentAttempt(input: {
  orderId: string;
  provider: string;
  livemode: boolean;
}): Promise<ServiceResult<PreparedPaymentAttempt>> {
  if (!input.orderId || !input.provider.trim()) {
    return failure(serviceError("VALIDATION_ERROR", "Invalid payment attempt."));
  }
  const now = new Date();

  try {
    return await withDatabase(async (db) =>
      db.transaction(async (tx) => {
        const order = (
          await tx.select().from(orders).where(eq(orders.id, input.orderId)).limit(1)
        )[0];
        if (!order) return failure(serviceError("ORDER_NOT_FOUND", "Order not found."));
        if (order.status !== "pending_payment" || order.paymentDueAt <= now) {
          return failure(
            serviceError("PAYMENT_NOT_CONFIRMED", "This order can no longer be paid."),
          );
        }

        const existing = (
          await tx
            .select()
            .from(payments)
            .where(and(eq(payments.orderId, order.id), eq(payments.provider, input.provider)))
            .orderBy(desc(payments.attemptNumber))
            .limit(1)
        )[0];
        if (existing?.status === "pending" && existing.expiresAt > now) {
          return success(await paymentView(tx, existing));
        }

        const latest = (
          await tx
            .select({ attemptNumber: payments.attemptNumber })
            .from(payments)
            .where(eq(payments.orderId, order.id))
            .orderBy(desc(payments.attemptNumber))
            .limit(1)
        )[0];
        const [created] = await tx
          .insert(payments)
          .values({
            id: crypto.randomUUID(),
            orderId: order.id,
            attemptNumber: (latest?.attemptNumber ?? 0) + 1,
            provider: input.provider,
            status: "pending",
            amountCents: order.totalCents,
            currency: order.currency,
            livemode: input.livemode,
            expiresAt: order.paymentDueAt,
          })
          .returning();
        if (!created) throw new Error("Payment attempt insert returned no row");
        if (order.paymentStatus !== "pending") {
          await tx
            .update(orders)
            .set({ paymentStatus: "pending", updatedAt: now })
            .where(eq(orders.id, order.id));
        }
        return success(await paymentView(tx, created));
      }),
    );
  } catch (error) {
    console.error("Failed to prepare payment attempt", error);
    return failure(internalError());
  }
}

export async function getResumablePaymentAttempt(input: {
  orderId: string;
  provider: string;
}): Promise<ServiceResult<PaymentAttemptView | null>> {
  if (!input.orderId || !input.provider.trim()) {
    return failure(serviceError("VALIDATION_ERROR", "Invalid payment lookup."));
  }
  try {
    return await withDatabase(async (db) => {
      const payment = (
        await db
          .select()
          .from(payments)
          .where(
            and(
              eq(payments.orderId, input.orderId),
              eq(payments.provider, input.provider),
              eq(payments.status, "pending"),
            ),
          )
          .orderBy(desc(payments.attemptNumber))
          .limit(1)
      )[0];
      return success(payment ? await paymentView(db, payment) : null);
    });
  } catch (error) {
    console.error("Failed to find resumable payment", error);
    return failure(internalError());
  }
}

export async function attachPaymentSession(input: {
  paymentId: string;
  provider: string;
  sessionId: string;
  expiresAt: string;
  livemode: boolean;
}): Promise<ServiceResult<PaymentAttemptView>> {
  const expiresAt = new Date(input.expiresAt);
  if (
    !input.paymentId ||
    !input.provider.trim() ||
    !input.sessionId.trim() ||
    Number.isNaN(expiresAt.getTime())
  ) {
    return failure(serviceError("VALIDATION_ERROR", "Invalid payment session."));
  }

  try {
    return await withDatabase(async (db) =>
      db.transaction(async (tx) => {
        const existing = (
          await tx.select().from(payments).where(eq(payments.id, input.paymentId)).limit(1)
        )[0];
        if (!existing) {
          return failure(serviceError("PAYMENT_NOT_CONFIRMED", "Payment attempt not found."));
        }
        if (
          existing.provider !== input.provider ||
          existing.livemode !== input.livemode ||
          (existing.providerSessionId && existing.providerSessionId !== input.sessionId)
        ) {
          return failure(
            serviceError(
              "IDEMPOTENCY_KEY_REUSED",
              "A different payment session is already attached to this attempt.",
            ),
          );
        }

        const [updated] = await tx
          .update(payments)
          .set({
            providerSessionId: input.sessionId,
            expiresAt,
            updatedAt: new Date(),
          })
          .where(eq(payments.id, existing.id))
          .returning();
        if (!updated) throw new Error("Payment session update returned no row");
        return success(await paymentView(tx, updated));
      }),
    );
  } catch (error) {
    console.error("Failed to attach payment session", error);
    return failure(internalError());
  }
}

async function findEventPayment(db: DatabaseExecutor, event: NormalizedPaymentEvent) {
  if (event.sessionId) {
    const bySession = (
      await db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.provider, event.provider),
            eq(payments.providerSessionId, event.sessionId),
          ),
        )
        .limit(1)
    )[0];
    if (bySession) return bySession;
  }
  if (event.paymentIntentId) {
    const byIntent = (
      await db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.provider, event.provider),
            eq(payments.providerPaymentIntentId, event.paymentIntentId),
          ),
        )
        .limit(1)
    )[0];
    if (byIntent) return byIntent;
  }
  if (!event.orderId) return undefined;
  return (
    await db
      .select()
      .from(payments)
      .where(and(eq(payments.provider, event.provider), eq(payments.orderId, event.orderId)))
      .orderBy(desc(payments.attemptNumber))
      .limit(1)
  )[0];
}

export async function applyNormalizedPaymentEvent(
  event: NormalizedPaymentEvent,
): Promise<ServiceResult<ApplyPaymentEventResult>> {
  const eventCreatedAt = new Date(event.eventCreatedAt);
  if (
    !event.provider.trim() ||
    !event.providerEventId.trim() ||
    Number.isNaN(eventCreatedAt.getTime())
  ) {
    return failure(serviceError("VALIDATION_ERROR", "Invalid normalized payment event."));
  }
  const now = new Date();

  try {
    return await withDatabase(async (db) =>
      db.transaction(async (tx) => {
        const insertedEvent = await tx
          .insert(paymentProviderEvents)
          .values({
            id: crypto.randomUUID(),
            provider: event.provider,
            providerEventId: event.providerEventId,
            eventType: event.type,
            eventCreatedAt,
            livemode: event.livemode,
            orderId: event.orderId,
            payloadHash: await hashObject(event),
          })
          .onConflictDoNothing({
            target: [paymentProviderEvents.provider, paymentProviderEvents.providerEventId],
          })
          .returning({ id: paymentProviderEvents.id });

        if (!insertedEvent[0]) {
          return success({ duplicate: true, posJobCreated: false });
        }
        const eventRowId = insertedEvent[0].id;

        if (event.type === "ignored") {
          await tx
            .update(paymentProviderEvents)
            .set({ outcome: "ignored", processedAt: now })
            .where(eq(paymentProviderEvents.id, eventRowId));
          return success({ duplicate: false, orderId: event.orderId, posJobCreated: false });
        }

        const payment = await findEventPayment(tx, event);
        if (!payment) {
          await tx
            .update(paymentProviderEvents)
            .set({
              outcome: "rejected",
              errorCode: "PAYMENT_NOT_CONFIRMED",
              errorMessage: "No matching payment attempt",
              processedAt: now,
            })
            .where(eq(paymentProviderEvents.id, eventRowId));
          return failure(
            serviceError("PAYMENT_NOT_CONFIRMED", "No matching payment attempt was found."),
          );
        }

        const order = (
          await tx.select().from(orders).where(eq(orders.id, payment.orderId)).limit(1)
        )[0];
        const isRefundEvent =
          event.type === "refund.created" ||
          event.type === "refund.updated" ||
          event.type === "refund.failed";
        const referenceMismatch =
          !order ||
          (event.orderId !== undefined && event.orderId !== payment.orderId) ||
          event.livemode !== payment.livemode;
        const paymentAmountMismatch =
          !isRefundEvent &&
          event.money !== undefined &&
          (event.money.currency !== payment.currency ||
            event.money.amountCents !== payment.amountCents);
        const refundAmountMismatch =
          isRefundEvent &&
          (!event.refundId ||
            !event.money ||
            event.money.currency !== payment.currency ||
            event.money.amountCents <= 0 ||
            event.money.amountCents > payment.amountCents);
        if (
          referenceMismatch ||
          paymentAmountMismatch ||
          refundAmountMismatch ||
          (event.type === "payment.succeeded" && !event.money)
        ) {
          await tx
            .update(paymentProviderEvents)
            .set({
              paymentId: payment.id,
              orderId: payment.orderId,
              outcome: "rejected",
              errorCode: "PAYMENT_NOT_CONFIRMED",
              errorMessage: "Payment event metadata or amount did not match the order",
              processedAt: now,
            })
            .where(eq(paymentProviderEvents.id, eventRowId));
          return failure(
            serviceError("PAYMENT_NOT_CONFIRMED", "Payment details did not match the order."),
          );
        }
        if (!order) throw new Error("Payment references a missing order");

        let orderStatus = order.status;
        let paymentStatus = payment.status;
        let posJobCreated = false;

        if (event.type === "payment.succeeded") {
          const eligibleForFulfillment = order.status !== "expired" && order.status !== "cancelled";
          if (order.status === "pending_payment") {
            const transitioned = await applyOrderTransition(tx, {
              orderId: order.id,
              expectedVersion: order.version,
              toStatus: "paid",
              actorType: "payment",
              actorReference: event.providerEventId,
              now,
            });
            orderStatus = transitioned.status;
          }
          paymentStatus = "paid";
          await tx
            .update(payments)
            .set({
              status: "paid",
              providerPaymentIntentId: event.paymentIntentId ?? payment.providerPaymentIntentId,
              paidAt: payment.paidAt ?? now,
              updatedAt: now,
            })
            .where(eq(payments.id, payment.id));
          await tx
            .update(orders)
            .set({ paymentStatus: "paid", updatedAt: now })
            .where(eq(orders.id, order.id));

          if (eligibleForFulfillment) {
            const restaurant = await tx
              .select({ posProvider: restaurants.posProvider })
              .from(restaurants)
              .where(eq(restaurants.id, order.restaurantId))
              .limit(1);
            const detail = await loadAdminOrderDetail(tx, order.id);
            if (!detail || !restaurant[0]) throw new Error("Cannot build POS integration job");
            const payload: CanonicalPosOrder = {
              id: detail.id,
              orderNumber: detail.orderNumber,
              requestedFor: detail.requestedFor,
              customerName: detail.customerName,
              customerPhone: detail.customerPhone,
              lines: detail.lines,
              totals: detail.totals,
              tender: "PREPAID_ONLINE",
            };
            const createdJob = await tx
              .insert(integrationJobs)
              .values({
                id: crypto.randomUUID(),
                restaurantId: order.restaurantId,
                orderId: order.id,
                kind: "pos",
                provider: restaurant[0].posProvider,
                idempotencyKey: `pos:${order.id}:paid`,
                payload,
                nextAttemptAt: now,
              })
              .onConflictDoNothing({
                target: [integrationJobs.restaurantId, integrationJobs.idempotencyKey],
              })
              .returning({ id: integrationJobs.id });
            posJobCreated = Boolean(createdJob[0]);
          }
        } else if (event.type === "payment.failed") {
          if (
            payment.status === "paid" ||
            payment.status === "partially_refunded" ||
            payment.status === "refunded" ||
            order.status !== "pending_payment"
          ) {
            await tx
              .update(paymentProviderEvents)
              .set({
                paymentId: payment.id,
                orderId: order.id,
                outcome: "ignored",
                processedAt: now,
              })
              .where(eq(paymentProviderEvents.id, eventRowId));
            return success({
              duplicate: false,
              orderId: order.id,
              orderStatus: order.status,
              paymentStatus: order.paymentStatus,
              posJobCreated: false,
            });
          }
          paymentStatus = "failed";
          await tx
            .update(payments)
            .set({ status: "failed", updatedAt: now })
            .where(eq(payments.id, payment.id));
          if (order.status === "pending_payment") {
            await tx
              .update(orders)
              .set({ paymentStatus: "failed", updatedAt: now })
              .where(eq(orders.id, order.id));
          }
        } else if (event.type === "session.expired") {
          if (
            payment.status === "paid" ||
            payment.status === "partially_refunded" ||
            payment.status === "refunded" ||
            order.status !== "pending_payment"
          ) {
            await tx
              .update(paymentProviderEvents)
              .set({
                paymentId: payment.id,
                orderId: order.id,
                outcome: "ignored",
                processedAt: now,
              })
              .where(eq(paymentProviderEvents.id, eventRowId));
            return success({
              duplicate: false,
              orderId: order.id,
              orderStatus: order.status,
              paymentStatus: order.paymentStatus,
              posJobCreated: false,
            });
          }
          paymentStatus = "failed";
          await tx
            .update(payments)
            .set({ status: "failed", updatedAt: now })
            .where(eq(payments.id, payment.id));
          if (order.status === "pending_payment") {
            const transitioned = await applyOrderTransition(tx, {
              orderId: order.id,
              expectedVersion: order.version,
              toStatus: "expired",
              actorType: "payment",
              actorReference: event.providerEventId,
              now,
            });
            orderStatus = transitioned.status;
            await tx
              .update(orders)
              .set({ paymentStatus: "failed", updatedAt: now })
              .where(eq(orders.id, order.id));
          }
        } else if (isRefundEvent) {
          const refundId = event.refundId!;
          const refundMoney = event.money!;
          const existingRefund = (
            await tx
              .select()
              .from(paymentRefunds)
              .where(
                and(
                  eq(paymentRefunds.provider, event.provider),
                  eq(paymentRefunds.providerRefundId, refundId),
                ),
              )
              .limit(1)
          )[0];
          const otherRefundTotal =
            (
              await tx
                .select({
                  total: sql<number>`coalesce(sum(${paymentRefunds.amountCents}), 0)::int`,
                })
                .from(paymentRefunds)
                .where(
                  and(
                    eq(paymentRefunds.paymentId, payment.id),
                    eq(paymentRefunds.status, "succeeded"),
                    existingRefund ? ne(paymentRefunds.id, existingRefund.id) : sql`true`,
                  ),
                )
            )[0]?.total ?? 0;
          if (
            event.type !== "refund.failed" &&
            otherRefundTotal + refundMoney.amountCents > payment.amountCents
          ) {
            await tx
              .update(paymentProviderEvents)
              .set({
                paymentId: payment.id,
                orderId: order.id,
                outcome: "rejected",
                errorCode: "PAYMENT_NOT_CONFIRMED",
                errorMessage: "Refund total exceeded the captured amount",
                processedAt: now,
              })
              .where(eq(paymentProviderEvents.id, eventRowId));
            return failure(
              serviceError("PAYMENT_NOT_CONFIRMED", "Refund amount exceeded the payment."),
            );
          }
          await tx
            .insert(paymentRefunds)
            .values({
              id: crypto.randomUUID(),
              paymentId: payment.id,
              provider: event.provider,
              providerRefundId: refundId,
              amountCents: refundMoney.amountCents,
              currency: refundMoney.currency,
              status: event.type === "refund.failed" ? "failed" : "succeeded",
            })
            .onConflictDoUpdate({
              target: [paymentRefunds.provider, paymentRefunds.providerRefundId],
              set: {
                amountCents: refundMoney.amountCents,
                status: event.type === "refund.failed" ? "failed" : "succeeded",
                updatedAt: now,
              },
            });
          const refundTotal =
            (
              await tx
                .select({
                  total: sql<number>`coalesce(sum(${paymentRefunds.amountCents}), 0)::int`,
                })
                .from(paymentRefunds)
                .where(
                  and(
                    eq(paymentRefunds.paymentId, payment.id),
                    eq(paymentRefunds.status, "succeeded"),
                  ),
                )
            )[0]?.total ?? 0;
          paymentStatus =
            refundTotal === 0
              ? "paid"
              : refundTotal === payment.amountCents
                ? "refunded"
                : "partially_refunded";
          await tx
            .update(payments)
            .set({
              status: paymentStatus,
              refundedAmountCents: refundTotal,
              updatedAt: now,
            })
            .where(eq(payments.id, payment.id));
          await tx
            .update(orders)
            .set({ paymentStatus, updatedAt: now })
            .where(eq(orders.id, order.id));
        }

        await tx
          .update(paymentProviderEvents)
          .set({
            paymentId: payment.id,
            orderId: order.id,
            outcome: "processed",
            processedAt: now,
          })
          .where(eq(paymentProviderEvents.id, eventRowId));

        return success({
          duplicate: false,
          orderId: order.id,
          orderStatus,
          paymentStatus,
          posJobCreated,
        });
      }),
    );
  } catch (error) {
    if (error instanceof ServiceFailure) return failure(error.serviceError);
    console.error("Failed to apply payment event", error);
    return failure(internalError());
  }
}
