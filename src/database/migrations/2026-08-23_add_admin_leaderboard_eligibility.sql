-- Migration: Add auditable one-time admin leaderboard eligibility without fabricating matches.
ALTER TABLE "user_ranks"
  ADD COLUMN IF NOT EXISTS "admin_leaderboard_eligible" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "community_rankings"
  ADD COLUMN IF NOT EXISTS "admin_leaderboard_eligible" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "admin_elo_operations"
  ADD COLUMN IF NOT EXISTS "previous_leaderboard_eligible" boolean;
--> statement-breakpoint
ALTER TABLE "admin_elo_operations"
  ADD COLUMN IF NOT EXISTS "new_leaderboard_eligible" boolean;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_ranks_admin_leaderboard_eligible_idx"
  ON "user_ranks" ("category_id", "match_type", "updated_at", "id")
  WHERE "admin_leaderboard_eligible" = true;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_rankings_admin_leaderboard_eligible_idx"
  ON "community_rankings" ("category_id", "community_id", "match_type", "updated_at", "id")
  WHERE "admin_leaderboard_eligible" = true;
