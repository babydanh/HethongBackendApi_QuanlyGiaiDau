-- Keep the fixed platform-role catalogue available in every environment.
-- These are application enums, not user-defined roles.
INSERT INTO "roles" ("name", "slug", "description")
VALUES
  ('ADMIN', 'admin', 'Administrator'),
  ('MODERATOR', 'moderator', 'System Moderator'),
  ('ORGANIZER', 'organizer', 'Tournament Organizer'),
  ('REFEREE', 'referee', 'Match Referee'),
  ('PLAYER', 'player', 'Player')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- PLAYER is the non-removable base role for every existing account.
INSERT INTO "user_to_roles" ("user_id", "role_id")
SELECT user_row."id", player_role."id"
FROM "users" AS user_row
JOIN "roles" AS player_role ON player_role."name" = 'PLAYER'
WHERE NOT EXISTS (
  SELECT 1
  FROM "user_to_roles" AS existing
  WHERE existing."user_id" = user_row."id"
    AND existing."role_id" = player_role."id"
)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Preserve the earliest assignment per user/role, then prevent duplicate
-- global-role rows permanently. Every statement is safe to rerun.
DELETE FROM "user_to_roles" AS duplicate
USING "user_to_roles" AS canonical
WHERE duplicate."user_id" = canonical."user_id"
  AND duplicate."role_id" = canonical."role_id"
  AND (
    duplicate."assigned_at" > canonical."assigned_at"
    OR (
      duplicate."assigned_at" = canonical."assigned_at"
      AND duplicate."id" > canonical."id"
    )
  );
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_to_roles_user_id_role_id_unique"
  ON "user_to_roles" ("user_id", "role_id");
