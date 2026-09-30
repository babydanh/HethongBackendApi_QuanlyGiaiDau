-- PostGIS geolocation repair — all three columns in one standalone migration.
--
-- WHY THIS FILE IS STANDALONE (2026-*) AND NOT A JOURNAL ENTRY
-- run-prod-migration.js:198 returns journalEntries.concat(standalone), so EVERY
-- journal entry runs BEFORE EVERY standalone file, regardless of filename order.
-- A journal entry therefore cannot depend on a table a standalone file creates,
-- nor on an ordering it wants to control. Putting this work in a standalone file
-- makes it run after 0000 (which creates communities / tournament_venues) and
-- after 2026-09-22 (which creates social_sessions). Sorting by date puts it last.
--
-- WHY 0038 HAD TO BE EMPTIED
-- The previous home of the social_sessions statements was journal entry
-- "0038_social-session-geolocation", which ran before 2026-09-22 created the
-- table, so CI died with 42P01 on every fresh database. It is now a no-op; its
-- journal entry and meta/0038_snapshot.json are kept because that snapshot is
-- full-schema state, not a delta — it carries 13 tables no journal migration
-- creates (court_bookings, venue_pricing_rules, club_match_*, zalo_notification_outbox,
-- social_session_participants, ...). Deleting it would make the next
-- `drizzle-kit generate` re-emit all of them.
--
-- WHY TWO COLUMNS NEED A USING CLAUSE
-- 0000_living_lila_cheney.sql:111,137 create communities.location_geolocation and
-- tournament_venues.location_geolocation as "text" (note the odd quoting — the
-- file was hand-edited after drizzle generated it), while the Drizzle schema and
-- every snapshot declare geography(Point, 4326). Postgres has no assignment cast
-- from text to geography, so a bare ALTER COLUMN ... TYPE raises 42804 "cannot be
-- cast automatically". `USING x::geography` parses EWKT and passes NULL through
-- untouched, which is why it is data-safe here: every existing row is NULL.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS are
-- re-runnable, posting a column to the type it already has is a no-op, and the
-- runner replays a file from statement 1 after any mid-file failure.

CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint
ALTER TABLE "communities" ALTER COLUMN "location_geolocation" TYPE geography(Point, 4326) USING "location_geolocation"::geography;--> statement-breakpoint
ALTER TABLE "tournament_venues" ALTER COLUMN "location_geolocation" TYPE geography(Point, 4326) USING "location_geolocation"::geography;--> statement-breakpoint
ALTER TABLE "social_sessions" ADD COLUMN IF NOT EXISTS "latitude" double precision;--> statement-breakpoint
ALTER TABLE "social_sessions" ADD COLUMN IF NOT EXISTS "longitude" double precision;--> statement-breakpoint
ALTER TABLE "social_sessions" ADD COLUMN IF NOT EXISTS "venue_geolocation" geography(Point, 4326);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_session_geo_idx" ON "social_sessions" USING gist ("venue_geolocation");--> statement-breakpoint
COMMENT ON COLUMN "social_sessions"."venue_geolocation" IS 'Toa do san (PostGIS geography) do host ghim map - dung ST_Distance/ST_DWithin de loc gan nhat';
