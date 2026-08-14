-- Add tournament_id and type columns to community_posts if not exists
ALTER TABLE "community_posts" ADD COLUMN IF NOT EXISTS "tournament_id" uuid REFERENCES "tournaments"("id") ON DELETE CASCADE;
ALTER TABLE "community_posts" ADD COLUMN IF NOT EXISTS "type" varchar(30) NOT NULL DEFAULT 'NORMAL';

CREATE INDEX IF NOT EXISTS "idx_community_posts_tournament" ON "community_posts" ("tournament_id");

-- Create community_polls
CREATE TABLE IF NOT EXISTS "community_polls" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "community_id" uuid NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "post_id" uuid REFERENCES "community_posts"("id") ON DELETE CASCADE,
  "creator_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "question" text NOT NULL,
  "allow_multiple_answers" boolean NOT NULL DEFAULT false,
  "allow_add_options" boolean NOT NULL DEFAULT true,
  "is_closed" boolean NOT NULL DEFAULT false,
  "expires_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_community_polls_post" ON "community_polls" ("post_id");
CREATE INDEX IF NOT EXISTS "idx_community_polls_community" ON "community_polls" ("community_id");

-- Create community_poll_options
CREATE TABLE IF NOT EXISTS "community_poll_options" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "poll_id" uuid NOT NULL REFERENCES "community_polls"("id") ON DELETE CASCADE,
  "creator_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "option_text" text NOT NULL,
  "vote_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_community_poll_options_poll" ON "community_poll_options" ("poll_id");

-- Create community_poll_votes
CREATE TABLE IF NOT EXISTS "community_poll_votes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "poll_id" uuid NOT NULL REFERENCES "community_polls"("id") ON DELETE CASCADE,
  "option_id" uuid NOT NULL REFERENCES "community_poll_options"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_community_poll_votes_user_option" ON "community_poll_votes" ("option_id", "user_id");
CREATE INDEX IF NOT EXISTS "idx_community_poll_votes_poll" ON "community_poll_votes" ("poll_id", "user_id");
