-- Migration: Enhance Club Chat with Messenger Features (Revoke, Pin, Reactions, Club Chat Settings)
--> statement-breakpoint
ALTER TABLE "chat_rooms"
  ADD COLUMN IF NOT EXISTS "is_announcement_only" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "chat_rooms"
  ADD COLUMN IF NOT EXISTS "slow_mode_seconds" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "chat_rooms"
  ADD COLUMN IF NOT EXISTS "pinned_message_id" uuid;
--> statement-breakpoint
ALTER TABLE "chat_messages"
  ADD COLUMN IF NOT EXISTS "is_revoked" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "chat_messages"
  ADD COLUMN IF NOT EXISTS "revoked_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "chat_messages"
  ADD COLUMN IF NOT EXISTS "revoked_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "chat_messages"
  ADD COLUMN IF NOT EXISTS "reply_to_id" uuid;
--> statement-breakpoint
ALTER TABLE "chat_messages"
  ADD COLUMN IF NOT EXISTS "is_pinned" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "chat_messages"
  ADD COLUMN IF NOT EXISTS "pinned_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "chat_messages"
  ADD COLUMN IF NOT EXISTS "pinned_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_messages_room_created"
  ON "chat_messages" ("room_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_messages_pinned"
  ON "chat_messages" ("room_id", "is_pinned");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_message_reactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "message_id" uuid NOT NULL REFERENCES "chat_messages"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "emoji" varchar(16) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uq_chat_msg_reaction_user" UNIQUE ("message_id", "user_id", "emoji")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_msg_reactions_msg"
  ON "chat_message_reactions" ("message_id");
