-- Add immutable platform-fee rule snapshots to tournaments.
-- Existing rows receive the historical behavior: threshold 100000 VND,
-- fixed fee 5000 VND, and no platform fee for free registration is disabled.
ALTER TABLE "tournaments"
  ADD COLUMN IF NOT EXISTS "platform_fee_threshold" numeric(12, 2) DEFAULT '100000.00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "tournaments"
  ADD COLUMN IF NOT EXISTS "platform_fee_fixed_amount" numeric(12, 2) DEFAULT '5000.00' NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'platform_fee_threshold_valid'
      AND conrelid = 'tournaments'::regclass
  ) THEN
    ALTER TABLE "tournaments"
      ADD CONSTRAINT "platform_fee_threshold_valid"
      CHECK ("platform_fee_threshold" >= 0);
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'platform_fee_fixed_amount_valid'
      AND conrelid = 'tournaments'::regclass
  ) THEN
    ALTER TABLE "tournaments"
      ADD CONSTRAINT "platform_fee_fixed_amount_valid"
      CHECK ("platform_fee_fixed_amount" >= 0);
  END IF;
END $$;
