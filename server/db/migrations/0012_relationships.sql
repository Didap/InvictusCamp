-- The relationship is now to the young person with a condition (the camp's guest): that person keeps none,
-- a child of the account holder without a condition becomes a sibling. "Figlio" is no longer an option.
UPDATE "family_members" SET "relationship" = NULL WHERE "relationship" = 'child' AND "kind" = 'young' AND "has_disability";--> statement-breakpoint
UPDATE "family_members" SET "relationship" = 'sibling' WHERE "relationship" = 'child';--> statement-breakpoint
-- The form now asks for the surname and stores «Famiglia Rossi»: names written without it get it.
UPDATE "families" SET "name" = 'Famiglia ' || "name" WHERE "name" !~* '^famiglia(\s|$)';
