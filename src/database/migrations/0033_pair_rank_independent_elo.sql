ALTER TABLE "pair_ranks" ADD COLUMN IF NOT EXISTS "peak_elo" integer DEFAULT 1000 NOT NULL;
ALTER TABLE "pair_ranks" ADD COLUMN IF NOT EXISTS "last_active_at" timestamptz DEFAULT now() NOT NULL;

-- Pair ELO is independent from the members' individual ELO.
-- Repair pairs that were created but have never played a match.
UPDATE "pair_ranks"
SET "elo_points" = 1000,
    "peak_elo" = 1000
WHERE "matches_played" = 0
  AND ("elo_points" <> 1000 OR "peak_elo" <> 1000);
