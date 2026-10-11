-- Pair provenance is intentionally unknown for all existing participant rows.
-- Only the two organizer pairing transactions write MANUAL or SYSTEM.
ALTER TABLE public.tournament_participants
  ADD COLUMN pairing_source varchar(20) NOT NULL DEFAULT 'UNKNOWN',
  ADD CONSTRAINT tournament_participants_pairing_source_check
    CHECK (pairing_source IN ('UNKNOWN', 'MANUAL', 'SYSTEM'));
