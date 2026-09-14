-- Per-division entry fee override.
-- NULL means inherit the tournament fee; 0 is a deliberate free override.
ALTER TABLE "tournament_divisions"
  ADD COLUMN IF NOT EXISTS "entry_fee_override_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

-- Legacy division rows stored the tournament/default fee in entry_fee. Keep
-- positive legacy values as explicit overrides and convert legacy zero values
-- to the new inherit representation.
UPDATE "tournament_divisions"
SET
  "entry_fee_override_enabled" = CASE
    WHEN "entry_fee" IS NULL OR "entry_fee" = 0 THEN false
    ELSE true
  END,
  "entry_fee" = CASE
    WHEN "entry_fee" IS NULL OR "entry_fee" = 0 THEN NULL
    ELSE "entry_fee"
  END;
--> statement-breakpoint

ALTER TABLE "tournament_divisions"
  ALTER COLUMN "entry_fee" DROP DEFAULT;
--> statement-breakpoint

ALTER TABLE "tournament_divisions"
  ALTER COLUMN "entry_fee" DROP NOT NULL;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'entry_fee_override_consistent'
      AND conrelid = 'tournament_divisions'::regclass
  ) THEN
    ALTER TABLE "tournament_divisions"
      ADD CONSTRAINT "entry_fee_override_consistent"
      CHECK (
        ("entry_fee_override_enabled" = false AND "entry_fee" IS NULL)
        OR
        ("entry_fee_override_enabled" = true AND "entry_fee" IS NOT NULL AND "entry_fee" >= 0)
      );
  END IF;
END $$;
