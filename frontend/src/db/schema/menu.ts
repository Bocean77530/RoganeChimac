import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { discountTypeEnum } from "./enums";
import { restaurants } from "./restaurants";

export const menuCategories = pgTable(
  "menu_categories",
  {
    id: uuid("id").primaryKey(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 80 }).notNull(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
  },
  (table) => [
    uniqueIndex("menu_categories_restaurant_slug_uidx").on(table.restaurantId, table.slug),
    index("menu_categories_display_idx").on(table.restaurantId, table.active, table.sortOrder),
  ],
);

export const menuItems = pgTable(
  "menu_items",
  {
    id: uuid("id").primaryKey(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => menuCategories.id, { onDelete: "restrict" }),
    slug: varchar("slug", { length: 100 }).notNull(),
    name: text("name").notNull(),
    koreanName: text("korean_name"),
    description: text("description").notNull(),
    imageKey: text("image_key").notNull(),
    priceCents: integer("price_cents").notNull(),
    active: boolean("active").notNull().default(true),
    soldOut: boolean("sold_out").notNull().default(false),
    popular: boolean("popular").notNull().default(false),
    chefsPick: boolean("chefs_pick").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    revision: integer("revision").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("menu_items_restaurant_slug_uidx").on(table.restaurantId, table.slug),
    index("menu_items_category_display_idx").on(table.categoryId, table.active, table.sortOrder),
    check("menu_items_price_chk", sql`${table.priceCents} >= 0`),
    check("menu_items_revision_chk", sql`${table.revision} > 0`),
  ],
);

export const modifierGroups = pgTable(
  "modifier_groups",
  {
    id: uuid("id").primaryKey(),
    menuItemId: uuid("menu_item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 100 }).notNull(),
    name: text("name").notNull(),
    minSelect: smallint("min_select").notNull().default(0),
    maxSelect: smallint("max_select").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    uniqueIndex("modifier_groups_item_code_uidx").on(table.menuItemId, table.code),
    index("modifier_groups_display_idx").on(table.menuItemId, table.sortOrder),
    check(
      "modifier_groups_selection_chk",
      sql`${table.minSelect} >= 0 and ${table.maxSelect} >= ${table.minSelect} and ${table.maxSelect} <= 20`,
    ),
  ],
);

export const modifierOptions = pgTable(
  "modifier_options",
  {
    id: uuid("id").primaryKey(),
    modifierGroupId: uuid("modifier_group_id")
      .notNull()
      .references(() => modifierGroups.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 100 }).notNull(),
    name: text("name").notNull(),
    priceDeltaCents: integer("price_delta_cents").notNull().default(0),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    uniqueIndex("modifier_options_group_code_uidx").on(table.modifierGroupId, table.code),
    index("modifier_options_display_idx").on(table.modifierGroupId, table.active, table.sortOrder),
    check("modifier_options_delta_chk", sql`${table.priceDeltaCents} between -1000000 and 1000000`),
  ],
);

export const promotions = pgTable(
  "promotions",
  {
    id: uuid("id").primaryKey(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 64 }).notNull(),
    discountType: discountTypeEnum("discount_type").notNull(),
    value: integer("value").notNull(),
    minimumSubtotalCents: integer("minimum_subtotal_cents").notNull().default(0),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }),
    active: boolean("active").notNull().default(true),
    maxUses: integer("max_uses"),
    useCount: integer("use_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("promotions_restaurant_code_uidx").on(
      table.restaurantId,
      sql`lower(${table.code})`,
    ),
    index("promotions_active_idx").on(table.restaurantId, table.active),
    check("promotions_value_chk", sql`${table.value} > 0`),
    check(
      "promotions_percentage_chk",
      sql`${table.discountType} <> 'percent' or ${table.value} <= 100`,
    ),
    check("promotions_minimum_chk", sql`${table.minimumSubtotalCents} >= 0`),
    check("promotions_usage_chk", sql`${table.useCount} >= 0`),
    check(
      "promotions_window_chk",
      sql`${table.startsAt} is null or ${table.endsAt} is null or ${table.startsAt} < ${table.endsAt}`,
    ),
  ],
);
