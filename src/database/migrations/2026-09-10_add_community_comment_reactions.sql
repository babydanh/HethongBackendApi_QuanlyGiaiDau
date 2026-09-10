CREATE TABLE IF NOT EXISTS "community_comment_reactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "comment_id" uuid NOT NULL REFERENCES "community_post_comments"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reaction_type" varchar(24) NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_community_comment_reactions_user"
  ON "community_comment_reactions" ("comment_id", "user_id");
CREATE INDEX IF NOT EXISTS "idx_community_comment_reactions_comment"
  ON "community_comment_reactions" ("comment_id", "created_at");
