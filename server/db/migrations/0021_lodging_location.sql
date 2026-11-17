ALTER TABLE "lodgings" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "lodgings" ADD COLUMN "single_beds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lodgings" ADD COLUMN "double_beds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lodgings" ADD COLUMN "sofa_beds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lodgings" ADD COLUMN "accessible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lodgings" ADD CONSTRAINT "lodgings_bed_kinds" CHECK ("lodgings"."single_beds" >= 0 and "lodgings"."double_beds" >= 0 and "lodgings"."sofa_beds" >= 0);--> statement-breakpoint
-- The location of the lodgings already in the layout, from their zone or name when it names one of the
-- places, else the camp's own; the zone goes into the notes (within their 300 characters) so that nothing
-- is lost.
UPDATE "lodgings" SET
  "location" = CASE
    WHEN concat_ws(' ', "area", "name") ILIKE '%melina%' THEN 'melina'
    WHEN concat_ws(' ', "area", "name") ILIKE '%suennu%' THEN 'nu_suennu'
    WHEN concat_ws(' ', "area", "name") ILIKE '%torricella%' THEN 'torricella'
    ELSE 'invictus_camp'
  END,
  "description" = nullif(left(concat_ws(' · ', "area", "description"), 300), '');--> statement-breakpoint
ALTER TABLE "lodgings" ALTER COLUMN "location" SET NOT NULL;
