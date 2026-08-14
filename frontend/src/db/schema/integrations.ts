import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { CanonicalPosOrder, KitchenTicket } from "@/domain/integrations";
import { integrationJobStatusEnum, integrationKindEnum } from "./enums";
import { orders } from "./orders";
import { restaurants } from "./restaurants";

export const integrationJobs = pgTable(
  "integration_jobs",
  {
    id: uuid("id").primaryKey(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    kind: integrationKindEnum("kind").notNull(),
    provider: varchar("provider", { length: 64 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    payloadVersion: integer("payload_version").notNull().default(1),
    status: integrationJobStatusEnum("status").notNull().default("queued"),
    payload: jsonb("payload").$type<CanonicalPosOrder | KitchenTicket>().notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(6),
    nextAttemptAt: timestamp("next_attempt_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true, mode: "date" }),
    leaseExpiresAt: timestamp("lease_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    lockedBy: varchar("locked_by", { length: 128 }),
    externalId: varchar("external_id", { length: 255 }),
    lastErrorCode: varchar("last_error_code", { length: 80 }),
    lastErrorMessage: text("last_error_message"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("integration_jobs_idempotency_uidx").on(
      table.restaurantId,
      table.idempotencyKey,
    ),
    index("integration_jobs_claim_idx").on(table.status, table.nextAttemptAt, table.createdAt),
    check(
      "integration_jobs_attempt_chk",
      sql`${table.attemptCount} >= 0 and ${table.attemptCount} <= ${table.maxAttempts}`,
    ),
    check("integration_jobs_max_attempts_chk", sql`${table.maxAttempts} > 0`),
    check("integration_jobs_payload_version_chk", sql`${table.payloadVersion} > 0`),
  ],
);
