-- Keep social-session score entry at the session level and standalone-match
-- score entry at the owning club level.
ALTER TABLE "club_match_sessions"
  ADD COLUMN IF NOT EXISTS "member_scoring_enabled" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE "community_social_settings"
  ADD COLUMN IF NOT EXISTS "member_match_scoring_enabled" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'community_social_settings'
      AND column_name = 'member_match_scoring_enabled'
  ) THEN
    UPDATE "club_match_sessions" AS session
    SET "member_scoring_enabled" = settings."member_match_scoring_enabled"
    FROM "community_social_settings" AS settings
    WHERE settings."community_id" = session."community_id";
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "club_standalone_matches"
  DROP COLUMN IF EXISTS "member_scoring_enabled";
