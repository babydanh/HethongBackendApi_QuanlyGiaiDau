CREATE TABLE IF NOT EXISTS facebook_page_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  page_id varchar(255) NOT NULL,
  page_name varchar(255) NOT NULL,
  encrypted_page_token text NOT NULL,
  connected_by uuid REFERENCES users(id) ON DELETE SET NULL,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  scopes text[] NOT NULL DEFAULT '{}'::text[],
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS facebook_page_connections_community_page_unique_idx
  ON facebook_page_connections (community_id, page_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_facebook_page_connections_community
  ON facebook_page_connections (community_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_facebook_page_connections_status
  ON facebook_page_connections (status);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS camera_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  code varchar(100),
  default_court_id uuid REFERENCES venue_courts(id) ON DELETE SET NULL,
  assigned_operator_id uuid REFERENCES users(id) ON DELETE SET NULL,
  pairing_token_hash varchar(255),
  pairing_token_expires_at timestamptz,
  device_fingerprint_hash varchar(255),
  status varchar(20) NOT NULL DEFAULT 'UNPAIRED',
  last_heartbeat_at timestamptz,
  paired_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_camera_devices_community
  ON camera_devices (community_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_camera_devices_status
  ON camera_devices (status);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  court_id uuid REFERENCES venue_courts(id) ON DELETE SET NULL,
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  camera_device_id uuid REFERENCES camera_devices(id) ON DELETE SET NULL,
  provider varchar(20) NOT NULL DEFAULT 'FACEBOOK',
  provider_session_id varchar(255),
  status varchar(20) NOT NULL DEFAULT 'CREATED',
  title varchar(255),
  description text,
  idempotency_key varchar(255),
  publish_config_expires_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  last_provider_check_at timestamptz,
  replay_url text,
  replay_provider varchar(20) NOT NULL DEFAULT 'NONE',
  youtube_video_id varchar(255),
  failure_code varchar(100),
  failure_message text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS live_sessions_provider_session_unique_idx
  ON live_sessions (provider, provider_session_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS live_sessions_idempotency_key_unique_idx
  ON live_sessions (idempotency_key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_live_sessions_tournament
  ON live_sessions (tournament_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_live_sessions_match
  ON live_sessions (match_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_live_sessions_status
  ON live_sessions (status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_live_sessions_provider_session
  ON live_sessions (provider_session_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_live_sessions_camera_device
  ON live_sessions (camera_device_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_live_sessions_court
  ON live_sessions (court_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS live_sessions_active_court_unique_idx
  ON live_sessions (court_id)
  WHERE status IN ('CREATED', 'STARTING', 'LIVE', 'RECONNECTING', 'STOPPING');
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS live_sessions_active_camera_unique_idx
  ON live_sessions (camera_device_id)
  WHERE status IN ('CREATED', 'STARTING', 'LIVE', 'RECONNECTING', 'STOPPING');
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS live_sessions_active_match_unique_idx
  ON live_sessions (match_id)
  WHERE status IN ('CREATED', 'STARTING', 'LIVE', 'RECONNECTING', 'STOPPING');
