-- The production runner applies journal entries before standalone migrations.
-- This protects fresh installs where the hand-authored base table has not run yet.
ALTER TABLE IF EXISTS "club_standalone_matches" ADD COLUMN IF NOT EXISTS "playback_url" text;--> statement-breakpoint
ALTER TABLE IF EXISTS "club_standalone_matches" ADD COLUMN IF NOT EXISTS "camera_name" varchar(255);