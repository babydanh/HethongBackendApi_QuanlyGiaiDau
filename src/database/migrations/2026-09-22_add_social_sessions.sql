-- Social Phase 1: social_sessions + social_session_participants.
-- Pattern giống 2026-09-20_add_personal_social_pickups.sql (IF NOT EXISTS + DO $$).
-- Dùng để apply lên PRODUCTION qua client PostgreSQL của bạn.
-- KHÔNG tạo file drop social_pickup cũ trong release này.

CREATE TABLE IF NOT EXISTS social_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
  host_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  title VARCHAR(100) NOT NULL,
  description TEXT,
  play_format VARCHAR(30) NOT NULL DEFAULT 'Giao lưu',
  play_date DATE NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 120,
  venue_name VARCHAR(255) NOT NULL,
  venue_address VARCHAR(500) NOT NULL,
  max_slots INTEGER NOT NULL DEFAULT 6,
  current_slots INTEGER NOT NULL DEFAULT 1,
  fee_per_slot INTEGER NOT NULL DEFAULT 0,
  level_requirement VARCHAR(50) NOT NULL DEFAULT 'ALL',
  visibility VARCHAR(20) NOT NULL DEFAULT 'PUBLIC',
  contact_phone VARCHAR(20),
  zalo_group_url TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS social_session_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES social_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role VARCHAR(20) NOT NULL DEFAULT 'PLAYER',
  status VARCHAR(20) NOT NULL DEFAULT 'JOINED',
  payment_status VARCHAR(20) NOT NULL DEFAULT 'UNPAID',
  ticket_count INTEGER NOT NULL DEFAULT 1,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_session_status_check') THEN
    ALTER TABLE social_sessions ADD CONSTRAINT social_session_status_check
      CHECK (status IN ('OPEN', 'FULL', 'COMPLETED', 'CANCELLED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_session_capacity_check') THEN
    ALTER TABLE social_sessions ADD CONSTRAINT social_session_capacity_check
      CHECK (max_slots BETWEEN 2 AND 64 AND current_slots BETWEEN 1 AND max_slots);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_session_fee_check') THEN
    ALTER TABLE social_sessions ADD CONSTRAINT social_session_fee_check
      CHECK (fee_per_slot >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_session_visibility_check') THEN
    ALTER TABLE social_sessions ADD CONSTRAINT social_session_visibility_check
      CHECK (visibility IN ('PUBLIC', 'CLUB_ONLY') AND (visibility <> 'CLUB_ONLY' OR community_id IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_session_participants_role_check') THEN
    ALTER TABLE social_session_participants ADD CONSTRAINT social_session_participants_role_check
      CHECK (role IN ('HOST', 'PLAYER'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_session_participants_status_check') THEN
    ALTER TABLE social_session_participants ADD CONSTRAINT social_session_participants_status_check
      CHECK (status IN ('JOINED', 'CANCELLED', 'KICKED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_session_participants_payment_check') THEN
    ALTER TABLE social_session_participants ADD CONSTRAINT social_session_participants_payment_check
      CHECK (payment_status IN ('UNPAID', 'PAID', 'PENDING'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_session_participants_ticket_check') THEN
    ALTER TABLE social_session_participants ADD CONSTRAINT social_session_participants_ticket_check
      CHECK (ticket_count >= 1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS social_session_date_idx
  ON social_sessions(play_date, status, category_id);
CREATE INDEX IF NOT EXISTS social_session_community_idx
  ON social_sessions(community_id, status);
CREATE INDEX IF NOT EXISTS social_session_host_idx
  ON social_sessions(host_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS social_session_participants_unique_user
  ON social_session_participants(session_id, user_id);
CREATE INDEX IF NOT EXISTS social_session_participants_session_idx
  ON social_session_participants(session_id, status);