-- Pair ELO is independent from the members' individual ELO.
-- Repair pairs that were created but have never played a match.
UPDATE "pair_ranks"
SET "elo_points" = 1000,
    "peak_elo" = 1000
WHERE "matches_played" = 0
  AND ("elo_points" <> 1000 OR "peak_elo" <> 1000);
