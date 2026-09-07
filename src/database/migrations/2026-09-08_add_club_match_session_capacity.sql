ALTER TABLE club_match_sessions
  ADD COLUMN IF NOT EXISTS max_participants integer NOT NULL DEFAULT 16;

DO $$
BEGIN
  ALTER TABLE club_match_sessions
    ADD CONSTRAINT club_match_sessions_max_participants_check
    CHECK (max_participants BETWEEN 2 AND 128);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
