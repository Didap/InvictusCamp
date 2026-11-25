-- The application is now the account with its CV (docs/spec.md 3.4): the drafts of the old, longer form
-- that already have a CV and a confirmed address are sent, as a new candidate's would be.
UPDATE "staff_profiles" AS "p"
SET "status" = 'applied', "applied_at" = now()
FROM "users" AS "u"
WHERE "u"."id" = "p"."user_id"
  AND "p"."status" = 'registered'
  AND "p"."cv_file_id" IS NOT NULL
  AND "u"."email_verified_at" IS NOT NULL;
