ALTER TABLE tournament_participants
  ADD COLUMN IF NOT EXISTS entry_fee_at_registration numeric(12,2);
--> statement-breakpoint
UPDATE tournament_participants
SET entry_fee_at_registration = COALESCE(division.entry_fee, tournament.entry_fee, 0.00)
FROM tournaments AS tournament
LEFT JOIN tournament_divisions AS division
  ON division.id = tournament_participants.tournament_division_id
WHERE tournament_participants.tournament_id = tournament.id
  AND tournament_participants.entry_fee_at_registration IS NULL;
--> statement-breakpoint
ALTER TABLE tournament_participants
  ALTER COLUMN entry_fee_at_registration SET DEFAULT 0.00;
--> statement-breakpoint
ALTER TABLE tournament_participants
  ALTER COLUMN entry_fee_at_registration SET NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'participant_entry_fee_at_registration_non_negative'
  ) THEN
    ALTER TABLE tournament_participants
      ADD CONSTRAINT participant_entry_fee_at_registration_non_negative
      CHECK (entry_fee_at_registration >= 0);
  END IF;
END $$;
