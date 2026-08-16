-- Football is a team-vs-team sport in the current product model.
-- Older tournaments may have the FOOTBALL category but no roster-size keys
-- because the 5/7/11 selector was introduced later. Preserve explicit values
-- and backfill the safe legacy default (11 starters, no reserves).
UPDATE tournaments AS t
SET tournament_config = jsonb_set(
  jsonb_set(COALESCE(t.tournament_config, '{}'::jsonb), '{teamSize}', '11'::jsonb, true),
  '{minTeamSize}',
  '11'::jsonb,
  true
)
FROM categories AS c
WHERE t.category_id = c.id
  AND lower(c.slug) = 'football'
  AND NOT (COALESCE(t.tournament_config, '{}'::jsonb) ? 'teamSize')
  AND NOT (COALESCE(t.tournament_config, '{}'::jsonb) ? 'minTeamSize');
