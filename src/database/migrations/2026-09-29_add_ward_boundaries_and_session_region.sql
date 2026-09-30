-- Ward boundaries + session region codes.
--
-- WHY THIS FILE IS STANDALONE
-- run-prod-migration.js returns journalEntries.concat(standalone), so every
-- journal entry runs before every standalone file. `wards` is created by journal
-- entry 0006 and `social_sessions` by standalone 2026-09-22; the work that
-- touches both must therefore be standalone too, sorted after both.
--
-- WHY NO FOREIGN KEY ON social_sessions.province_code / ward_code
-- This repo already stores locality codes as free text: `tournaments` embeds
-- them in a JSON payload with no FK, and `communities` lost its FK in 0037.
-- Adding one here would drag in a backfill of every pre-existing row that has
-- NULL in both columns. Both columns are nullable and `IF NOT EXISTS`, so
-- re-running the file is safe.
--
-- Idempotent: every statement is ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT
-- EXISTS, and PostGIS is already guaranteed by 2026-09-27 (statement 1).

CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint
ALTER TABLE "wards" ADD COLUMN IF NOT EXISTS "boundary" geography(MultiPolygon, 4326);--> statement-breakpoint
ALTER TABLE "wards" ADD COLUMN IF NOT EXISTS "center_lat" double precision;--> statement-breakpoint
ALTER TABLE "wards" ADD COLUMN IF NOT EXISTS "center_lng" double precision;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wards_boundary_gist_idx" ON "wards" USING gist ("boundary");--> statement-breakpoint
ALTER TABLE "social_sessions" ADD COLUMN IF NOT EXISTS "province_code" varchar(20);--> statement-breakpoint
ALTER TABLE "social_sessions" ADD COLUMN IF NOT EXISTS "ward_code" varchar(20);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_session_ward_code_idx" ON "social_sessions" ("ward_code");
