-- Unify club social sessions and Super Lite tournaments behind one session resource.
-- Existing FREE sessions remain unchanged; BRACKET sessions point to one Lite tournament.
ALTER TABLE "club_match_sessions"
  ADD COLUMN IF NOT EXISTS "bracket_tournament_id" uuid;

DO $$ BEGIN
  ALTER TABLE "club_match_sessions"
    DROP CONSTRAINT IF EXISTS "club_match_sessions_bracket_tournament_id_fk";
  ALTER TABLE "club_match_sessions"
    ADD CONSTRAINT "club_match_sessions_bracket_tournament_id_fk"
    FOREIGN KEY ("bracket_tournament_id") REFERENCES "tournaments"("id")
    ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "club_match_sessions_bracket_tournament_unique"
  ON "club_match_sessions" ("bracket_tournament_id");

ALTER TABLE "club_match_sessions"
  DROP CONSTRAINT IF EXISTS "club_match_sessions_pairing_mode_check";

ALTER TABLE "club_match_sessions"
  ADD CONSTRAINT "club_match_sessions_pairing_mode_check"
  CHECK ("pairing_mode" IN ('FREE', 'BRACKET'));

ALTER TABLE "club_match_sessions"
  ADD COLUMN IF NOT EXISTS "creation_idempotency_key" varchar(128),
  ADD COLUMN IF NOT EXISTS "creation_fingerprint" varchar(64);

ALTER TABLE "club_match_sessions"
  ADD CONSTRAINT "club_match_sessions_pairing_tournament_consistency_check"
  CHECK (
    ("pairing_mode" = 'FREE' AND "bracket_tournament_id" IS NULL)
    OR ("pairing_mode" = 'BRACKET' AND "bracket_tournament_id" IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS "club_match_sessions_creation_idempotency_unique"
  ON "club_match_sessions" ("created_by", "creation_idempotency_key")
  WHERE "creation_idempotency_key" IS NOT NULL;
