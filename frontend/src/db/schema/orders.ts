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
import type { PricedLineSnapshot } from "@/domain/order";
import { orderStatusEnum, paymentStatusEnum } from "./enums";
import { promotions } from "./menu";
import { restaurants } from "./restaurants";
import { pickupSlots } from "./slots";

export const orderQuotes = pgTable(
  "order_quotes",
  {
    id: uuid("id").primaryKey(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    pickupSlotId: uuid("pickup_slot_id")
      .notNull()
      .references(() => pickupSlots.id, { onDelete: "restrict" }),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    linesSnapshot: jsonb("lines_snapshot").$type<PricedLineSnapshot[]>().notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("AUD"),
    subtotalCents: integer("subtotal_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    promotionId: uuid("promotion_id").references(() => promotions.id, {
      onDelete: "set null",
    }),
    promotionCode: varchar("promotion_code", { length: 64 }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("order_quotes_expiry_idx").on(table.expiresAt),
    index("order_quotes_restaurant_created_idx").on(table.restaurantId, table.createdAt),
    check("order_quotes_currency_chk", sql`${table.currency} = 'AUD'`),
    check("order_quotes_subtotal_chk", sql`${table.subtotalCents} >= 0`),
    check(
      "order_quotes_discount_chk",
      sql`${table.discountCents} >= 0 and ${table.discountCents} <= ${table.subtotalCents}`,
    ),
    check(
      "order_quotes_total_chk",
      sql`${table.totalCents} = ${table.subtotalCents} - ${table.discountCents}`,
    ),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "restrict" }),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => orderQuotes.id, { onDelete: "restrict" }),
    pickupSlotId: uuid("pickup_slot_id")
      .notNull()
      .references(() => pickupSlots.id, { onDelete: "restrict" }),
    orderNumber: varchar("order_number", { length: 40 }).notNull(),
    trackingTokenHash: varchar("tracking_token_hash", { length: 64 }).notNull(),
    fulfillmentMethod: varchar("fulfillment_method", { length: 16 }).notNull().default("pickup"),
    status: orderStatusEnum("status").notNull().default("pending_payment"),
    paymentStatus: paymentStatusEnum("payment_status").notNull().default("pending"),
    customerName: varchar("customer_name", { length: 100 }).notNull(),
    customerPhone: varchar("customer_phone", { length: 32 }).notNull(),
    customerEmail: varchar("customer_email", { length: 320 }).notNull(),
    customerNotes: text("customer_notes"),
    termsVersion: varchar("terms_version", { length: 64 }).notNull(),
    termsAcceptedAt: timestamp("terms_accepted_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("AUD"),
    subtotalCents: integer("subtotal_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    promotionCode: varchar("promotion_code", { length: 64 }),
    requestedFor: timestamp("requested_for", { withTimezone: true, mode: "date" }).notNull(),
    readyBy: timestamp("ready_by", { withTimezone: true, mode: "date" }),
    paymentDueAt: timestamp("payment_due_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    placedAt: timestamp("placed_at", { withTimezone: true, mode: "date" }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("orders_quote_uidx").on(table.quoteId),
    uniqueIndex("orders_restaurant_number_uidx").on(table.restaurantId, table.orderNumber),
    uniqueIndex("orders_tracking_hash_uidx").on(table.trackingTokenHash),
    index("orders_kitchen_queue_idx").on(table.restaurantId, table.status, table.requestedFor),
    index("orders_payment_expiry_idx").on(table.status, table.paymentDueAt),
    check("orders_fulfillment_chk", sql`${table.fulfillmentMethod} = 'pickup'`),
    check("orders_currency_chk", sql`${table.currency} = 'AUD'`),
    check("orders_subtotal_chk", sql`${table.subtotalCents} >= 0`),
    check(
      "orders_discount_chk",
      sql`${table.discountCents} >= 0 and ${table.discountCents} <= ${table.subtotalCents}`,
    ),
    check(
      "orders_total_chk",
      sql`${table.totalCents} = ${table.subtotalCents} - ${table.discountCents}`,
    ),
    check("orders_version_chk", sql`${table.version} > 0`),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    sourceMenuItemId: uuid("source_menu_item_id"),
    clientLineId: varchar("client_line_id", { length: 100 }).notNull(),
    menuItemSlug: varchar("menu_item_slug", { length: 100 }).notNull(),
    name: text("name").notNull(),
    koreanName: text("korean_name"),
    unitPriceCents: integer("unit_price_cents").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotalCents: integer("line_total_cents").notNull(),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [
    index("order_items_order_idx").on(table.orderId, table.sortOrder),
    check("order_items_unit_price_chk", sql`${table.unitPriceCents} >= 0`),
    check("order_items_quantity_chk", sql`${table.quantity} between 1 and 20`),
    check("order_items_total_chk", sql`${table.lineTotalCents} >= 0`),
  ],
);

export const orderItemModifiers = pgTable(
  "order_item_modifiers",
  {
    id: uuid("id").primaryKey(),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    sourceModifierGroupId: uuid("source_modifier_group_id"),
    sourceModifierOptionId: uuid("source_modifier_option_id"),
    groupCode: varchar("group_code", { length: 100 }).notNull(),
    groupName: text("group_name").notNull(),
    optionCode: varchar("option_code", { length: 100 }).notNull(),
    optionName: text("option_name").notNull(),
    priceDeltaCents: integer("price_delta_cents").notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [index("order_item_modifiers_item_idx").on(table.orderItemId, table.sortOrder)],
);
