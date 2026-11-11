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
-- concluded or cancelled, whose dates it covers in full. Back-to-back periods (allowed before, never
-- overlapping) are merged first, so two periods that together covered a session still count. Partial
-- coverage is dropped on purpose: the camp asks for the whole session.
INSERT INTO "session_availability" ("session_id", "user_id")
SELECT DISTINCT s."id", m."user_id"
FROM (
  SELECT "user_id", min("start_date") AS "start_date", max("end_date") AS "end_date"
  FROM (
    SELECT "user_id", "start_date", "end_date",
      sum("starts") OVER (PARTITION BY "user_id" ORDER BY "start_date") AS "island"
    FROM (
      SELECT "user_id", "start_date", "end_date",
        CASE WHEN "start_date" <= lag("end_date") OVER (PARTITION BY "user_id" ORDER BY "start_date") + 1
          THEN 0 ELSE 1 END AS "starts"
      FROM "staff_availability"
    ) p
  ) i
  GROUP BY "user_id", "island"
) m
JOIN "camp_sessions" s ON m."start_date" <= s."start_date" AND m."end_date" >= s."end_date"
WHERE s."status" NOT IN ('completed', 'cancelled')
ON CONFLICT DO NOTHING;
