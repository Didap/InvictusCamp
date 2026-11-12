CREATE TABLE "lodgings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"area" text,
	"beds" integer NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lodgings_beds" CHECK ("lodgings"."beds" > 0)
);
--> statement-breakpoint
ALTER TABLE "session_families" ADD COLUMN "lodging_id" uuid;--> statement-breakpoint
ALTER TABLE "session_families" ADD CONSTRAINT "session_families_lodging_id_lodgings_id_fk" FOREIGN KEY ("lodging_id") REFERENCES "public"."lodgings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "session_families_lodging_session_key" ON "session_families" USING btree ("lodging_id","session_id");--> statement-breakpoint
ALTER TABLE "session_families" ADD CONSTRAINT "session_families_lodging" CHECK ("session_families"."lodging_id" is null or ("session_families"."kind" = 'slot' and "session_families"."status" in ('selected', 'invited', 'confirmed')));