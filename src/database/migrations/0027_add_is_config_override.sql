ALTER TABLE "tournament_divisions"
ADD COLUMN IF NOT EXISTS "is_config_override" boolean NOT NULL DEFAULT false;
