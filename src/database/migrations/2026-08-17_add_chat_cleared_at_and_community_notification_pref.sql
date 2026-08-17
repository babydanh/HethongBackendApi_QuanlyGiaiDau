-- Migration: Add cleared_at to chat_room_members and notification_preference to community_members
ALTER TABLE chat_room_members ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMPTZ;
ALTER TABLE community_members ADD COLUMN IF NOT EXISTS notification_preference VARCHAR(32) NOT NULL DEFAULT 'ALL';
