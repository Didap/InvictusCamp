CREATE TABLE "session_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "team" text DEFAULT 'staff' NOT NULL;--> statement-breakpoint
ALTER TABLE "session_availability" ADD CONSTRAINT "session_availability_session_id_camp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."camp_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_availability" ADD CONSTRAINT "session_availability_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "session_availability_session_user_key" ON "session_availability" USING btree ("session_id","user_id");--> statement-breakpoint
CREATE INDEX "session_availability_user_idx" ON "session_availability" USING btree ("user_id");--> statement-breakpoint
-- Availability becomes one answer per session (November 2026): a period becomes the sessions, not
-- concluded or cancelled, whose dates it covers in full. Partial coverage is dropped on purpose: the
-- camp asks for the whole session.
INSERT INTO "session_availability" ("session_id", "user_id")
SELECT DISTINCT s."id", a."user_id"
FROM "staff_availability" a
JOIN "camp_sessions" s ON a."start_date" <= s."start_date" AND a."end_date" >= s."end_date"
WHERE s."status" NOT IN ('completed', 'cancelled')
ON CONFLICT DO NOTHING;
