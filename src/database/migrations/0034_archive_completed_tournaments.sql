ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "archived_at" timestamptz;
ALTER TABLE "elo_history_logs" ADD COLUMN IF NOT EXISTS "tournament_id" uuid;

UPDATE "elo_history_logs" AS h
SET "tournament_id" = m."tournament_id"
FROM "matches" AS m
WHERE h."match_id" = m."id"
  AND h."tournament_id" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'elo_history_logs_tournament_id_tournaments_id_fk'
  ) THEN
    ALTER TABLE "elo_history_logs"
      ADD CONSTRAINT "elo_history_logs_tournament_id_tournaments_id_fk"
      FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_elo_history_tournament_id"
  ON "elo_history_logs" ("tournament_id");
