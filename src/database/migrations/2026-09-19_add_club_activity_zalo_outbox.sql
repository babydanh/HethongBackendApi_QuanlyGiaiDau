ALTER TABLE tournament_venues
  ADD COLUMN IF NOT EXISTS owner_user_id UUID;

ALTER TABLE tournament_venues
  ADD CONSTRAINT tournament_venues_owner_user_id_fkey
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL;

UPDATE tournament_venues v
SET owner_user_id = source.user_id
FROM (
  SELECT DISTINCT ON (record_id) record_id, user_id
  FROM audit_logs
  WHERE table_name = 'tournament_venues'
    AND action = 'CREATE'
    AND user_id IS NOT NULL
  ORDER BY record_id, created_at ASC
) source
WHERE v.id = source.record_id
  AND v.owner_user_id IS NULL;

ALTER TABLE club_match_sessions
  ADD COLUMN IF NOT EXISTS venue_id UUID;

ALTER TABLE club_match_sessions
  ADD COLUMN IF NOT EXISTS court_id UUID;

ALTER TABLE club_match_sessions
  ADD COLUMN IF NOT EXISTS fee_per_slot INTEGER;

ALTER TABLE club_match_sessions
  ADD CONSTRAINT club_match_sessions_venue_id_fkey
  FOREIGN KEY (venue_id) REFERENCES tournament_venues(id) ON DELETE SET NULL;

ALTER TABLE club_match_sessions
  ADD CONSTRAINT club_match_sessions_court_id_fkey
  FOREIGN KEY (court_id) REFERENCES venue_courts(id) ON DELETE SET NULL;

ALTER TABLE club_match_sessions
  ADD CONSTRAINT club_match_sessions_venue_court_check
  CHECK (court_id IS NULL OR venue_id IS NOT NULL);

ALTER TABLE club_match_sessions
  ADD CONSTRAINT club_match_sessions_fee_per_slot_check
  CHECK (fee_per_slot IS NULL OR fee_per_slot >= 0);

CREATE INDEX IF NOT EXISTS tournament_venues_owner_user_idx
  ON tournament_venues(owner_user_id);

CREATE INDEX IF NOT EXISTS club_match_sessions_venue_schedule_idx
  ON club_match_sessions(venue_id, start_at);

CREATE TABLE IF NOT EXISTS zalo_notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key VARCHAR(255) NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  recipient_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  aggregate_type VARCHAR(50) NOT NULL,
  aggregate_id UUID NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_expires_at TIMESTAMPTZ,
  provider_message_id VARCHAR(255),
  last_error_code VARCHAR(80),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT zalo_notification_outbox_status_check
    CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'BLOCKED')),
  CONSTRAINT zalo_notification_outbox_attempts_check
    CHECK (attempts >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS zalo_notification_outbox_dedupe_unique
  ON zalo_notification_outbox(dedupe_key);

CREATE INDEX IF NOT EXISTS zalo_notification_outbox_claim_idx
  ON zalo_notification_outbox(status, next_attempt_at, created_at);
