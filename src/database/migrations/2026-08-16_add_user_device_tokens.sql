CREATE TABLE IF NOT EXISTS "user_device_tokens" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "token" text NOT NULL,
    "platform" varchar(20) DEFAULT 'ANDROID' NOT NULL,
    "device_info" text,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_user_device_user_id" ON "user_device_tokens" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_device_user_token" ON "user_device_tokens" ("user_id", "token");
