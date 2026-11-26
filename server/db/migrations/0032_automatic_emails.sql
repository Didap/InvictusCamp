CREATE TABLE "automatic_emails" (
	"key" text PRIMARY KEY NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"texts" jsonb,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automatic_emails" ADD CONSTRAINT "automatic_emails_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;