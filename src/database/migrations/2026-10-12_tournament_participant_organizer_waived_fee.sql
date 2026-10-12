-- Athletes added by the organizer pairs flow carry no registration fee.
-- Existing rows keep the default false: no backfill, is_paid is untouched.
-- Rollback (only when no row is true):
--   ALTER TABLE public.tournament_participants DROP COLUMN organizer_waived_fee;
ALTER TABLE public.tournament_participants
  ADD COLUMN IF NOT EXISTS organizer_waived_fee boolean NOT NULL DEFAULT false;
