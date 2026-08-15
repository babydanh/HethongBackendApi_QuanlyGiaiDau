ALTER TABLE tournament_participants
  ADD COLUMN IF NOT EXISTS football_team_logo_url VARCHAR(1000);
