-- Build these on production tables without blocking normal reads and writes.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_participants_division_status
  ON tournament_participants (tournament_division_id, team_status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_matches_tournament_updated_at
  ON matches (tournament_id, updated_at, id);
