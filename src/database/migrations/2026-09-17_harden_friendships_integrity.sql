-- Keep one active relationship per unordered user pair and preserve
-- cancelled/unfriended history without hard-deleting the relationship.
ALTER TABLE "friendships"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;

WITH ranked_active AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY LEAST("sender_id", "receiver_id"), GREATEST("sender_id", "receiver_id")
      ORDER BY
        CASE "status"
          WHEN 'ACCEPTED' THEN 0
          WHEN 'PENDING' THEN 1
          WHEN 'BLOCKED' THEN 2
          ELSE 3
        END,
        "updated_at" DESC,
        "created_at" DESC,
        "id" DESC
    ) AS "duplicate_rank"
  FROM "friendships"
  WHERE "deleted_at" IS NULL
)
UPDATE "friendships" AS friendship
SET
  "deleted_at" = now(),
  "updated_at" = now()
FROM ranked_active
WHERE friendship."id" = ranked_active."id"
  AND ranked_active."duplicate_rank" > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_friendships_active_unordered_pair"
  ON "friendships" (
    LEAST("sender_id", "receiver_id"),
    GREATEST("sender_id", "receiver_id")
  )
  WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "idx_friendships_active_sender_updated"
  ON "friendships" ("sender_id", "updated_at" DESC)
  WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "idx_friendships_active_receiver_updated"
  ON "friendships" ("receiver_id", "updated_at" DESC)
  WHERE "deleted_at" IS NULL;
