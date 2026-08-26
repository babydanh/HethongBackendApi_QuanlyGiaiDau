-- Existing 2026-08-17 migration introduced this field with DEFAULT true.
-- This new migration is intentionally separate so the production runner does not
-- skip the backfill as an already-applied migration.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS allow_stranger_messages boolean;

UPDATE profiles
SET allow_stranger_messages = false
WHERE allow_stranger_messages IS DISTINCT FROM false;

ALTER TABLE profiles
  ALTER COLUMN allow_stranger_messages SET DEFAULT false;

ALTER TABLE profiles
  ALTER COLUMN allow_stranger_messages SET NOT NULL;
