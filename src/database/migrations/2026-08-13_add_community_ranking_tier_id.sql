-- Keep community ranking rows compatible with the repository's tier join.
-- Safe for existing production databases and rerunnable by the custom runner.
ALTER TABLE "community_rankings"
  ADD COLUMN IF NOT EXISTS "tier_id" uuid;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'community_rankings_tier_id_elo_tiers_id_fk'
  ) THEN
    ALTER TABLE "community_rankings"
      ADD CONSTRAINT "community_rankings_tier_id_elo_tiers_id_fk"
      FOREIGN KEY ("tier_id") REFERENCES "elo_tiers"("id") ON DELETE SET NULL;
  END IF;
END $$;
