CREATE TABLE "availability_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "availability_reset_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "availability_confirmations" ADD CONSTRAINT "availability_confirmations_session_id_camp_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."camp_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_confirmations" ADD CONSTRAINT "availability_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "availability_confirmations_session_user_key" ON "availability_confirmations" USING btree ("session_id","user_id");--> statement-breakpoint
CREATE INDEX "availability_confirmations_user_idx" ON "availability_confirmations" USING btree ("user_id");