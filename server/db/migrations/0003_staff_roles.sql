-- Staff roles become symbolic (November 2026): Responsabile di gruppo, Responsabile attività, Altro.
-- educator, oss, nurse -> group_lead; animator, physiotherapist, psychologist, speech_therapist, doctor -> activity_lead;
-- volunteer, other -> other.
UPDATE "session_staff" SET "role" = CASE
  WHEN "role" IN ('educator', 'oss', 'nurse') THEN 'group_lead'
  WHEN "role" IN ('animator', 'physiotherapist', 'psychologist', 'speech_therapist', 'doctor') THEN 'activity_lead'
  ELSE 'other' END
WHERE "role" IS NOT NULL AND "role" NOT IN ('group_lead', 'activity_lead', 'other');
--> statement-breakpoint
UPDATE "staff_profiles" SET "roles" = (
  SELECT coalesce(jsonb_agg(DISTINCT CASE
    WHEN r IN ('educator', 'oss', 'nurse', 'group_lead') THEN 'group_lead'
    WHEN r IN ('animator', 'physiotherapist', 'psychologist', 'speech_therapist', 'doctor', 'activity_lead') THEN 'activity_lead'
    ELSE 'other' END), '[]'::jsonb)
  FROM jsonb_array_elements_text("roles") AS r
)
WHERE "roles" <> '[]'::jsonb;
