import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { paymentEventOutcomeEnum, paymentStatusEnum } from "./enums";
import { orders } from "./orders";

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    provider: varchar("provider", { length: 64 }).notNull(),
    providerSessionId: varchar("provider_session_id", { length: 255 }),
    providerPaymentIntentId: varchar("provider_payment_intent_id", { length: 255 }),
    status: paymentStatusEnum("status").notNull().default("pending"),
    amountCents: integer("amount_cents").notNull(),
    refundedAmountCents: integer("refunded_amount_cents").notNull().default(0),
    currency: varchar("currency", { length: 3 }).notNull().default("AUD"),
    livemode: boolean("livemode").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("payments_order_attempt_uidx").on(table.orderId, table.attemptNumber),
    uniqueIndex("payments_provider_session_uidx").on(table.provider, table.providerSessionId),
    index("payments_order_status_idx").on(table.orderId, table.status),
    check("payments_attempt_chk", sql`${table.attemptNumber} > 0`),
    check("payments_amount_chk", sql`${table.amountCents} >= 0`),
    check(
      "payments_refunded_amount_chk",
      sql`${table.refundedAmountCents} >= 0 and ${table.refundedAmountCents} <= ${table.amountCents}`,
    ),
    check("payments_currency_chk", sql`${table.currency} = 'AUD'`),
  ],
);

export const paymentRefunds = pgTable(
  "payment_refunds",
  {
    id: uuid("id").primaryKey(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 64 }).notNull(),
    providerRefundId: varchar("provider_refund_id", { length: 255 }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("AUD"),
    status: varchar("status", { length: 16 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("payment_refunds_provider_refund_uidx").on(table.provider, table.providerRefundId),
    index("payment_refunds_payment_idx").on(table.paymentId, table.status),
    check("payment_refunds_amount_chk", sql`${table.amountCents} > 0`),
    check("payment_refunds_currency_chk", sql`${table.currency} = 'AUD'`),
    check("payment_refunds_status_chk", sql`${table.status} in ('succeeded', 'failed')`),
  ],
);

export const paymentProviderEvents = pgTable(
  "payment_provider_events",
  {
    id: uuid("id").primaryKey(),
    provider: varchar("provider", { length: 64 }).notNull(),
    providerEventId: varchar("provider_event_id", { length: 255 }).notNull(),
    eventType: varchar("event_type", { length: 80 }).notNull(),
    eventCreatedAt: timestamp("event_created_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    livemode: boolean("livemode").notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    paymentId: uuid("payment_id").references(() => payments.id, {
      onDelete: "set null",
    }),
    payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
    outcome: paymentEventOutcomeEnum("outcome").notNull().default("received"),
    errorCode: varchar("error_code", { length: 80 }),
    errorMessage: text("error_message"),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("payment_provider_events_provider_event_uidx").on(
      table.provider,
      table.providerEventId,
    ),
    index("payment_provider_events_order_idx").on(table.orderId, table.receivedAt),
  ],
);
