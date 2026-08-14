import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const restaurants = pgTable(
  "restaurants",
  {
    id: uuid("id").primaryKey(),
    slug: varchar("slug", { length: 80 }).notNull(),
    name: text("name").notNull(),
    timezone: text("timezone").notNull().default("Australia/Melbourne"),
    currency: varchar("currency", { length: 3 }).notNull().default("AUD"),
    addressLine1: text("address_line_1").notNull(),
    suburb: text("suburb").notNull(),
    country: text("country").notNull().default("Australia"),
    phone: varchar("phone", { length: 32 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    abn: varchar("abn", { length: 20 }),
    orderingEnabled: boolean("ordering_enabled").notNull().default(true),
    pickupPrepMinutes: smallint("pickup_prep_minutes").notNull().default(20),
    pickupSlotIntervalMinutes: smallint("pickup_slot_interval_minutes").notNull().default(15),
    pickupBookingDays: smallint("pickup_booking_days").notNull().default(7),
    pickupCapacityPerSlot: smallint("pickup_capacity_per_slot").notNull().default(8),
    posProvider: varchar("pos_provider", { length: 64 }).notNull().default("mock"),
    kitchenPrintProvider: varchar("kitchen_print_provider", { length: 64 })
      .notNull()
      .default("browser"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("restaurants_slug_uidx").on(table.slug),
    check("restaurants_currency_chk", sql`${table.currency} = 'AUD'`),
    check("restaurants_pickup_prep_chk", sql`${table.pickupPrepMinutes} between 0 and 240`),
    check(
      "restaurants_slot_interval_chk",
      sql`${table.pickupSlotIntervalMinutes} between 5 and 120`,
    ),
    check("restaurants_booking_days_chk", sql`${table.pickupBookingDays} between 1 and 31`),
    check("restaurants_slot_capacity_chk", sql`${table.pickupCapacityPerSlot} between 1 and 1000`),
  ],
);

export const businessHours = pgTable(
  "business_hours",
  {
    id: uuid("id").primaryKey(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    dayOfWeek: smallint("day_of_week").notNull(),
    opensAt: time("opens_at").notNull(),
    closesAt: time("closes_at").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    uniqueIndex("business_hours_period_uidx").on(
      table.restaurantId,
      table.dayOfWeek,
      table.opensAt,
    ),
    index("business_hours_lookup_idx").on(table.restaurantId, table.dayOfWeek),
    check("business_hours_day_chk", sql`${table.dayOfWeek} between 0 and 6`),
    check("business_hours_range_chk", sql`${table.opensAt} < ${table.closesAt}`),
  ],
);

export const specialHours = pgTable(
  "special_hours",
  {
    id: uuid("id").primaryKey(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    serviceDate: date("service_date", { mode: "string" }).notNull(),
    isClosed: boolean("is_closed").notNull().default(false),
    opensAt: time("opens_at"),
    closesAt: time("closes_at"),
    reason: text("reason"),
  },
  (table) => [
    uniqueIndex("special_hours_date_uidx").on(table.restaurantId, table.serviceDate),
    check(
      "special_hours_shape_chk",
      sql`(${table.isClosed} and ${table.opensAt} is null and ${table.closesAt} is null)
          or (not ${table.isClosed} and ${table.opensAt} is not null and ${table.closesAt} is not null and ${table.opensAt} < ${table.closesAt})`,
    ),
  ],
);
