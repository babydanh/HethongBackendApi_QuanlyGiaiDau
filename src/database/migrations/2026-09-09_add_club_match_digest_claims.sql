CREATE TABLE IF NOT EXISTS "club_match_digest_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "club_match_sessions"("id") ON DELETE CASCADE,
  "match_id" uuid NOT NULL REFERENCES "club_match_session_matches"("id") ON DELETE CASCADE,
  "post_id" uuid REFERENCES "community_posts"("id") ON DELETE SET NULL,
  "published_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "club_match_digest_items_match_unique"
  ON "club_match_digest_items" ("match_id");
CREATE INDEX IF NOT EXISTS "club_match_digest_items_pending_session_idx"
  ON "club_match_digest_items" ("session_id", "published_at", "created_at", "id");
