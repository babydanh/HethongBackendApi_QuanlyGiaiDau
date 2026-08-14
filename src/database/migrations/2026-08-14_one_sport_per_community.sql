-- A community has one primary sport. Keep the earliest link when old data
-- contains multiple categories, then enforce the invariant at the database level.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY community_id ORDER BY id) AS row_number
  FROM community_sports
)
DELETE FROM community_sports
WHERE id IN (SELECT id FROM ranked WHERE row_number > 1);

CREATE UNIQUE INDEX IF NOT EXISTS community_sports_community_id_unique
  ON community_sports (community_id);
