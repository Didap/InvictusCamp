ALTER TABLE "family_members" ALTER COLUMN "first_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "family_members" ALTER COLUMN "last_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "family_members" ALTER COLUMN "relationship" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "families" ADD COLUMN "postal_code" text;--> statement-breakpoint
ALTER TABLE "families" ADD COLUMN "region" text;--> statement-breakpoint
ALTER TABLE "family_members" ADD COLUMN "kind" text DEFAULT 'adult' NOT NULL;--> statement-breakpoint
-- Members recorded before the kind existed: children and siblings are the young people of the family.
UPDATE "family_members" SET "kind" = 'young' WHERE "relationship" IN ('child', 'sibling');
--> statement-breakpoint
-- The sprint 1 questionnaire had other questions and no composition: those families confirm the new data.
UPDATE "families" SET "form_status" = 'draft', "form_submitted_at" = NULL WHERE "form_status" = 'submitted';
