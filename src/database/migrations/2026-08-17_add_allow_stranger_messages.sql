-- Stranger direct messages are opt-in. Preserve existing explicit values.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS allow_stranger_messages boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ALTER COLUMN allow_stranger_messages SET DEFAULT false;
-- The original column was introduced with an automatic DEFAULT true, so existing
-- true rows are not provable explicit consent. Require a fresh opt-in.
UPDATE profiles SET allow_stranger_messages = false
WHERE allow_stranger_messages IS DISTINCT FROM false;
