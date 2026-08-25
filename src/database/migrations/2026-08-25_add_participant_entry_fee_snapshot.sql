DO $$
BEGIN
  IF to_regclass('public.tournament_participants') IS NULL THEN
    RAISE EXCEPTION 'Required table public.tournament_participants does not exist';
  END IF;

  -- Older installations may have the participant table but not the division
  -- column because that schema change was previously applied outside the
  -- standalone migration history. Add the nullable column before the
  -- backfill; existing rows remain compatible and new registrations can use it.
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tournament_participants'
      AND column_name = 'tournament_division_id'
  ) THEN
    ALTER TABLE public.tournament_participants
      ADD COLUMN tournament_division_id uuid;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE public.tournament_participants
  ADD COLUMN IF NOT EXISTS entry_fee_at_registration numeric(12,2);
--> statement-breakpoint
UPDATE public.tournament_participants
SET entry_fee_at_registration = COALESCE(
  (
    SELECT payment.amount
    FROM public.payments AS payment
    WHERE payment.participant_id = tournament_participants.id
      AND payment.purpose = 'REGISTRATION_FEE'
      AND payment.status = 'COMPLETED'
    ORDER BY payment.paid_at DESC NULLS LAST, payment.created_at DESC, payment.id DESC
    LIMIT 1
  ),
  (
    SELECT payment.amount
    FROM public.payments AS payment
    WHERE payment.participant_id = tournament_participants.id
      AND payment.purpose = 'REGISTRATION_FEE'
      AND payment.status IN ('PENDING', 'PROCESSING')
    ORDER BY payment.created_at DESC, payment.id DESC
    LIMIT 1
  ),
  (
    SELECT division.entry_fee
    FROM public.tournament_divisions AS division
    WHERE division.id = tournament_participants.tournament_division_id
  ),
  (
    SELECT tournament.entry_fee
    FROM public.tournaments AS tournament
    WHERE tournament.id = tournament_participants.tournament_id
  ),
  0.00
)
WHERE tournament_participants.entry_fee_at_registration IS NULL;
--> statement-breakpoint
ALTER TABLE public.tournament_participants
  ALTER COLUMN entry_fee_at_registration SET DEFAULT 0.00;
--> statement-breakpoint
ALTER TABLE public.tournament_participants
  ALTER COLUMN entry_fee_at_registration SET NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'participant_entry_fee_at_registration_non_negative'
  ) THEN
    ALTER TABLE public.tournament_participants
      ADD CONSTRAINT participant_entry_fee_at_registration_non_negative
      CHECK (entry_fee_at_registration >= 0);
  END IF;
END $$;
