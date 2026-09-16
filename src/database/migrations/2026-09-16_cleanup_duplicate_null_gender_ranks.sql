-- Migration: Clean up duplicate open / NULL gender_restriction user_ranks
-- For athletes who already have a concrete gender-specific rank (MALE / FEMALE),
-- the duplicate row with gender_restriction IS NULL is obsolete and causes duplicate cards in user profiles and leaderboards.

DO $$
BEGIN
  -- 1. Remove duplicate user_ranks with gender_restriction IS NULL where the user already has a gender rank
  DELETE FROM "user_ranks" ur_null
  WHERE ur_null."gender_restriction" IS NULL
    AND EXISTS (
      SELECT 1 FROM "user_ranks" ur_gender
      WHERE ur_gender."user_id" = ur_null."user_id"
        AND ur_gender."category_id" = ur_null."category_id"
        AND ur_gender."match_type" = ur_null."match_type"
        AND (ur_gender."community_id" = ur_null."community_id" OR (ur_gender."community_id" IS NULL AND ur_null."community_id" IS NULL))
        AND ur_gender."gender_restriction" IS NOT NULL
    );

  -- 2. Also remove any orphaned user_ranks with gender_restriction IS NULL for users whose profile has MALE or FEMALE
  DELETE FROM "user_ranks" ur
  WHERE ur."gender_restriction" IS NULL
    AND ur."match_type" = 'SINGLES'
    AND EXISTS (
      SELECT 1 FROM "profiles" p
      WHERE p."user_id" = ur."user_id"
        AND p."gender" IN ('MALE', 'FEMALE')
    );

  RAISE NOTICE 'Cleaned up duplicate NULL gender user_ranks successfully.';
END $$;
