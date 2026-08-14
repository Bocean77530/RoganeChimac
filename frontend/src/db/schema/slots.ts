import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { restaurants } from "./restaurants";

export const pickupSlots = pgTable(
  "pickup_slots",
  {
    id: uuid("id").primaryKey(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }).notNull(),
    capacity: integer("capacity").notNull(),
    reservedCount: integer("reserved_count").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("pickup_slots_restaurant_start_uidx").on(table.restaurantId, table.startsAt),
    index("pickup_slots_availability_idx").on(table.restaurantId, table.enabled, table.startsAt),
    check("pickup_slots_time_chk", sql`${table.startsAt} < ${table.endsAt}`),
    check("pickup_slots_capacity_chk", sql`${table.capacity} > 0`),
    check(
      "pickup_slots_reserved_chk",
      sql`${table.reservedCount} >= 0 and ${table.reservedCount} <= ${table.capacity}`,
    ),
  ],
);
