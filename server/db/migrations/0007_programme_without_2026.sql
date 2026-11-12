-- Point 4 of the preview corrections: the programme no longer compares with 2026. Every saved week,
-- of a year or of a session, loses the "Novità" flag of its blocks and the internal notes the model
-- week had copied from Nicola's draft (only those exact sentences: notes written by hand stay). The
-- revision goes up, so an editor opened before the change cannot save the old week back.
UPDATE "programmes" SET "revision" = "revision" + 1, "content" = jsonb_set("content", '{days}', (
	SELECT coalesce(jsonb_agg(
		jsonb_set(day, '{blocks}', (
			SELECT coalesce(jsonb_agg(
				(block - 'isNew') || CASE WHEN block->>'staffNote' IN (
					'Nel 2026 la convocazione era alle 08:30.',
					'Nel 2026 le famiglie arrivavano dalle 17:00.',
					'Nel 2026 era giovedì pomeriggio.',
					'Nel 2026 qui c''era la grande sorpresa.',
					'Nel 2026 slide e saluti erano venerdì.',
					'Nel 2026 il camp chiudeva alle 15:00.'
				) THEN '{"staffNote": ""}'::jsonb ELSE '{}'::jsonb END
				ORDER BY block_index), '[]'::jsonb)
			FROM jsonb_array_elements(day->'blocks') WITH ORDINALITY AS b(block, block_index)
		))
		ORDER BY day_index), '[]'::jsonb)
	FROM jsonb_array_elements("content"->'days') WITH ORDINALITY AS d(day, day_index)
));
