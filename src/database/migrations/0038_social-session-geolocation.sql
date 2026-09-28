-- Migration: vị trí sân cho Social sessions (host ghim map).
-- Chỉ chứa diff geo; file baseline do drizzle-kit sinh đã được thay thế để
-- runner production không tạo lại toàn bộ schema.
-- Runner (run-prod-migration.js) chịu được chạy lặp (IF NOT EXISTS).
ALTER TABLE "social_sessions" ADD COLUMN IF NOT EXISTS "latitude" double precision;--> statement-breakpoint
ALTER TABLE "social_sessions" ADD COLUMN IF NOT EXISTS "longitude" double precision;--> statement-breakpoint
ALTER TABLE "social_sessions" ADD COLUMN IF NOT EXISTS "venue_geolocation" geography(Point, 4326);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_session_geo_idx" ON "social_sessions" USING gist ("venue_geolocation");--> statement-breakpoint
COMMENT ON COLUMN "social_sessions"."venue_geolocation" IS 'Toa do san (PostGIS geography) do host ghim map - dung ST_Distance/ST_DWithin de loc gan nhat';
