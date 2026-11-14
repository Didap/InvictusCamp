ALTER TABLE "family_members" ADD COLUMN "useful_info" jsonb;--> statement-breakpoint
-- The disability details become choices: the free texts written before are kept in «Altro da sapere»
-- (notes), with their old labels, and the family picks the choices at the next edit.
UPDATE "family_members" SET "disability" = nullif(jsonb_strip_nulls(jsonb_build_object('notes', nullif(concat_ws(E'\n',
  'Diagnosi o descrizione: ' || ("disability"->>'description'),
  'Bisogni di supporto: ' || ("disability"->>'supportNeeds'),
  'Mobilità e ausili: ' || ("disability"->>'mobility'),
  'Comunicazione: ' || ("disability"->>'communication'),
  'Terapie, allergie e note mediche: ' || ("disability"->>'medicalNotes')), ''))), '{}'::jsonb)
WHERE "disability" IS NOT NULL AND NOT ("disability" ? 'conditions');
