ALTER TABLE public.tournament_participants
  ADD COLUMN IF NOT EXISTS is_present boolean DEFAULT false NOT NULL;
