CREATE TABLE "counter_payment_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"method" varchar(16) NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'AUD' NOT NULL,
	"operator_name" varchar(100) NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "counter_payment_records_method_chk" CHECK ("counter_payment_records"."method" in ('cash', 'card', 'other')),
	CONSTRAINT "counter_payment_records_amount_chk" CHECK ("counter_payment_records"."amount_cents" >= 0),
	CONSTRAINT "counter_payment_records_currency_chk" CHECK ("counter_payment_records"."currency" = 'AUD'),
	CONSTRAINT "counter_payment_records_operator_chk" CHECK (length(trim("counter_payment_records"."operator_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "table_code_rate_limits" (
	"key_hash" varchar(64) PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "table_code_rate_limits_count_chk" CHECK ("table_code_rate_limits"."attempt_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "order_quotes" DROP CONSTRAINT "order_quotes_fulfillment_chk";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_fulfillment_chk";--> statement-breakpoint
ALTER TABLE "counter_payment_records" ADD CONSTRAINT "counter_payment_records_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "counter_payment_records_order_uidx" ON "counter_payment_records" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "counter_payment_records_key_uidx" ON "counter_payment_records" USING btree ("idempotency_key");--> statement-breakpoint
ALTER TABLE "order_quotes" ADD CONSTRAINT "order_quotes_fulfillment_chk" CHECK (("order_quotes"."fulfillment_method" = 'pickup' and "order_quotes"."pickup_slot_id" is not null and "order_quotes"."table_id" is null and "order_quotes"."payment_method" = 'online') or
          ("order_quotes"."fulfillment_method" = 'dine_in' and "order_quotes"."pickup_slot_id" is null and "order_quotes"."table_id" is not null and "order_quotes"."table_version" is not null and "order_quotes"."table_version" > 0 and "order_quotes"."table_label" is not null and "order_quotes"."payment_method" in ('pay_at_counter', 'online')));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_fulfillment_chk" CHECK (("orders"."fulfillment_method" = 'pickup' and "orders"."pickup_slot_id" is not null and "orders"."table_id" is null and "orders"."payment_method" = 'online' and "orders"."payment_due_at" is not null) or
          ("orders"."fulfillment_method" = 'dine_in' and "orders"."pickup_slot_id" is null and "orders"."table_id" is not null and "orders"."table_label" is not null and
            (("orders"."payment_method" = 'pay_at_counter' and "orders"."payment_due_at" is null) or
             ("orders"."payment_method" = 'online' and "orders"."payment_due_at" is not null))));