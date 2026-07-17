-- Migration 0029: Add ALL missing columns
-- These columns were either added via standalone scripts or were part of the initial
-- CREATE TABLE definition (so they exist in fresh DBs) but missing from existing DBs
-- that were created before these columns were added to the schema.
-- All statements use IF NOT EXISTS so this is safe to run multiple times.

-- ==========================================
-- 1. tournament_stages: deleted_at
-- ==========================================
ALTER TABLE "tournament_stages" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ;
--> statement-breakpoint

-- ==========================================
-- 2. tournament_groups: deleted_at
-- ==========================================
ALTER TABLE "tournament_groups" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ;
--> statement-breakpoint

-- ==========================================
-- 3. matches: columns added to schema but never via ALTER TABLE
-- ==========================================
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "tournament_id" UUID;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "stage_id" UUID;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "is_bye" BOOLEAN DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "court_name" TEXT;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "court_address" TEXT;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "match_config" JSONB DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "cheer_count" INTEGER DEFAULT 0 NOT NULL;
--> statement-breakpoint

-- ==========================================
-- 4. user_ranks: gender_restriction (was in standalone SQL file outside journal)
-- ==========================================
ALTER TABLE "user_ranks" ADD COLUMN IF NOT EXISTS "gender_restriction" VARCHAR(20) DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE "user_ranks" DROP CONSTRAINT IF EXISTS "user_category_rank_unique_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_category_rank_null_gender_idx"
  ON "user_ranks" ("user_id", "category_id", "match_type", "community_id")
  WHERE "gender_restriction" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_category_rank_with_gender_idx"
  ON "user_ranks" ("user_id", "category_id", "match_type", "gender_restriction", "community_id")
  WHERE "gender_restriction" IS NOT NULL;
