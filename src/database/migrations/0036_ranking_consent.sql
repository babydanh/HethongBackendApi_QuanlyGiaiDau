ALTER TABLE "tournament_participants"
  ADD COLUMN IF NOT EXISTS "ranking_consent" boolean NOT NULL DEFAULT false;
