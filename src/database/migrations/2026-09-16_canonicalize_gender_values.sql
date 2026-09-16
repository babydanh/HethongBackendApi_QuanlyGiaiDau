-- Canonicalize recognized legacy gender spellings without guessing unknown data.
-- The application keeps legacy-compatible reads so this migration is safe to roll out first.

UPDATE "profiles"
SET "gender" = CASE UPPER(BTRIM("gender"))
  WHEN 'MALE' THEN 'MALE'
  WHEN 'MEN' THEN 'MALE'
  WHEN 'NAM' THEN 'MALE'
  WHEN 'M' THEN 'MALE'
  WHEN 'FEMALE' THEN 'FEMALE'
  WHEN 'WOMEN' THEN 'FEMALE'
  WHEN 'NU' THEN 'FEMALE'
  WHEN 'NỮ' THEN 'FEMALE'
  WHEN 'F' THEN 'FEMALE'
  WHEN 'OTHER' THEN 'OTHER'
  WHEN 'OTHERS' THEN 'OTHER'
  WHEN 'KHAC' THEN 'OTHER'
  WHEN 'KHÁC' THEN 'OTHER'
  ELSE "gender"
END
WHERE "gender" IS NOT NULL;

UPDATE "tournaments"
SET "gender_restriction" = CASE UPPER(BTRIM("gender_restriction"))
  WHEN 'MALE' THEN 'MALE'
  WHEN 'MEN' THEN 'MALE'
  WHEN 'NAM' THEN 'MALE'
  WHEN 'M' THEN 'MALE'
  WHEN 'FEMALE' THEN 'FEMALE'
  WHEN 'WOMEN' THEN 'FEMALE'
  WHEN 'NU' THEN 'FEMALE'
  WHEN 'NỮ' THEN 'FEMALE'
  WHEN 'F' THEN 'FEMALE'
  WHEN 'MIXED' THEN 'MIXED'
  WHEN 'MIXED_DOUBLES' THEN 'MIXED'
  WHEN 'MIX' THEN 'MIXED'
  ELSE "gender_restriction"
END
WHERE "gender_restriction" IS NOT NULL;

UPDATE "tournament_divisions"
SET "gender_restriction" = CASE UPPER(BTRIM("gender_restriction"))
  WHEN 'MALE' THEN 'MALE'
  WHEN 'MEN' THEN 'MALE'
  WHEN 'NAM' THEN 'MALE'
  WHEN 'M' THEN 'MALE'
  WHEN 'FEMALE' THEN 'FEMALE'
  WHEN 'WOMEN' THEN 'FEMALE'
  WHEN 'NU' THEN 'FEMALE'
  WHEN 'NỮ' THEN 'FEMALE'
  WHEN 'F' THEN 'FEMALE'
  WHEN 'MIXED' THEN 'MIXED'
  WHEN 'MIXED_DOUBLES' THEN 'MIXED'
  WHEN 'MIX' THEN 'MIXED'
  ELSE "gender_restriction"
END
WHERE "gender_restriction" IS NOT NULL;

UPDATE "user_ranks"
SET "gender_restriction" = CASE UPPER(BTRIM("gender_restriction"))
  WHEN 'MALE' THEN 'MALE'
  WHEN 'MEN' THEN 'MALE'
  WHEN 'NAM' THEN 'MALE'
  WHEN 'M' THEN 'MALE'
  WHEN 'FEMALE' THEN 'FEMALE'
  WHEN 'WOMEN' THEN 'FEMALE'
  WHEN 'NU' THEN 'FEMALE'
  WHEN 'NỮ' THEN 'FEMALE'
  WHEN 'F' THEN 'FEMALE'
  WHEN 'MIXED' THEN 'MIXED'
  WHEN 'MIXED_DOUBLES' THEN 'MIXED'
  WHEN 'MIX' THEN 'MIXED'
  ELSE "gender_restriction"
END
WHERE "gender_restriction" IS NOT NULL;

UPDATE "pair_ranks"
SET "gender_restriction" = CASE UPPER(BTRIM("gender_restriction"))
  WHEN 'MALE' THEN 'MALE'
  WHEN 'MEN' THEN 'MALE'
  WHEN 'NAM' THEN 'MALE'
  WHEN 'M' THEN 'MALE'
  WHEN 'FEMALE' THEN 'FEMALE'
  WHEN 'WOMEN' THEN 'FEMALE'
  WHEN 'NU' THEN 'FEMALE'
  WHEN 'NỮ' THEN 'FEMALE'
  WHEN 'F' THEN 'FEMALE'
  WHEN 'MIXED' THEN 'MIXED'
  WHEN 'MIXED_DOUBLES' THEN 'MIXED'
  WHEN 'MIX' THEN 'MIXED'
  ELSE "gender_restriction"
END
WHERE "gender_restriction" IS NOT NULL;

UPDATE "community_rankings"
SET "gender_restriction" = CASE UPPER(BTRIM("gender_restriction"))
  WHEN 'MALE' THEN 'MALE'
  WHEN 'MEN' THEN 'MALE'
  WHEN 'NAM' THEN 'MALE'
  WHEN 'M' THEN 'MALE'
  WHEN 'FEMALE' THEN 'FEMALE'
  WHEN 'WOMEN' THEN 'FEMALE'
  WHEN 'NU' THEN 'FEMALE'
  WHEN 'NỮ' THEN 'FEMALE'
  WHEN 'F' THEN 'FEMALE'
  WHEN 'MIXED' THEN 'MIXED'
  WHEN 'MIXED_DOUBLES' THEN 'MIXED'
  WHEN 'MIX' THEN 'MIXED'
  ELSE "gender_restriction"
END
WHERE "gender_restriction" IS NOT NULL;

UPDATE "ranking_context_statuses"
SET "gender_restriction" = CASE UPPER(BTRIM("gender_restriction"))
  WHEN 'MALE' THEN 'MALE'
  WHEN 'MEN' THEN 'MALE'
  WHEN 'NAM' THEN 'MALE'
  WHEN 'M' THEN 'MALE'
  WHEN 'FEMALE' THEN 'FEMALE'
  WHEN 'WOMEN' THEN 'FEMALE'
  WHEN 'NU' THEN 'FEMALE'
  WHEN 'NỮ' THEN 'FEMALE'
  WHEN 'F' THEN 'FEMALE'
  WHEN 'MIXED' THEN 'MIXED'
  WHEN 'MIXED_DOUBLES' THEN 'MIXED'
  WHEN 'MIX' THEN 'MIXED'
  ELSE "gender_restriction"
END
WHERE "gender_restriction" IS NOT NULL;

UPDATE "admin_elo_operations"
SET "gender_restriction" = CASE UPPER(BTRIM("gender_restriction"))
  WHEN 'MALE' THEN 'MALE'
  WHEN 'MEN' THEN 'MALE'
  WHEN 'NAM' THEN 'MALE'
  WHEN 'M' THEN 'MALE'
  WHEN 'FEMALE' THEN 'FEMALE'
  WHEN 'WOMEN' THEN 'FEMALE'
  WHEN 'NU' THEN 'FEMALE'
  WHEN 'NỮ' THEN 'FEMALE'
  WHEN 'F' THEN 'FEMALE'
  WHEN 'MIXED' THEN 'MIXED'
  WHEN 'MIXED_DOUBLES' THEN 'MIXED'
  WHEN 'MIX' THEN 'MIXED'
  ELSE "gender_restriction"
END
WHERE "gender_restriction" IS NOT NULL;
