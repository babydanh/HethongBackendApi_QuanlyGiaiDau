ALTER TABLE "tournament_participants"
  ADD COLUMN IF NOT EXISTS "partner_user_id" uuid
  REFERENCES "users"("id") ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS "idx_participants_partner_user_id"
  ON "tournament_participants" ("partner_user_id");
