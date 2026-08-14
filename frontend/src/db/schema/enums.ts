import { pgEnum } from "drizzle-orm/pg-core";

export const orderStatusEnum = pgEnum("order_status", [
  "pending_payment",
  "paid",
  "accepted",
  "preparing",
  "ready",
  "collected",
  "expired",
  "cancelled",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "unpaid",
  "pending",
  "paid",
  "failed",
  "partially_refunded",
  "refunded",
]);

export const discountTypeEnum = pgEnum("discount_type", ["percent", "fixed"]);

export const statusActorEnum = pgEnum("status_actor", [
  "system",
  "admin",
  "payment",
  "integration",
]);

export const idempotencyStateEnum = pgEnum("idempotency_state", [
  "processing",
  "completed",
  "failed",
]);

export const paymentEventOutcomeEnum = pgEnum("payment_event_outcome", [
  "received",
  "processed",
  "ignored",
  "rejected",
]);

export const integrationKindEnum = pgEnum("integration_kind", ["pos", "kitchen_print"]);

export const integrationJobStatusEnum = pgEnum("integration_job_status", [
  "queued",
  "processing",
  "retry_scheduled",
  "succeeded",
  "manual_action_required",
  "dead_letter",
  "cancelled",
]);
