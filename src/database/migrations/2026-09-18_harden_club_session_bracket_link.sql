-- Harden the unified session link for databases that already applied the
-- initial mode-unification migration. A BRACKET session must never degrade
-- into a FREE session when its tournament is removed.
ALTER TABLE "club_match_sessions"
  ADD COLUMN IF NOT EXISTS "creation_idempotency_key" varchar(128),
  ADD COLUMN IF NOT EXISTS "creation_fingerprint" varchar(64);

DO $$ BEGIN
  ALTER TABLE "club_match_sessions"
    DROP CONSTRAINT IF EXISTS "club_match_sessions_bracket_tournament_id_fk";
  ALTER TABLE "club_match_sessions"
    ADD CONSTRAINT "club_match_sessions_bracket_tournament_id_fk"
    FOREIGN KEY ("bracket_tournament_id") REFERENCES "tournaments"("id")
    ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "club_match_sessions"
    ADD CONSTRAINT "club_match_sessions_pairing_tournament_consistency_check"
    CHECK (
      ("pairing_mode" = 'FREE' AND "bracket_tournament_id" IS NULL)
      OR ("pairing_mode" = 'BRACKET' AND "bracket_tournament_id" IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "club_match_sessions_creation_idempotency_unique"
  ON "club_match_sessions" ("created_by", "creation_idempotency_key")
  WHERE "creation_idempotency_key" IS NOT NULL;
