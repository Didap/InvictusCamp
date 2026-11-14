ALTER TABLE "documents" ADD COLUMN "family_id" uuid;--> statement-breakpoint
ALTER TABLE "families" ADD COLUMN "release_digest" text;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;