CREATE TABLE IF NOT EXISTS "ranking_context_statuses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "category_id" uuid NOT NULL REFERENCES "categories"("id") ON DELETE CASCADE,
  "scope" varchar(20) DEFAULT 'PUBLIC' NOT NULL,
  "community_id" uuid REFERENCES "communities"("id") ON DELETE CASCADE,
  "match_type" varchar(50) NOT NULL,
  "gender_restriction" varchar(20),
  "status" varchar(20) DEFAULT 'VISIBLE' NOT NULL,
  "reason" text,
  "expires_at" timestamptz,
  "changed_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "ranking_context_status_state_valid" CHECK ("status" IN ('VISIBLE', 'HIDDEN', 'BANNED')),
  CONSTRAINT "ranking_context_status_scope_valid" CHECK (("scope" = 'PUBLIC' AND "community_id" IS NULL) OR ("scope" = 'COMMUNITY' AND "community_id" IS NOT NULL)),
  CONSTRAINT "ranking_context_status_expiry_valid" CHECK ("expires_at" IS NULL OR "status" IN ('HIDDEN', 'BANNED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "ranking_context_status_context_idx"
  ON "ranking_context_statuses" ("user_id", "category_id", "scope", COALESCE("community_id"::text, ''), "match_type", COALESCE("gender_restriction", ''));

CREATE INDEX IF NOT EXISTS "ranking_context_status_lookup_idx"
  ON "ranking_context_statuses" ("category_id", "scope", "community_id", "match_type", "status");

CREATE TABLE IF NOT EXISTS "admin_elo_operations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "operation_key" varchar(128) NOT NULL,
  "payload_fingerprint" varchar(64) NOT NULL,
  "admin_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "category_id" uuid NOT NULL REFERENCES "categories"("id") ON DELETE RESTRICT,
  "scope" varchar(20) NOT NULL,
  "community_id" uuid REFERENCES "communities"("id") ON DELETE RESTRICT,
  "match_type" varchar(50) NOT NULL,
  "gender_restriction" varchar(20),
  "operation" varchar(20) NOT NULL,
  "requested_value" integer,
  "previous_elo" integer,
  "new_elo" integer,
  "changed_points" integer,
  "previous_status" varchar(20),
  "new_status" varchar(20),
  "reason" text NOT NULL,
  "expires_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "admin_elo_operations_operation_valid" CHECK ("operation" IN ('ADD', 'SUBTRACT', 'SET', 'RESET', 'HIDE', 'BAN', 'RESTORE')),
  CONSTRAINT "admin_elo_operations_scope_valid" CHECK (("scope" = 'PUBLIC' AND "community_id" IS NULL) OR ("scope" = 'COMMUNITY' AND "community_id" IS NOT NULL)),
  CONSTRAINT "admin_elo_operations_elo_non_negative" CHECK (("previous_elo" IS NULL OR "previous_elo" >= 0) AND ("new_elo" IS NULL OR "new_elo" >= 0))
);

CREATE UNIQUE INDEX IF NOT EXISTS "admin_elo_operations_key_idx"
  ON "admin_elo_operations" ("operation_key");

CREATE INDEX IF NOT EXISTS "admin_elo_operations_target_history_idx"
  ON "admin_elo_operations" ("user_id", "created_at");

CREATE INDEX IF NOT EXISTS "admin_elo_operations_actor_history_idx"
  ON "admin_elo_operations" ("admin_user_id", "created_at");
