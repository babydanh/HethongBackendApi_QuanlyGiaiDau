-- Profile posts reuse the proven post/comment/reaction tables while keeping
-- club posts isolated by community_id. Run through run-prod-migration.js.
ALTER TABLE "community_posts"
  ALTER COLUMN "community_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "community_posts"
  ADD COLUMN IF NOT EXISTS "visibility" varchar(20) NOT NULL DEFAULT 'COMMUNITY';
--> statement-breakpoint
ALTER TABLE "community_posts"
  ADD COLUMN IF NOT EXISTS "shared_post_id" uuid;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'community_posts_shared_post_id_fk'
  ) THEN
    ALTER TABLE "community_posts"
      ADD CONSTRAINT "community_posts_shared_post_id_fk"
      FOREIGN KEY ("shared_post_id") REFERENCES "community_posts"("id") ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'community_posts_visibility_check'
  ) THEN
    ALTER TABLE "community_posts"
      ADD CONSTRAINT "community_posts_visibility_check"
      CHECK ("visibility" IN ('COMMUNITY', 'PUBLIC', 'FRIENDS', 'ONLY_ME'));
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_profile_posts_feed"
  ON "community_posts" ("author_id", "created_at", "id")
  WHERE "community_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_profile_posts_idempotency"
  ON "community_posts" ("author_id", "idempotency_key")
  WHERE "community_id" IS NULL AND "idempotency_key" IS NOT NULL;
