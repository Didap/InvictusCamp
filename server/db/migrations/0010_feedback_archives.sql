CREATE TABLE "feedback_archives" (
	"year" integer PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"source" text,
	"imported_by" uuid,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedback_archives" ADD CONSTRAINT "feedback_archives_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;