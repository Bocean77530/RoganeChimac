import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";
import { restaurants } from "./restaurants";

export const restaurantTables = pgTable(
  "restaurant_tables",
  {
    id: uuid("id").primaryKey(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "restrict" }),
    code: varchar("code", { length: 40 }).notNull(),
    label: text("label").notNull(),
    active: boolean("active").notNull().default(true),
    tokenVersion: integer("token_version").notNull().default(1),
  },
  (table) => [
    uniqueIndex("restaurant_tables_restaurant_code_uidx").on(table.restaurantId, table.code),
    index("restaurant_tables_restaurant_active_idx").on(table.restaurantId, table.active),
    check("restaurant_tables_token_version_chk", sql`${table.tokenVersion} > 0`),
    check("restaurant_tables_code_chk", sql`length(trim(${table.code})) > 0`),
    check("restaurant_tables_label_chk", sql`length(trim(${table.label})) > 0`),
  ],
);

export const tableCodeRateLimits = pgTable(
  "table_code_rate_limits",
  {
    keyHash: varchar("key_hash", { length: 64 }).primaryKey(),
    windowStart: timestamp("window_start", { withTimezone: true, mode: "date" }).notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
  },
  (table) => [check("table_code_rate_limits_count_chk", sql`${table.attemptCount} >= 0`)],
);
