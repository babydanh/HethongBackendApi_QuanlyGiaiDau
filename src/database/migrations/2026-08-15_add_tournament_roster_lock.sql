ALTER TABLE tournament_participants
  ADD COLUMN IF NOT EXISTS roster_locked_at TIMESTAMPTZ;
