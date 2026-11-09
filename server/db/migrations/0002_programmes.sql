CREATE TABLE "programmes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer,
	"session_id" uuid,
	"content" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "programmes_owner" CHECK (("programmes"."year" is null) <> ("programmes"."session_id" is null))
);
--> statement-breakpoint
ALTER TABLE "programmes" ADD CONSTRAINT "programmes_session_id_camp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."camp_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programmes" ADD CONSTRAINT "programmes_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "programmes_year_key" ON "programmes" USING btree ("year");--> statement-breakpoint
CREATE UNIQUE INDEX "programmes_session_key" ON "programmes" USING btree ("session_id");