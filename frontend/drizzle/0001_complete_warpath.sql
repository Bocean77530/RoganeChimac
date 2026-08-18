ALTER TABLE "restaurants" ALTER COLUMN "timezone" SET DEFAULT 'Australia/Sydney';--> statement-breakpoint
ALTER TABLE "restaurants" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "diet_tags" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "spice_level" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_spice_chk" CHECK ("menu_items"."spice_level" between 0 and 3);