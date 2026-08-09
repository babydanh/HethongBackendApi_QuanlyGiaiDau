ALTER TABLE "tournament_groups"
ADD COLUMN IF NOT EXISTS "round_config" jsonb;
