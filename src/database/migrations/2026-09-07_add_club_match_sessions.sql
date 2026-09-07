-- Additive club social match-session context. Existing tournament matches keep
-- their required tournament_id/stage_id constraints and are not rewritten.
CREATE TABLE IF NOT EXISTS "club_match_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "community_id" uuid NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "category_id" uuid NOT NULL REFERENCES "categories"("id") ON DELETE RESTRICT,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "name" varchar(255),
  "description" text,
  "status" varchar(20) DEFAULT 'OPEN' NOT NULL,
  "registration_mode" varchar(24) DEFAULT 'MIXED' NOT NULL,
  "pairing_mode" varchar(20) DEFAULT 'FREE' NOT NULL,
  "is_ranked" boolean DEFAULT true NOT NULL,
  "start_at" timestamptz,
  "end_at" timestamptz,
  "registration_open_at" timestamptz DEFAULT now() NOT NULL,
  "registration_closed_at" timestamptz,
  "ended_at" timestamptz,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "deleted_at" timestamptz,
  CONSTRAINT "club_match_sessions_status_check" CHECK ("status" IN ('OPEN','LIVE','CLOSED','ENDED','CANCELLED')),
  CONSTRAINT "club_match_sessions_registration_mode_check" CHECK ("registration_mode" IN ('SELF','MANAGER_ASSIGN','MIXED')),
  CONSTRAINT "club_match_sessions_pairing_mode_check" CHECK ("pairing_mode" = 'FREE'),
  CONSTRAINT "club_match_sessions_schedule_check" CHECK ("start_at" IS NULL OR "end_at" IS NULL OR "end_at" >= "start_at")
);
CREATE INDEX IF NOT EXISTS "club_match_sessions_community_status_idx" ON "club_match_sessions" ("community_id", "status", "created_at");

CREATE TABLE IF NOT EXISTS "club_match_session_participants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "club_match_sessions"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "source" varchar(20) DEFAULT 'SELF' NOT NULL,
  "status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
  "assigned_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "assigned_at" timestamptz,
  "withdrawn_at" timestamptz,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "club_match_session_participants_source_check" CHECK ("source" IN ('SELF','MANDATORY')),
  CONSTRAINT "club_match_session_participants_status_check" CHECK ("status" IN ('ACTIVE','WITHDRAWN','KICKED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "club_match_session_participants_session_user_unique" ON "club_match_session_participants" ("session_id", "user_id");
CREATE INDEX IF NOT EXISTS "club_match_session_participants_session_status_idx" ON "club_match_session_participants" ("session_id", "status", "created_at");

CREATE TABLE IF NOT EXISTS "club_match_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "club_match_sessions"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "preferred_partner_user_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "preferred_opponent_user_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "avoid_user_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "club_match_preferences_session_user_unique" ON "club_match_preferences" ("session_id", "user_id");

CREATE TABLE IF NOT EXISTS "club_match_session_matches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "club_match_sessions"("id") ON DELETE CASCADE,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "side_a_user_ids" uuid[] NOT NULL,
  "side_b_user_ids" uuid[] NOT NULL,
  "match_type" varchar(24) NOT NULL,
  "status" varchar(20) DEFAULT 'SCHEDULED' NOT NULL,
  "score_details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "p1_sets_won" integer DEFAULT 0 NOT NULL,
  "p2_sets_won" integer DEFAULT 0 NOT NULL,
  "winner_side" varchar(8),
  "scheduled_at" timestamptz,
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "score_confirmed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "revision" integer DEFAULT 1 NOT NULL,
  "elo_status" varchar(24) DEFAULT 'WAITING_RESULT' NOT NULL,
  "elo_delta" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "deleted_at" timestamptz,
  CONSTRAINT "club_match_session_matches_status_check" CHECK ("status" IN ('SCHEDULED','ONGOING','COMPLETED','CANCELLED')),
  CONSTRAINT "club_match_session_matches_match_type_check" CHECK ("match_type" IN ('SINGLES','DOUBLES','MIXED_DOUBLES')),
  CONSTRAINT "club_match_session_matches_winner_side_check" CHECK ("winner_side" IS NULL OR "winner_side" IN ('A','B')),
  CONSTRAINT "club_match_session_matches_score_check" CHECK ("p1_sets_won" >= 0 AND "p2_sets_won" >= 0)
);
CREATE INDEX IF NOT EXISTS "club_match_session_matches_session_status_idx" ON "club_match_session_matches" ("session_id", "status", "created_at");

CREATE TABLE IF NOT EXISTS "club_match_session_commands" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "club_match_sessions"("id") ON DELETE CASCADE,
  "actor_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "operation" varchar(40) NOT NULL,
  "idempotency_key" varchar(128) NOT NULL,
  "request_fingerprint" varchar(64) NOT NULL,
  "result" jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "club_match_session_commands_actor_operation_key_unique" ON "club_match_session_commands" ("actor_id", "operation", "idempotency_key");

ALTER TABLE "match_elo_outbox" ALTER COLUMN "match_id" DROP NOT NULL;
ALTER TABLE "match_elo_outbox" ADD COLUMN IF NOT EXISTS "club_match_session_match_id" uuid;
DO $$ BEGIN
  ALTER TABLE "match_elo_outbox" ADD CONSTRAINT "match_elo_outbox_club_session_match_id_fk"
    FOREIGN KEY ("club_match_session_match_id") REFERENCES "club_match_session_matches"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "match_elo_outbox_club_session_match_id_unique" ON "match_elo_outbox" ("club_match_session_match_id");
DO $$ BEGIN
  ALTER TABLE "match_elo_outbox" ADD CONSTRAINT "match_elo_outbox_exactly_one_context_check"
    CHECK (("match_id" IS NOT NULL) <> ("club_match_session_match_id" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
