import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { orderStatusEnum, statusActorEnum } from "./enums";
import { orders } from "./orders";

export const orderStatusEvents = pgTable(
  "order_status_events",
  {
    id: uuid("id").primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fromStatus: orderStatusEnum("from_status"),
    toStatus: orderStatusEnum("to_status").notNull(),
    actorType: statusActorEnum("actor_type").notNull(),
    actorReference: varchar("actor_reference", { length: 255 }),
    reason: text("reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("order_status_events_order_idx").on(table.orderId, table.createdAt)],
);
