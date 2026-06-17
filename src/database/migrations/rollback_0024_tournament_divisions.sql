-- Rollback: Phase 5 Stage 2 - Tournament Divisions Table Separation
-- CAUTION: This is a destructive rollback. Use only if migration failed or needs to be reverted.
-- BACKUP YOUR DATA BEFORE EXECUTING THIS SCRIPT

-- 1. Drop payments division_id column (no data loss, just nullable column)
ALTER TABLE "payments" DROP COLUMN IF EXISTS "division_id";--> statement-breakpoint

-- 2. Drop tournament_participants division_id column (no data loss, just nullable column)
ALTER TABLE "tournament_participants" DROP COLUMN IF EXISTS "tournament_division_id";--> statement-breakpoint

-- 3. Drop tournament_stages division_id column (no data loss, just nullable column)
ALTER TABLE "tournament_stages" DROP COLUMN IF EXISTS "tournament_division_id";--> statement-breakpoint

-- 4. Drop indexes on tournament_divisions
DROP INDEX IF EXISTS "idx_tournament_divisions_created_at";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_tournament_divisions_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_tournament_divisions_match_type";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_tournament_divisions_tournament_id";--> statement-breakpoint

-- 5. Drop tournament_divisions table
DROP TABLE IF EXISTS "tournament_divisions" CASCADE;--> statement-breakpoint
