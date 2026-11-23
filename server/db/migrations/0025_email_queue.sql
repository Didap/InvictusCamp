ALTER TABLE "email_log" ADD COLUMN "text_body" text;--> statement-breakpoint
ALTER TABLE "email_log" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "email_log_sent_idx" ON "email_log" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "email_log_status_idx" ON "email_log" USING btree ("status","created_at");--> statement-breakpoint
UPDATE "email_log" SET "sent_at" = "created_at" WHERE "status" IN ('sent', 'simulated');
