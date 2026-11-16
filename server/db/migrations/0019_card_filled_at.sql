ALTER TABLE "family_members" ADD COLUMN "filled_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
-- Cards the family data form made and nobody filled in yet: the «-» can remove them.
UPDATE "family_members" SET "filled_at" = NULL WHERE "first_name" IS NULL;
