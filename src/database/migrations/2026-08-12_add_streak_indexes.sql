-- P2C.6: Index chống N+1 khi tính streak (computeStreaks) và lọc member theo trạng thái.
-- CREATE INDEX CONCURRENTLY phải chạy NGOÀI transaction → file riêng, chạy qua run-prod-migration.js
-- (runner tách từng statement, mỗi statement là 1 implicit transaction riêng).
-- Rollback (chạy lần lượt, ngoài transaction):
--   DROP INDEX CONCURRENTLY IF EXISTS idx_community_members_community_status_user;
--   DROP INDEX CONCURRENTLY IF EXISTS idx_matches_status_completed_at;
--   DROP INDEX CONCURRENTLY IF EXISTS idx_match_players_user_match;
--   DROP INDEX CONCURRENTLY IF EXISTS idx_elo_history_logs_user_created_at;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_elo_history_logs_user_created_at
  ON "elo_history_logs" ("user_id", "created_at" DESC)
  INCLUDE ("changed_points", "match_id");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_match_players_user_match
  ON "match_players" ("user_id", "match_id");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_matches_status_completed_at
  ON "matches" ("status", "completed_at" DESC)
  WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_community_members_community_status_user
  ON "community_members" ("community_id", "status", "user_id");
