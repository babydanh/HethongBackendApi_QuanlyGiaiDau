-- Phase 3: Add gender_restriction to user_ranks for per-gender ELO tracking
-- Drop old constraint
ALTER TABLE "user_ranks" DROP CONSTRAINT IF EXISTS "user_category_rank_unique_idx";--> statement-breakpoint

-- Add gender_restriction column (nullable, default NULL for legacy records)
ALTER TABLE "user_ranks" ADD COLUMN "gender_restriction" varchar(20) DEFAULT NULL;--> statement-breakpoint

-- Create partial index for NULL gender_restriction (legacy records)
CREATE UNIQUE INDEX "user_category_rank_null_gender_idx"
  ON "user_ranks" ("user_id", "category_id", "match_type", "community_id")
  WHERE "gender_restriction" IS NULL;--> statement-breakpoint

-- Create partial index for non-NULL gender_restriction (new records)
CREATE UNIQUE INDEX "user_category_rank_with_gender_idx"
  ON "user_ranks" ("user_id", "category_id", "match_type", "gender_restriction", "community_id")
  WHERE "gender_restriction" IS NOT NULL;