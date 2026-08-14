import { index, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { idempotencyStateEnum } from "./enums";
import { restaurants } from "./restaurants";

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    scope: varchar("scope", { length: 80 }).notNull(),
    key: varchar("key", { length: 128 }).notNull(),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    state: idempotencyStateEnum("state").notNull().default("processing"),
    resourceId: uuid("resource_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idempotency_keys_scope_key_uidx").on(table.restaurantId, table.scope, table.key),
    index("idempotency_keys_expiry_idx").on(table.expiresAt),
  ],
);
