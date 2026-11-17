CREATE TABLE "staff_roles" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'neutral' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_tags_color" CHECK ("staff_tags"."color" in ('neutral', 'info', 'success', 'warning', 'error', 'secondary'))
);
--> statement-breakpoint
-- The roles that were a fixed list keep their keys: profiles and convocations already hold them.
INSERT INTO "staff_roles" ("id", "name", "position") VALUES
	('coordinator', 'Coordinatore', 0),
	('group_lead', 'Responsabile di gruppo', 1),
	('activity_lead', 'Responsabile attività', 2),
	('other', 'Altro', 3);--> statement-breakpoint
UPDATE "session_staff" SET "role" = NULL WHERE "role" NOT IN (SELECT "id" FROM "staff_roles");--> statement-breakpoint
-- The examples of the «Valutazione» from the camp's notes (16/11/2026): the administration edits them.
INSERT INTO "staff_tags" ("name", "color", "position") VALUES
	('Staff tecnico', 'neutral', 0),
	('Leader', 'info', 1),
	('Animatore', 'neutral', 2),
	('Top', 'success', 3),
	('Energia moderata', 'neutral', 4),
	('Da guidare', 'warning', 5),
	('In training', 'secondary', 6);--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_roles_name_key" ON "staff_roles" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "staff_tags_name_key" ON "staff_tags" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "session_staff" ADD CONSTRAINT "session_staff_role_staff_roles_id_fk" FOREIGN KEY ("role") REFERENCES "public"."staff_roles"("id") ON DELETE set null ON UPDATE no action;