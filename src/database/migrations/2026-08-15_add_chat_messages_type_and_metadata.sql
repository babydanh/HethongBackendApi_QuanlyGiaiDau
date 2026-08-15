ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "type" varchar(32) DEFAULT 'TEXT' NOT NULL;
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "metadata" jsonb;
