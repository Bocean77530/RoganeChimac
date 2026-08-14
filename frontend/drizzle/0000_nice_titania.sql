CREATE TYPE "public"."discount_type" AS ENUM('percent', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."idempotency_state" AS ENUM('processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."integration_job_status" AS ENUM('queued', 'processing', 'retry_scheduled', 'succeeded', 'manual_action_required', 'dead_letter', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."integration_kind" AS ENUM('pos', 'kitchen_print');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending_payment', 'paid', 'accepted', 'preparing', 'ready', 'collected', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_event_outcome" AS ENUM('received', 'processed', 'ignored', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('unpaid', 'pending', 'paid', 'failed', 'partially_refunded', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."status_actor" AS ENUM('system', 'admin', 'payment', 'integration');--> statement-breakpoint
CREATE TABLE "business_hours" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"day_of_week" smallint NOT NULL,
	"opens_at" time NOT NULL,
	"closes_at" time NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "business_hours_day_chk" CHECK ("business_hours"."day_of_week" between 0 and 6),
	CONSTRAINT "business_hours_range_chk" CHECK ("business_hours"."opens_at" < "business_hours"."closes_at")
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"scope" varchar(80) NOT NULL,
	"key" varchar(128) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"state" "idempotency_state" DEFAULT 'processing' NOT NULL,
	"resource_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" "integration_kind" NOT NULL,
	"provider" varchar(64) NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"payload_version" integer DEFAULT 1 NOT NULL,
	"status" "integration_job_status" DEFAULT 'queued' NOT NULL,
	"payload" jsonb NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 6 NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"locked_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"locked_by" varchar(128),
	"external_id" varchar(255),
	"last_error_code" varchar(80),
	"last_error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "integration_jobs_attempt_chk" CHECK ("integration_jobs"."attempt_count" >= 0 and "integration_jobs"."attempt_count" <= "integration_jobs"."max_attempts"),
	CONSTRAINT "integration_jobs_max_attempts_chk" CHECK ("integration_jobs"."max_attempts" > 0),
	CONSTRAINT "integration_jobs_payload_version_chk" CHECK ("integration_jobs"."payload_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "menu_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" text NOT NULL,
	"korean_name" text,
	"description" text NOT NULL,
	"image_key" text NOT NULL,
	"price_cents" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sold_out" boolean DEFAULT false NOT NULL,
	"popular" boolean DEFAULT false NOT NULL,
	"chefs_pick" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_items_price_chk" CHECK ("menu_items"."price_cents" >= 0),
	CONSTRAINT "menu_items_revision_chk" CHECK ("menu_items"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "modifier_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"code" varchar(100) NOT NULL,
	"name" text NOT NULL,
	"min_select" smallint DEFAULT 0 NOT NULL,
	"max_select" smallint DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "modifier_groups_selection_chk" CHECK ("modifier_groups"."min_select" >= 0 and "modifier_groups"."max_select" >= "modifier_groups"."min_select" and "modifier_groups"."max_select" <= 20)
);
--> statement-breakpoint
CREATE TABLE "modifier_options" (
	"id" uuid PRIMARY KEY NOT NULL,
	"modifier_group_id" uuid NOT NULL,
	"code" varchar(100) NOT NULL,
	"name" text NOT NULL,
	"price_delta_cents" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "modifier_options_delta_chk" CHECK ("modifier_options"."price_delta_cents" between -1000000 and 1000000)
);
--> statement-breakpoint
CREATE TABLE "order_item_modifiers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_item_id" uuid NOT NULL,
	"source_modifier_group_id" uuid,
	"source_modifier_option_id" uuid,
	"group_code" varchar(100) NOT NULL,
	"group_name" text NOT NULL,
	"option_code" varchar(100) NOT NULL,
	"option_name" text NOT NULL,
	"price_delta_cents" integer NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"source_menu_item_id" uuid,
	"client_line_id" varchar(100) NOT NULL,
	"menu_item_slug" varchar(100) NOT NULL,
	"name" text NOT NULL,
	"korean_name" text,
	"unit_price_cents" integer NOT NULL,
	"quantity" integer NOT NULL,
	"line_total_cents" integer NOT NULL,
	"notes" text,
	"sort_order" integer NOT NULL,
	CONSTRAINT "order_items_unit_price_chk" CHECK ("order_items"."unit_price_cents" >= 0),
	CONSTRAINT "order_items_quantity_chk" CHECK ("order_items"."quantity" between 1 and 20),
	CONSTRAINT "order_items_total_chk" CHECK ("order_items"."line_total_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_quotes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"pickup_slot_id" uuid NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"lines_snapshot" jsonb NOT NULL,
	"currency" varchar(3) DEFAULT 'AUD' NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"promotion_id" uuid,
	"promotion_code" varchar(64),
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_quotes_currency_chk" CHECK ("order_quotes"."currency" = 'AUD'),
	CONSTRAINT "order_quotes_subtotal_chk" CHECK ("order_quotes"."subtotal_cents" >= 0),
	CONSTRAINT "order_quotes_discount_chk" CHECK ("order_quotes"."discount_cents" >= 0 and "order_quotes"."discount_cents" <= "order_quotes"."subtotal_cents"),
	CONSTRAINT "order_quotes_total_chk" CHECK ("order_quotes"."total_cents" = "order_quotes"."subtotal_cents" - "order_quotes"."discount_cents")
);
--> statement-breakpoint
CREATE TABLE "order_status_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" "order_status",
	"to_status" "order_status" NOT NULL,
	"actor_type" "status_actor" NOT NULL,
	"actor_reference" varchar(255),
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"pickup_slot_id" uuid NOT NULL,
	"order_number" varchar(40) NOT NULL,
	"tracking_token_hash" varchar(64) NOT NULL,
	"fulfillment_method" varchar(16) DEFAULT 'pickup' NOT NULL,
	"status" "order_status" DEFAULT 'pending_payment' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'pending' NOT NULL,
	"customer_name" varchar(100) NOT NULL,
	"customer_phone" varchar(32) NOT NULL,
	"customer_email" varchar(320) NOT NULL,
	"customer_notes" text,
	"terms_version" varchar(64) NOT NULL,
	"terms_accepted_at" timestamp with time zone NOT NULL,
	"currency" varchar(3) DEFAULT 'AUD' NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"promotion_code" varchar(64),
	"requested_for" timestamp with time zone NOT NULL,
	"ready_by" timestamp with time zone,
	"payment_due_at" timestamp with time zone NOT NULL,
	"placed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_fulfillment_chk" CHECK ("orders"."fulfillment_method" = 'pickup'),
	CONSTRAINT "orders_currency_chk" CHECK ("orders"."currency" = 'AUD'),
	CONSTRAINT "orders_subtotal_chk" CHECK ("orders"."subtotal_cents" >= 0),
	CONSTRAINT "orders_discount_chk" CHECK ("orders"."discount_cents" >= 0 and "orders"."discount_cents" <= "orders"."subtotal_cents"),
	CONSTRAINT "orders_total_chk" CHECK ("orders"."total_cents" = "orders"."subtotal_cents" - "orders"."discount_cents"),
	CONSTRAINT "orders_version_chk" CHECK ("orders"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_provider_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider" varchar(64) NOT NULL,
	"provider_event_id" varchar(255) NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"event_created_at" timestamp with time zone NOT NULL,
	"livemode" boolean NOT NULL,
	"order_id" uuid,
	"payment_id" uuid,
	"payload_hash" varchar(64) NOT NULL,
	"outcome" "payment_event_outcome" DEFAULT 'received' NOT NULL,
	"error_code" varchar(80),
	"error_message" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payment_refunds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"payment_id" uuid NOT NULL,
	"provider" varchar(64) NOT NULL,
	"provider_refund_id" varchar(255) NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'AUD' NOT NULL,
	"status" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_refunds_amount_chk" CHECK ("payment_refunds"."amount_cents" > 0),
	CONSTRAINT "payment_refunds_currency_chk" CHECK ("payment_refunds"."currency" = 'AUD'),
	CONSTRAINT "payment_refunds_status_chk" CHECK ("payment_refunds"."status" in ('succeeded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"provider" varchar(64) NOT NULL,
	"provider_session_id" varchar(255),
	"provider_payment_intent_id" varchar(255),
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"amount_cents" integer NOT NULL,
	"refunded_amount_cents" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'AUD' NOT NULL,
	"livemode" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_attempt_chk" CHECK ("payments"."attempt_number" > 0),
	CONSTRAINT "payments_amount_chk" CHECK ("payments"."amount_cents" >= 0),
	CONSTRAINT "payments_refunded_amount_chk" CHECK ("payments"."refunded_amount_cents" >= 0 and "payments"."refunded_amount_cents" <= "payments"."amount_cents"),
	CONSTRAINT "payments_currency_chk" CHECK ("payments"."currency" = 'AUD')
);
--> statement-breakpoint
CREATE TABLE "pickup_slots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"capacity" integer NOT NULL,
	"reserved_count" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pickup_slots_time_chk" CHECK ("pickup_slots"."starts_at" < "pickup_slots"."ends_at"),
	CONSTRAINT "pickup_slots_capacity_chk" CHECK ("pickup_slots"."capacity" > 0),
	CONSTRAINT "pickup_slots_reserved_chk" CHECK ("pickup_slots"."reserved_count" >= 0 and "pickup_slots"."reserved_count" <= "pickup_slots"."capacity")
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"discount_type" "discount_type" NOT NULL,
	"value" integer NOT NULL,
	"minimum_subtotal_cents" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"max_uses" integer,
	"use_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotions_value_chk" CHECK ("promotions"."value" > 0),
	CONSTRAINT "promotions_percentage_chk" CHECK ("promotions"."discount_type" <> 'percent' or "promotions"."value" <= 100),
	CONSTRAINT "promotions_minimum_chk" CHECK ("promotions"."minimum_subtotal_cents" >= 0),
	CONSTRAINT "promotions_usage_chk" CHECK ("promotions"."use_count" >= 0),
	CONSTRAINT "promotions_window_chk" CHECK ("promotions"."starts_at" is null or "promotions"."ends_at" is null or "promotions"."starts_at" < "promotions"."ends_at")
);
--> statement-breakpoint
CREATE TABLE "restaurants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'Australia/Melbourne' NOT NULL,
	"currency" varchar(3) DEFAULT 'AUD' NOT NULL,
	"address_line_1" text NOT NULL,
	"suburb" text NOT NULL,
	"country" text DEFAULT 'Australia' NOT NULL,
	"phone" varchar(32) NOT NULL,
	"email" varchar(320) NOT NULL,
	"abn" varchar(20),
	"ordering_enabled" boolean DEFAULT true NOT NULL,
	"pickup_prep_minutes" smallint DEFAULT 20 NOT NULL,
	"pickup_slot_interval_minutes" smallint DEFAULT 15 NOT NULL,
	"pickup_booking_days" smallint DEFAULT 7 NOT NULL,
	"pickup_capacity_per_slot" smallint DEFAULT 8 NOT NULL,
	"pos_provider" varchar(64) DEFAULT 'mock' NOT NULL,
	"kitchen_print_provider" varchar(64) DEFAULT 'browser' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restaurants_currency_chk" CHECK ("restaurants"."currency" = 'AUD'),
	CONSTRAINT "restaurants_pickup_prep_chk" CHECK ("restaurants"."pickup_prep_minutes" between 0 and 240),
	CONSTRAINT "restaurants_slot_interval_chk" CHECK ("restaurants"."pickup_slot_interval_minutes" between 5 and 120),
	CONSTRAINT "restaurants_booking_days_chk" CHECK ("restaurants"."pickup_booking_days" between 1 and 31),
	CONSTRAINT "restaurants_slot_capacity_chk" CHECK ("restaurants"."pickup_capacity_per_slot" between 1 and 1000)
);
--> statement-breakpoint
CREATE TABLE "special_hours" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"service_date" date NOT NULL,
	"is_closed" boolean DEFAULT false NOT NULL,
	"opens_at" time,
	"closes_at" time,
	"reason" text,
	CONSTRAINT "special_hours_shape_chk" CHECK (("special_hours"."is_closed" and "special_hours"."opens_at" is null and "special_hours"."closes_at" is null)
          or (not "special_hours"."is_closed" and "special_hours"."opens_at" is not null and "special_hours"."closes_at" is not null and "special_hours"."opens_at" < "special_hours"."closes_at"))
);
--> statement-breakpoint
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_jobs" ADD CONSTRAINT "integration_jobs_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_jobs" ADD CONSTRAINT "integration_jobs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_menu_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."menu_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier_options" ADD CONSTRAINT "modifier_options_modifier_group_id_modifier_groups_id_fk" FOREIGN KEY ("modifier_group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_modifiers" ADD CONSTRAINT "order_item_modifiers_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_quotes" ADD CONSTRAINT "order_quotes_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_quotes" ADD CONSTRAINT "order_quotes_pickup_slot_id_pickup_slots_id_fk" FOREIGN KEY ("pickup_slot_id") REFERENCES "public"."pickup_slots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_quotes" ADD CONSTRAINT "order_quotes_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_quote_id_order_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."order_quotes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_pickup_slot_id_pickup_slots_id_fk" FOREIGN KEY ("pickup_slot_id") REFERENCES "public"."pickup_slots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_provider_events" ADD CONSTRAINT "payment_provider_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_provider_events" ADD CONSTRAINT "payment_provider_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_slots" ADD CONSTRAINT "pickup_slots_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_hours" ADD CONSTRAINT "special_hours_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "business_hours_period_uidx" ON "business_hours" USING btree ("restaurant_id","day_of_week","opens_at");--> statement-breakpoint
CREATE INDEX "business_hours_lookup_idx" ON "business_hours" USING btree ("restaurant_id","day_of_week");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_scope_key_uidx" ON "idempotency_keys" USING btree ("restaurant_id","scope","key");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expiry_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_jobs_idempotency_uidx" ON "integration_jobs" USING btree ("restaurant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "integration_jobs_claim_idx" ON "integration_jobs" USING btree ("status","next_attempt_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_categories_restaurant_slug_uidx" ON "menu_categories" USING btree ("restaurant_id","slug");--> statement-breakpoint
CREATE INDEX "menu_categories_display_idx" ON "menu_categories" USING btree ("restaurant_id","active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_items_restaurant_slug_uidx" ON "menu_items" USING btree ("restaurant_id","slug");--> statement-breakpoint
CREATE INDEX "menu_items_category_display_idx" ON "menu_items" USING btree ("category_id","active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "modifier_groups_item_code_uidx" ON "modifier_groups" USING btree ("menu_item_id","code");--> statement-breakpoint
CREATE INDEX "modifier_groups_display_idx" ON "modifier_groups" USING btree ("menu_item_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "modifier_options_group_code_uidx" ON "modifier_options" USING btree ("modifier_group_id","code");--> statement-breakpoint
CREATE INDEX "modifier_options_display_idx" ON "modifier_options" USING btree ("modifier_group_id","active","sort_order");--> statement-breakpoint
CREATE INDEX "order_item_modifiers_item_idx" ON "order_item_modifiers" USING btree ("order_item_id","sort_order");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id","sort_order");--> statement-breakpoint
CREATE INDEX "order_quotes_expiry_idx" ON "order_quotes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "order_quotes_restaurant_created_idx" ON "order_quotes" USING btree ("restaurant_id","created_at");--> statement-breakpoint
CREATE INDEX "order_status_events_order_idx" ON "order_status_events" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_quote_uidx" ON "orders" USING btree ("quote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_restaurant_number_uidx" ON "orders" USING btree ("restaurant_id","order_number");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_tracking_hash_uidx" ON "orders" USING btree ("tracking_token_hash");--> statement-breakpoint
CREATE INDEX "orders_kitchen_queue_idx" ON "orders" USING btree ("restaurant_id","status","requested_for");--> statement-breakpoint
CREATE INDEX "orders_payment_expiry_idx" ON "orders" USING btree ("status","payment_due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_provider_events_provider_event_uidx" ON "payment_provider_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "payment_provider_events_order_idx" ON "payment_provider_events" USING btree ("order_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_refunds_provider_refund_uidx" ON "payment_refunds" USING btree ("provider","provider_refund_id");--> statement-breakpoint
CREATE INDEX "payment_refunds_payment_idx" ON "payment_refunds" USING btree ("payment_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_order_attempt_uidx" ON "payments" USING btree ("order_id","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_session_uidx" ON "payments" USING btree ("provider","provider_session_id");--> statement-breakpoint
CREATE INDEX "payments_order_status_idx" ON "payments" USING btree ("order_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "pickup_slots_restaurant_start_uidx" ON "pickup_slots" USING btree ("restaurant_id","starts_at");--> statement-breakpoint
CREATE INDEX "pickup_slots_availability_idx" ON "pickup_slots" USING btree ("restaurant_id","enabled","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "promotions_restaurant_code_uidx" ON "promotions" USING btree ("restaurant_id",lower("code"));--> statement-breakpoint
CREATE INDEX "promotions_active_idx" ON "promotions" USING btree ("restaurant_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "restaurants_slug_uidx" ON "restaurants" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "special_hours_date_uidx" ON "special_hours" USING btree ("restaurant_id","service_date");