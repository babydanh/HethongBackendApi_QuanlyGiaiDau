-- Standalone club matches are deliberately separate from social sessions and
-- tournaments. This keeps activity cards, scoring, and ELO rollback scoped to
-- the match's actual owner.
CREATE TABLE IF NOT EXISTS club_standalone_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  idempotency_key varchar(128),
  side_a_user_ids uuid[] NOT NULL,
  side_b_user_ids uuid[] NOT NULL,
  match_type varchar(24) NOT NULL CHECK (match_type IN ('SINGLES', 'DOUBLES', 'MIXED_DOUBLES')),
  is_ranked boolean NOT NULL DEFAULT true,
  status varchar(20) NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'ONGOING', 'COMPLETED', 'CANCELLED')),
  score_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  p1_sets_won integer NOT NULL DEFAULT 0 CHECK (p1_sets_won >= 0),
  p2_sets_won integer NOT NULL DEFAULT 0 CHECK (p2_sets_won >= 0),
  winner_side varchar(8) CHECK (winner_side IS NULL OR winner_side IN ('A', 'B')),
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  score_confirmed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  revision integer NOT NULL DEFAULT 1,
  elo_status varchar(24) NOT NULL DEFAULT 'WAITING_RESULT',
  elo_delta jsonb,
  elo_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS club_standalone_matches_community_status_idx
  ON club_standalone_matches (community_id, status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS club_standalone_matches_create_key_unique
  ON club_standalone_matches (created_by, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE match_elo_outbox
  ADD COLUMN IF NOT EXISTS standalone_match_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'match_elo_outbox_standalone_match_id_fkey'
  ) THEN
    ALTER TABLE match_elo_outbox
      ADD CONSTRAINT match_elo_outbox_standalone_match_id_fkey
      FOREIGN KEY (standalone_match_id) REFERENCES club_standalone_matches(id) ON DELETE RESTRICT;
  END IF;
END $$;

DROP INDEX IF EXISTS match_elo_outbox_club_session_match_id_unique;
CREATE UNIQUE INDEX IF NOT EXISTS match_elo_outbox_club_session_match_id_unique
  ON match_elo_outbox (club_match_session_match_id)
  WHERE club_match_session_match_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS match_elo_outbox_standalone_match_id_unique
  ON match_elo_outbox (standalone_match_id)
  WHERE standalone_match_id IS NOT NULL;

ALTER TABLE match_elo_outbox
  DROP CONSTRAINT IF EXISTS match_elo_outbox_exactly_one_context_check;
ALTER TABLE match_elo_outbox
  ADD CONSTRAINT match_elo_outbox_exactly_one_context_check
  CHECK (num_nonnulls(match_id, club_match_session_match_id, standalone_match_id) = 1);
