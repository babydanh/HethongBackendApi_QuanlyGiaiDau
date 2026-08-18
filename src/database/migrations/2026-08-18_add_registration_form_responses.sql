ALTER TABLE tournament_participants
  ADD COLUMN IF NOT EXISTS custom_responses jsonb;
