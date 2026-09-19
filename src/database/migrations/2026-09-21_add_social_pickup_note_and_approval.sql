-- Migration: Add note column to social_pickup_participants
ALTER TABLE social_pickup_participants
  ADD COLUMN IF NOT EXISTS note TEXT;

CREATE INDEX IF NOT EXISTS social_pickup_participants_status_idx
  ON social_pickup_participants(status);
