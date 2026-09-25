-- Existing UUID links remain valid. Each session also receives a short share code.
ALTER TABLE social_sessions ADD COLUMN IF NOT EXISTS short_code VARCHAR(16);

UPDATE social_sessions
SET short_code = substring(replace(gen_random_uuid()::text, '-', '') from 1 for 16)
WHERE short_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS social_session_short_code_idx
  ON social_sessions (short_code);

ALTER TABLE social_sessions ALTER COLUMN short_code SET NOT NULL;
