ALTER TABLE "families" ADD COLUMN "release_document_id" uuid;--> statement-breakpoint
ALTER TABLE "families" ADD COLUMN "release_digest" text;--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_release_document_id_documents_id_fk" FOREIGN KEY ("release_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;