-- Prevent repeated identical community posts from reaching moderation/AI repeatedly.
-- The application applies the time window; this index keeps the lookup bounded.
ALTER TABLE "community_posts"
  ADD COLUMN IF NOT EXISTS "content_fingerprint" varchar(64);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_community_posts_content_fingerprint"
  ON "community_posts" ("community_id", "author_id", "content_fingerprint", "created_at");
