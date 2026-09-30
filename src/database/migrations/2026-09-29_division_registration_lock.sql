ALTER TABLE "tournament_divisions"
  ADD COLUMN IF NOT EXISTS "is_registration_locked" boolean DEFAULT false NOT NULL;
