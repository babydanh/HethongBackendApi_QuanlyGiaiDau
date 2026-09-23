-- Social Phase 2: chat theo kèo (chat_rooms.type='SOCIAL') + index phục vụ
-- auto-close hết giờ và list Social theo CLB (kể cả quá ngày).
-- Pattern giống 2026-09-22_add_social_sessions.sql (IF NOT EXISTS + DO $$).
-- Dùng để apply lên PRODUCTION qua client PostgreSQL của bạn.

-- 1. Link chat room -> social session (1 session tối đa 1 room SOCIAL).
-- Khớp schema drizzle: partial unique index WHERE type = 'SOCIAL'.
ALTER TABLE chat_rooms
  ADD COLUMN IF NOT EXISTS social_session_id UUID REFERENCES social_sessions(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_chat_rooms_social_session') THEN
    CREATE UNIQUE INDEX uq_chat_rooms_social_session
      ON chat_rooms(social_session_id) WHERE type = 'SOCIAL';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chat_rooms_social_session
  ON chat_rooms(social_session_id);

-- 2. Index phục vụ cron auto-close (status + start_at).
CREATE INDEX IF NOT EXISTS social_session_expiry_idx
  ON social_sessions(status, start_at);

-- 3. Index phục vụ list Social theo CLB (lịch sử mới -> cũ).
CREATE INDEX IF NOT EXISTS social_session_community_date_idx
  ON social_sessions(community_id, play_date DESC);
