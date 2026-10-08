ALTER TYPE "public"."order_status" ADD VALUE 'submitted' BEFORE 'paid';--> statement-breakpoint
CREATE TABLE "restaurant_tables" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"code" varchar(40) NOT NULL,
	"label" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"token_version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "restaurant_tables_token_version_chk" CHECK ("restaurant_tables"."token_version" > 0),
	CONSTRAINT "restaurant_tables_code_chk" CHECK (length(trim("restaurant_tables"."code")) > 0),
	CONSTRAINT "restaurant_tables_label_chk" CHECK (length(trim("restaurant_tables"."label")) > 0)
);
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_fulfillment_chk";--> statement-breakpoint
ALTER TABLE "order_quotes" ALTER COLUMN "pickup_slot_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "pickup_slot_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "payment_due_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "order_quotes" ADD COLUMN "fulfillment_method" varchar(16) DEFAULT 'pickup' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_quotes" ADD COLUMN "payment_method" varchar(20) DEFAULT 'online' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_quotes" ADD COLUMN "table_id" uuid;--> statement-breakpoint
ALTER TABLE "order_quotes" ADD COLUMN "table_version" integer;--> statement-breakpoint
ALTER TABLE "order_quotes" ADD COLUMN "table_label" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "table_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "table_label" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_method" varchar(20) DEFAULT 'online' NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "dine_in_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurant_tables" ADD CONSTRAINT "restaurant_tables_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "restaurant_tables_restaurant_code_uidx" ON "restaurant_tables" USING btree ("restaurant_id","code");--> statement-breakpoint
CREATE INDEX "restaurant_tables_restaurant_active_idx" ON "restaurant_tables" USING btree ("restaurant_id","active");--> statement-breakpoint
ALTER TABLE "order_quotes" ADD CONSTRAINT "order_quotes_table_id_restaurant_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."restaurant_tables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_table_id_restaurant_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."restaurant_tables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_quotes" ADD CONSTRAINT "order_quotes_fulfillment_chk" CHECK (("order_quotes"."fulfillment_method" = 'pickup' and "order_quotes"."pickup_slot_id" is not null and "order_quotes"."table_id" is null and "order_quotes"."payment_method" = 'online') or
          ("order_quotes"."fulfillment_method" = 'dine_in' and "order_quotes"."pickup_slot_id" is null and "order_quotes"."table_id" is not null and "order_quotes"."table_version" is not null and "order_quotes"."table_version" > 0 and "order_quotes"."table_label" is not null and "order_quotes"."payment_method" = 'pay_at_counter'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_fulfillment_chk" CHECK (("orders"."fulfillment_method" = 'pickup' and "orders"."pickup_slot_id" is not null and "orders"."table_id" is null and "orders"."payment_method" = 'online' and "orders"."payment_due_at" is not null) or
          ("orders"."fulfillment_method" = 'dine_in' and "orders"."pickup_slot_id" is null and "orders"."table_id" is not null and "orders"."table_label" is not null and "orders"."payment_method" = 'pay_at_counter' and "orders"."payment_due_at" is null));
