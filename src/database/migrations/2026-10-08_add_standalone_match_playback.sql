-- The production runner executes journal migrations before this hand-authored chain.
-- Reapply idempotently so fresh installs receive these columns after the standalone table exists.
ALTER TABLE public.club_standalone_matches
  ADD COLUMN IF NOT EXISTS playback_url text,
  ADD COLUMN IF NOT EXISTS camera_name varchar(255);
