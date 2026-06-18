-- Migration: Add gender_restriction to user_ranks
-- Date: 2026-06-17
-- Purpose: Separate ELO by gender (Đơn Nam ≠ Đơn Nữ)

-- Step 1: Add column (nullable, additive only)
ALTER TABLE user_ranks
ADD COLUMN IF NOT EXISTS gender_restriction VARCHAR(20) DEFAULT NULL;

-- Step 2: Drop old unique constraint
ALTER TABLE user_ranks
DROP CONSTRAINT IF EXISTS user_category_rank_unique_idx;

-- Step 3: Create partial indexes (PostgreSQL: NULL ≠ NULL handling)
-- Index 1: For legacy records (gender_restriction = NULL)
CREATE UNIQUE INDEX IF NOT EXISTS user_category_rank_null_gender_idx
  ON user_ranks (user_id, category_id, match_type, community_id)
  WHERE gender_restriction IS NULL;

-- Index 2: For new records (gender_restriction NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS user_category_rank_with_gender_idx
  ON user_ranks (user_id, category_id, match_type, gender_restriction, community_id)
  WHERE gender_restriction IS NOT NULL;
