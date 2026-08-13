-- A tournament may contain multiple divisions with the same sport format
-- (for example Men's Doubles - Low ELO and Men's Doubles - High ELO).
-- The human-readable division name and its ELO/settings define the variant;
-- match_type + gender_restriction alone must not make it unique.
ALTER TABLE tournament_divisions
  DROP CONSTRAINT IF EXISTS tournament_division_unique_idx;
