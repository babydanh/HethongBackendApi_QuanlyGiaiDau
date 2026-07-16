ALTER TABLE "community_rankings"
  ADD COLUMN IF NOT EXISTS "match_type" varchar(50) DEFAULT 'SINGLES' NOT NULL,
  ADD COLUMN IF NOT EXISTS "gender_restriction" varchar(20);

ALTER TABLE "community_rankings"
  DROP CONSTRAINT IF EXISTS "community_user_category_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "community_rank_null_gender_idx"
  ON "community_rankings" ("community_id", "user_id", "category_id", "match_type")
  WHERE "gender_restriction" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "community_rank_with_gender_idx"
  ON "community_rankings" ("community_id", "user_id", "category_id", "match_type", "gender_restriction")
  WHERE "gender_restriction" IS NOT NULL;

ALTER TABLE "pair_ranks"
  ADD COLUMN IF NOT EXISTS "match_type" varchar(50) DEFAULT 'DOUBLES' NOT NULL,
  ADD COLUMN IF NOT EXISTS "gender_restriction" varchar(20),
  ADD COLUMN IF NOT EXISTS "scope" varchar(20) DEFAULT 'PUBLIC' NOT NULL,
  ADD COLUMN IF NOT EXISTS "community_id" uuid REFERENCES "communities"("id") ON DELETE CASCADE;

ALTER TABLE "pair_ranks"
  DROP CONSTRAINT IF EXISTS "user_pair_category_unique_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "user_pair_rank_context_idx"
  ON "pair_ranks" (
    "user1_id",
    "user2_id",
    "category_id",
    "match_type",
    "scope",
    COALESCE("gender_restriction", ''),
    COALESCE("community_id"::text, '')
  );
