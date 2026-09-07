ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS club_match_session_id uuid
    REFERENCES club_match_sessions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_community_posts_club_match_session
  ON community_posts (club_match_session_id);
