ALTER TABLE "lodgings" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "lodgings" ADD COLUMN "single_beds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lodgings" ADD COLUMN "double_beds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lodgings" ADD COLUMN "sofa_beds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lodgings" ADD COLUMN "accessible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lodgings" ADD CONSTRAINT "lodgings_bed_kinds" CHECK ("lodgings"."single_beds" >= 0 and "lodgings"."double_beds" >= 0 and "lodgings"."sofa_beds" >= 0);--> statement-breakpoint
-- The lodgings already in the layout are the camp's own; the zone, which the location replaces, goes into
-- the notes so that nothing is lost.
UPDATE "lodgings" SET "location" = 'invictus_camp', "description" = nullif(concat_ws(' · ', "area", "description"), '');--> statement-breakpoint
ALTER TABLE "lodgings" ALTER COLUMN "location" SET NOT NULL;
