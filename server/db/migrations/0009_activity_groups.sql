ALTER TABLE "session_families" ADD COLUMN "activity_group" text;--> statement-breakpoint
ALTER TABLE "session_staff" ADD COLUMN "activity_group" text;--> statement-breakpoint
CREATE UNIQUE INDEX "session_staff_activity_group_key" ON "session_staff" USING btree ("session_id","activity_group");--> statement-breakpoint
ALTER TABLE "session_families" ADD CONSTRAINT "session_families_activity_group" CHECK ("session_families"."activity_group" is null or ("session_families"."kind" = 'slot' and "session_families"."status" in ('selected', 'invited', 'confirmed')));--> statement-breakpoint
ALTER TABLE "session_staff" ADD CONSTRAINT "session_staff_activity_group" CHECK ("session_staff"."activity_group" is null or "session_staff"."status" in ('draft', 'sent', 'accepted'));