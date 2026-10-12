-- Account-link confirmation for tournament roster rows (Gmail consent).
-- Existing rows get the epoch: they predate this gate, so their history stays visible.
-- New rows default to now(). The app writes NULL where an organizer or captain assigned
-- another person's account. Confirmation counts only matches completed at or after it
-- (no backfill), the same rule ELO already uses. Scheduling, pairing and brackets do not read this column.
-- Idempotent: ADD COLUMN IF NOT EXISTS; SET DEFAULT does not touch existing rows.
-- Rollback (only after accepting the loss of confirmation marks):
--   ALTER TABLE public.tournament_rosters DROP COLUMN account_link_confirmed_at;
ALTER TABLE public.tournament_rosters
  ADD COLUMN IF NOT EXISTS account_link_confirmed_at timestamp with time zone DEFAULT '1970-01-01T00:00:00Z';
ALTER TABLE public.tournament_rosters
  ALTER COLUMN account_link_confirmed_at SET DEFAULT now();
