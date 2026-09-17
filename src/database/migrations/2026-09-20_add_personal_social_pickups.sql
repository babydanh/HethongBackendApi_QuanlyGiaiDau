-- Personal pickup is a standalone public activity. community_id is nullable by design:
-- NULL = personal host, non-NULL = legacy/club-owned pickup.
CREATE TABLE IF NOT EXISTS social_pickup_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  play_date DATE NOT NULL,
  start_time VARCHAR(8) NOT NULL,
  end_time VARCHAR(8) NOT NULL,
  venue_id UUID REFERENCES tournament_venues(id) ON DELETE SET NULL,
  court_id UUID REFERENCES venue_courts(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES court_bookings(id) ON DELETE SET NULL,
  court_location VARCHAR(255) NOT NULL,
  fee_per_slot INTEGER NOT NULL DEFAULT 0,
  max_slots INTEGER NOT NULL DEFAULT 4,
  current_slots INTEGER NOT NULL DEFAULT 1,
  match_type VARCHAR(30) NOT NULL DEFAULT 'DOUBLES',
  level_requirement VARCHAR(50) NOT NULL DEFAULT 'ALL',
  gender_requirement VARCHAR(20) NOT NULL DEFAULT 'ANY',
  is_club_exclusive BOOLEAN NOT NULL DEFAULT false,
  is_ranked BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  creation_idempotency_key VARCHAR(128),
  creation_fingerprint VARCHAR(128),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE social_pickup_sessions
  ALTER COLUMN community_id DROP NOT NULL;

ALTER TABLE social_pickup_sessions
  ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES tournament_venues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS court_id UUID REFERENCES venue_courts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES court_bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS match_type VARCHAR(30) NOT NULL DEFAULT 'DOUBLES',
  ADD COLUMN IF NOT EXISTS level_requirement VARCHAR(50) NOT NULL DEFAULT 'ALL',
  ADD COLUMN IF NOT EXISTS gender_requirement VARCHAR(20) NOT NULL DEFAULT 'ANY',
  ADD COLUMN IF NOT EXISTS is_club_exclusive BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_ranked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE social_pickup_sessions
  ADD COLUMN IF NOT EXISTS creation_idempotency_key VARCHAR(128),
  ADD COLUMN IF NOT EXISTS creation_fingerprint VARCHAR(128);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'social_pickup_status_check'
  ) THEN
    ALTER TABLE social_pickup_sessions ADD CONSTRAINT social_pickup_status_check
      CHECK (status IN ('OPEN', 'FULL', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'social_pickup_capacity_check'
  ) THEN
    ALTER TABLE social_pickup_sessions ADD CONSTRAINT social_pickup_capacity_check
      CHECK (max_slots BETWEEN 2 AND 128 AND current_slots BETWEEN 1 AND max_slots);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'social_pickup_fee_check'
  ) THEN
    ALTER TABLE social_pickup_sessions ADD CONSTRAINT social_pickup_fee_check
      CHECK (fee_per_slot >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS social_pickup_date_idx
  ON social_pickup_sessions(play_date, status, category_id);
CREATE INDEX IF NOT EXISTS social_pickup_community_idx
  ON social_pickup_sessions(community_id, status);
CREATE INDEX IF NOT EXISTS social_pickup_host_idx
  ON social_pickup_sessions(host_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS social_pickup_creation_key_unique
  ON social_pickup_sessions(host_user_id, creation_idempotency_key)
  WHERE creation_idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS social_pickup_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pickup_id UUID NOT NULL REFERENCES social_pickup_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role VARCHAR(20) NOT NULL DEFAULT 'PLAYER',
  status VARCHAR(20) NOT NULL DEFAULT 'JOINED',
  payment_status VARCHAR(20) NOT NULL DEFAULT 'UNPAID',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS social_pickup_participants_unique_user
  ON social_pickup_participants(pickup_id, user_id);
CREATE INDEX IF NOT EXISTS social_pickup_participants_pickup_idx
  ON social_pickup_participants(pickup_id, status);
