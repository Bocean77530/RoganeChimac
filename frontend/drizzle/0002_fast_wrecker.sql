CREATE TABLE "menu_images" (
	"id" uuid PRIMARY KEY NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"content_type" varchar(32) NOT NULL,
	"data_base64" text NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_images_size_chk" CHECK ("menu_images"."byte_size" between 1 and 700000),
	CONSTRAINT "menu_images_content_type_chk" CHECK ("menu_images"."content_type" in ('image/jpeg', 'image/png', 'image/webp'))
);
--> statement-breakpoint
ALTER TABLE "menu_images" ADD CONSTRAINT "menu_images_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "menu_images_item_uidx" ON "menu_images" USING btree ("menu_item_id");