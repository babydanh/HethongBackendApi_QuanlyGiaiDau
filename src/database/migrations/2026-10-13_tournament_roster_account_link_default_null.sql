-- Account-link confirmation: new roster rows start UNCONFIRMED (NULL).
-- Supersedes the SET DEFAULT now() from 2026-10-12_tournament_roster_account_link_confirmation.sql.
-- With the default, any insert that forgot to write NULL (self-registration, organizer or
-- captain assignment) was counted as confirmed. Only the user's own confirmation sets this now.
-- Existing rows are untouched (their epoch backfill stays).
-- Idempotent: DROP DEFAULT on a column without a default is a no-op.
-- Rollback: ALTER TABLE public.tournament_rosters ALTER COLUMN account_link_confirmed_at SET DEFAULT now();
ALTER TABLE public.tournament_rosters
  ALTER COLUMN account_link_confirmed_at DROP DEFAULT;
