-- Additive Social Session extensions. Existing sessions, capacity and fee state are unchanged.
-- Apply to staging and validate migration results before any production deployment.

ALTER TABLE social_sessions
  ADD COLUMN IF NOT EXISTS venue_id UUID
    REFERENCES tournament_venues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS court_id UUID
    REFERENCES venue_courts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gender_requirement VARCHAR(20) NOT NULL DEFAULT 'ANY',
  ADD COLUMN IF NOT EXISTS creation_idempotency_key VARCHAR(128),
  ADD COLUMN IF NOT EXISTS creation_fingerprint VARCHAR(64);

ALTER TABLE social_session_participants
  ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ;

ALTER TABLE social_session_participants
  DROP CONSTRAINT IF EXISTS social_session_participants_status_check;

ALTER TABLE social_session_participants
  ADD CONSTRAINT social_session_participants_status_check
  CHECK (status IN ('JOINED', 'REQUESTED', 'REJECTED', 'CANCELLED', 'KICKED'));

ALTER TABLE social_session_participants
  DROP CONSTRAINT IF EXISTS social_session_request_user_check;
ALTER TABLE social_session_participants
  ADD CONSTRAINT social_session_request_user_check
  CHECK (status NOT IN ('REQUESTED', 'REJECTED') OR user_id IS NOT NULL);

ALTER TABLE social_sessions
  DROP CONSTRAINT IF EXISTS social_session_venue_court_check;
ALTER TABLE social_sessions
  ADD CONSTRAINT social_session_venue_court_check
  CHECK (court_id IS NULL OR venue_id IS NOT NULL);

ALTER TABLE social_sessions
  DROP CONSTRAINT IF EXISTS social_session_gender_requirement_check;
ALTER TABLE social_sessions
  ADD CONSTRAINT social_session_gender_requirement_check
  CHECK (gender_requirement IN ('ANY', 'MALE', 'FEMALE', 'MIXED'));

ALTER TABLE social_sessions
  DROP CONSTRAINT IF EXISTS social_session_create_idempotency_pair_check;
ALTER TABLE social_sessions
  ADD CONSTRAINT social_session_create_idempotency_pair_check
  CHECK ((creation_idempotency_key IS NULL) = (creation_fingerprint IS NULL));

CREATE UNIQUE INDEX IF NOT EXISTS social_session_create_idempotency_idx
  ON social_sessions(host_user_id, creation_idempotency_key)
  WHERE creation_idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS social_session_pending_requests_idx
  ON social_session_participants(session_id, status, requested_at);
