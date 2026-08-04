-- Migration: Match integrity remediation (NOTE-1, NOTE-2, NOTE-7)
-- Date: 2026-08-04
-- Purpose:
--   1. Add matches.revision (integer, default 1) — monotonic ordering/optimistic lock.
--   2. Add UNIQUE (group_id, participant_id) on group_standings — prevents duplicate
--      standings rows under concurrent completions (NOTE-2).
--   3. Create match_elo_outbox — transactional outbox for ELO processing (NOTE-3).
--      Claim protocol: PENDING(retryable) | PROCESSING(lease) | PROCESSED(ok) | FAILED(terminal).
--      FK ON DELETE RESTRICT: keep business trail; hard-delete requires draining outbox first.

-- Step 1: matches.revision (additive, default 1 for existing rows — no backfill needed)
ALTER TABLE matches
ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;

-- Step 2: standings unique constraint
-- BẮT BUỘC chạy preflight trước (src/database/seeds/preflight-standings-duplicates.ts):
--   SELECT group_id, participant_id, COUNT(*) FROM group_standings
--   GROUP BY group_id, participant_id HAVING COUNT(*) > 1;
-- Chỉ chạy bước này khi preflight báo CLEAN. KHÔNG merge counters mù (double-count risk).
CREATE UNIQUE INDEX IF NOT EXISTS idx_standings_group_participant_unique
  ON group_standings (group_id, participant_id);

-- Step 3: ELO outbox (transactional outbox)
CREATE TABLE IF NOT EXISTS match_elo_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL UNIQUE REFERENCES matches(id) ON DELETE RESTRICT,
  -- State machine: PENDING(retryable) | PROCESSING(lease) | PROCESSED(terminal ok) | FAILED(terminal ko retry)
  status varchar(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','PROCESSING','PROCESSED','FAILED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),  -- backoff: chỉ PENDING được claim khi next_attempt_at <= now()
  locked_at timestamptz,                               -- lease: PROCESSING set; PENDING/PROCESSED/FAILED phải NULL
  locked_by text,                                      -- instance id (hostname + pid / pod name)
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

-- Claim index: status + next_attempt_at (backoff), plus partial lease index for stale reclaim
CREATE INDEX IF NOT EXISTS idx_elo_outbox_claim ON match_elo_outbox (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_elo_outbox_lease ON match_elo_outbox (locked_at)
  WHERE status = 'PROCESSING';

-- Rollback:
--   DROP INDEX idx_standings_group_participant_unique;
--   DROP TABLE match_elo_outbox;  -- chỉ sau khi drain hết PENDING/PROCESSING/FAILED
--   ALTER TABLE matches DROP COLUMN revision;
