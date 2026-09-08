-- Club match permissions default to member-friendly scoring/creation.
-- Higher-risk deletion remains manager-controlled by default.
ALTER TABLE "community_social_settings"
  ADD COLUMN IF NOT EXISTS "member_match_creation_enabled" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "member_match_scoring_enabled" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "member_match_deletion_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "match_scoring_presets" jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "club_standalone_matches"
  ADD COLUMN IF NOT EXISTS "score_config" jsonb;
--> statement-breakpoint
ALTER TABLE "club_match_session_matches"
  ADD COLUMN IF NOT EXISTS "score_config" jsonb;
