import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { orders } from "./orders";

export const counterPaymentRecords = pgTable(
  "counter_payment_records",
  {
    id: uuid("id").primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    method: varchar("method", { length: 16 }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("AUD"),
    operatorName: varchar("operator_name", { length: 100 }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("counter_payment_records_order_uidx").on(table.orderId),
    uniqueIndex("counter_payment_records_key_uidx").on(table.idempotencyKey),
    check("counter_payment_records_method_chk", sql`${table.method} in ('cash', 'card', 'other')`),
    check("counter_payment_records_amount_chk", sql`${table.amountCents} >= 0`),
    check("counter_payment_records_currency_chk", sql`${table.currency} = 'AUD'`),
    check("counter_payment_records_operator_chk", sql`length(trim(${table.operatorName})) > 0`),
  ],
);
