CREATE TABLE IF NOT EXISTS "chat_read_states" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "room_id" uuid NOT NULL REFERENCES "chat_rooms"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "last_read_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "uq_chat_read_states_room_user" UNIQUE ("room_id", "user_id")
);
CREATE INDEX IF NOT EXISTS "idx_chat_read_states_user" ON "chat_read_states" ("user_id");
