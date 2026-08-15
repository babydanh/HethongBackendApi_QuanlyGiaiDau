ALTER TABLE tournament_participants
  ADD COLUMN IF NOT EXISTS football_team_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tournament_participants_football_team_id_fkey'
  ) THEN
    ALTER TABLE tournament_participants
      ADD CONSTRAINT tournament_participants_football_team_id_fkey
      FOREIGN KEY (football_team_id)
      REFERENCES football_teams(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tournament_participants_football_team
  ON tournament_participants (football_team_id, tournament_id);
