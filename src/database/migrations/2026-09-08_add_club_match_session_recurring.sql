ALTER TABLE club_match_sessions
  ADD COLUMN IF NOT EXISTS session_config jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS club_match_sessions_session_config_gin_idx
  ON club_match_sessions USING gin (session_config jsonb_path_ops);
