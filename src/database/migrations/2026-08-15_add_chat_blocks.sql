CREATE TABLE IF NOT EXISTS chat_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_blocks_no_self CHECK (blocker_id <> blocked_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_blocks_pair
  ON chat_blocks (blocker_id, blocked_id);

CREATE INDEX IF NOT EXISTS idx_chat_blocks_blocker
  ON chat_blocks (blocker_id, created_at DESC);
