ALTER TABLE "tournament_divisions"
  ADD COLUMN IF NOT EXISTS "is_config_override" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "venue_id" uuid REFERENCES "tournament_venues"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "bracket_type" varchar(50),
  ADD COLUMN IF NOT EXISTS "round_config" jsonb,
  ADD COLUMN IF NOT EXISTS "start_date" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "registration_end_date" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "min_elo" integer,
  ADD COLUMN IF NOT EXISTS "max_elo" integer,
  ADD COLUMN IF NOT EXISTS "prize_description" text;--> statement-breakpoint
