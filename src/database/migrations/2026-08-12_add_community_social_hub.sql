-- Community Social Hub Phase 1 foundation.
-- Apply only through the normal migration workflow; do not run against production manually.
CREATE TABLE IF NOT EXISTS "community_social_settings" (
  "community_id" uuid PRIMARY KEY REFERENCES "communities"("id") ON DELETE CASCADE,
  "posting_policy" varchar(30) NOT NULL DEFAULT 'MEMBERS',
  "post_approval_required" boolean NOT NULL DEFAULT false,
  "comments_enabled" boolean NOT NULL DEFAULT true,
  "chat_enabled" boolean NOT NULL DEFAULT true,
  "public_feed" boolean NOT NULL DEFAULT true,
  "member_tagging_policy" varchar(30) NOT NULL DEFAULT 'MEMBERS',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "community_id" uuid NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "author_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "body" text,
  "media_urls" text[] NOT NULL DEFAULT '{}',
  "topics" text[] NOT NULL DEFAULT '{}',
  "mentions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" varchar(30) NOT NULL DEFAULT 'PUBLISHED',
  "idempotency_key" varchar(128),
  "reaction_count" integer NOT NULL DEFAULT 0,
  "comment_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_community_posts_feed" ON "community_posts" ("community_id", "created_at", "id");
CREATE INDEX IF NOT EXISTS "idx_community_posts_status" ON "community_posts" ("community_id", "status", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_community_posts_idempotency" ON "community_posts" ("community_id", "author_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_post_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "post_id" uuid NOT NULL REFERENCES "community_posts"("id") ON DELETE CASCADE,
  "author_id" uuid REFERENCES "users"("id") ON DELETE SET NULL, "parent_id" uuid,
  "body" text NOT NULL, "status" varchar(30) NOT NULL DEFAULT 'PUBLISHED',
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "deleted_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "idx_community_post_comments_post" ON "community_post_comments" ("post_id", "created_at", "id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_post_reactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "post_id" uuid NOT NULL REFERENCES "community_posts"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE, "reaction_type" varchar(24) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_community_post_reactions_user" ON "community_post_reactions" ("post_id", "user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_social_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "community_id" uuid NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "reporter_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE, "post_id" uuid REFERENCES "community_posts"("id") ON DELETE CASCADE,
  "comment_id" uuid REFERENCES "community_post_comments"("id") ON DELETE CASCADE, "reason" varchar(60) NOT NULL, "details" text,
  "status" varchar(30) NOT NULL DEFAULT 'OPEN', "created_at" timestamptz NOT NULL DEFAULT now(), "resolved_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "idx_community_social_reports_queue" ON "community_social_reports" ("community_id", "status", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_member_social_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "community_id" uuid NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE, "muted" boolean NOT NULL DEFAULT false,
  "notifications_enabled" boolean NOT NULL DEFAULT true, "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_community_member_social_preferences" ON "community_member_social_preferences" ("community_id", "user_id");
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "client_message_id" varchar(128);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_chat_messages_client_id" ON "chat_messages" ("room_id", "sender_id", "client_message_id") WHERE "client_message_id" IS NOT NULL;
