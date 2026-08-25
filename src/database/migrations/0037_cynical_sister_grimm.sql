CREATE TABLE "match_elo_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payment_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"receipt_number" varchar(50) NOT NULL,
	"service_name" varchar(255) NOT NULL,
	"purpose" varchar(50) NOT NULL,
	"tournament_id" uuid,
	"buyer_user_id" uuid,
	"subtotal" numeric(12, 2) NOT NULL,
	"platform_fee_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"tax_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'VND' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "payment_receipts_payment_id_unique" UNIQUE("payment_id"),
	CONSTRAINT "payment_receipts_receipt_number_unique" UNIQUE("receipt_number")
);
--> statement-breakpoint
CREATE TABLE "payment_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_key" varchar(255) NOT NULL,
	"payment_id" uuid,
	"provider_order_code" varchar(50) NOT NULL,
	"provider_transaction_id" varchar(255),
	"status_code" varchar(20) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"signature_verified" boolean DEFAULT false NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_webhook_events_event_key_unique" UNIQUE("event_key")
);
--> statement-breakpoint
CREATE TABLE "chat_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_blocks_no_self" CHECK ("chat_blocks"."blocker_id" <> "chat_blocks"."blocked_id")
);
--> statement-breakpoint
CREATE TABLE "chat_message_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"emoji" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_read_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "camera_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(100),
	"default_court_id" uuid,
	"assigned_operator_id" uuid,
	"pairing_token_hash" varchar(255),
	"pairing_token_expires_at" timestamp with time zone,
	"device_fingerprint_hash" varchar(255),
	"status" varchar(20) DEFAULT 'UNPAIRED' NOT NULL,
	"last_heartbeat_at" timestamp with time zone,
	"paired_at" timestamp with time zone,
	"created_by" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "facebook_page_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"page_id" varchar(255) NOT NULL,
	"page_name" varchar(255) NOT NULL,
	"encrypted_page_token" text NOT NULL,
	"connected_by" uuid,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"court_id" uuid,
	"match_id" uuid NOT NULL,
	"camera_device_id" uuid,
	"provider" varchar(20) DEFAULT 'FACEBOOK' NOT NULL,
	"provider_session_id" varchar(255),
	"status" varchar(20) DEFAULT 'CREATED' NOT NULL,
	"title" varchar(255),
	"description" text,
	"idempotency_key" varchar(255),
	"publish_config_expires_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"last_provider_check_at" timestamp with time zone,
	"replay_url" text,
	"replay_provider" varchar(20) DEFAULT 'NONE' NOT NULL,
	"youtube_video_id" varchar(255),
	"failure_code" varchar(100),
	"failure_message" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_sponsors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"display_name" varchar(160) NOT NULL,
	"tier" varchar(30) DEFAULT 'GOLD' NOT NULL,
	"logo_url" text NOT NULL,
	"website_url" text,
	"short_description" varchar(500),
	"display_order" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'DRAFT' NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "tournament_sponsors_display_order_non_negative" CHECK ("tournament_sponsors"."display_order" >= 0),
	CONSTRAINT "tournament_sponsors_display_window_valid" CHECK ("tournament_sponsors"."start_at" IS NULL OR "tournament_sponsors"."end_at" IS NULL OR "tournament_sponsors"."start_at" <= "tournament_sponsors"."end_at"),
	CONSTRAINT "tournament_sponsors_tier_valid" CHECK ("tournament_sponsors"."tier" IN ('TITLE', 'DIAMOND', 'GOLD', 'SILVER', 'BRONZE', 'IN_KIND')),
	CONSTRAINT "tournament_sponsors_status_valid" CHECK ("tournament_sponsors"."status" IN ('DRAFT', 'PUBLISHED', 'HIDDEN', 'ARCHIVED'))
);
--> statement-breakpoint
CREATE TABLE "admin_elo_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_key" varchar(128) NOT NULL,
	"payload_fingerprint" varchar(64) NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"scope" varchar(20) NOT NULL,
	"community_id" uuid,
	"match_type" varchar(50) NOT NULL,
	"gender_restriction" varchar(20),
	"operation" varchar(20) NOT NULL,
	"requested_value" integer,
	"previous_elo" integer,
	"new_elo" integer,
	"changed_points" integer,
	"previous_status" varchar(20),
	"new_status" varchar(20),
	"previous_leaderboard_eligible" boolean,
	"new_leaderboard_eligible" boolean,
	"reason" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_elo_operations_operation_valid" CHECK ("admin_elo_operations"."operation" in ('ADD', 'SUBTRACT', 'SET', 'RESET', 'HIDE', 'BAN', 'RESTORE')),
	CONSTRAINT "admin_elo_operations_scope_valid" CHECK (("admin_elo_operations"."scope" = 'PUBLIC' and "admin_elo_operations"."community_id" is null) or ("admin_elo_operations"."scope" = 'COMMUNITY' and "admin_elo_operations"."community_id" is not null)),
	CONSTRAINT "admin_elo_operations_elo_non_negative" CHECK (("admin_elo_operations"."previous_elo" is null or "admin_elo_operations"."previous_elo" >= 0) and ("admin_elo_operations"."new_elo" is null or "admin_elo_operations"."new_elo" >= 0)),
	CONSTRAINT "admin_elo_operations_requested_value_valid" CHECK (( "admin_elo_operations"."operation" in ('ADD', 'SUBTRACT', 'SET') and "admin_elo_operations"."requested_value" > 0 and "admin_elo_operations"."requested_value" <= 10000 ) or ( "admin_elo_operations"."operation" in ('RESET', 'HIDE', 'BAN', 'RESTORE') and "admin_elo_operations"."requested_value" is null )),
	CONSTRAINT "admin_elo_operations_reason_valid" CHECK (char_length(btrim("admin_elo_operations"."reason")) between 5 and 500),
	CONSTRAINT "admin_elo_operations_expiry_valid" CHECK ("admin_elo_operations"."expires_at" is null or "admin_elo_operations"."operation" in ('HIDE', 'BAN')),
	CONSTRAINT "admin_elo_operations_status_valid" CHECK (("admin_elo_operations"."previous_status" is null or "admin_elo_operations"."previous_status" in ('VISIBLE', 'HIDDEN', 'BANNED')) and ("admin_elo_operations"."new_status" is null or "admin_elo_operations"."new_status" in ('VISIBLE', 'HIDDEN', 'BANNED')))
);
--> statement-breakpoint
CREATE TABLE "ranking_context_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"scope" varchar(20) NOT NULL,
	"community_id" uuid,
	"match_type" varchar(50) NOT NULL,
	"gender_restriction" varchar(20),
	"status" varchar(20) DEFAULT 'VISIBLE' NOT NULL,
	"reason" text,
	"expires_at" timestamp with time zone,
	"changed_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ranking_context_status_state_valid" CHECK ("ranking_context_statuses"."status" in ('VISIBLE', 'HIDDEN', 'BANNED')),
	CONSTRAINT "ranking_context_status_scope_valid" CHECK (("ranking_context_statuses"."scope" = 'PUBLIC' and "ranking_context_statuses"."community_id" is null) or ("ranking_context_statuses"."scope" = 'COMMUNITY' and "ranking_context_statuses"."community_id" is not null)),
	CONSTRAINT "ranking_context_status_expiry_valid" CHECK ("ranking_context_statuses"."expires_at" is null or "ranking_context_statuses"."status" in ('HIDDEN', 'BANNED')),
	CONSTRAINT "ranking_context_status_reason_valid" CHECK ("ranking_context_statuses"."status" = 'VISIBLE' or ("ranking_context_statuses"."reason" is not null and char_length(btrim("ranking_context_statuses"."reason")) between 5 and 500))
);
--> statement-breakpoint
CREATE TABLE "community_member_social_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"muted" boolean DEFAULT false NOT NULL,
	"notifications_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_poll_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"creator_id" uuid,
	"option_text" text NOT NULL,
	"vote_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_poll_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_polls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"post_id" uuid,
	"creator_id" uuid,
	"question" text NOT NULL,
	"allow_multiple_answers" boolean DEFAULT false NOT NULL,
	"allow_add_options" boolean DEFAULT true NOT NULL,
	"is_closed" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_post_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"author_id" uuid,
	"parent_id" uuid,
	"body" text NOT NULL,
	"status" varchar(30) DEFAULT 'PUBLISHED' NOT NULL,
	"moderation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "community_post_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reaction_type" varchar(24) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"author_id" uuid,
	"tournament_id" uuid,
	"type" varchar(30) DEFAULT 'NORMAL' NOT NULL,
	"body" text,
	"media_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"topics" text[] DEFAULT '{}'::text[] NOT NULL,
	"mentions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(30) DEFAULT 'PUBLISHED' NOT NULL,
	"idempotency_key" varchar(128),
	"reaction_count" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "community_social_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"reporter_id" uuid NOT NULL,
	"post_id" uuid,
	"comment_id" uuid,
	"reason" varchar(60) NOT NULL,
	"details" text,
	"status" varchar(30) DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "community_social_settings" (
	"community_id" uuid PRIMARY KEY NOT NULL,
	"posting_policy" varchar(30) DEFAULT 'MEMBERS' NOT NULL,
	"post_approval_required" boolean DEFAULT false NOT NULL,
	"comments_enabled" boolean DEFAULT true NOT NULL,
	"chat_enabled" boolean DEFAULT true NOT NULL,
	"public_feed" boolean DEFAULT true NOT NULL,
	"member_tagging_policy" varchar(30) DEFAULT 'MEMBERS' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_tag_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"name" varchar(24) NOT NULL,
	"color" varchar(7) DEFAULT '#E2E8F0' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "football_elo_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_rank_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"before_elo" integer NOT NULL,
	"after_elo" integer NOT NULL,
	"delta" integer NOT NULL,
	"outcome" varchar(20) NOT NULL,
	"reason" varchar(40) DEFAULT 'MATCH_COMPLETED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "football_elo_events_outcome_check" CHECK ("football_elo_events"."outcome" IN ('WIN', 'DRAW', 'LOSS', 'FORFEIT', 'NO_SHOW'))
);
--> statement-breakpoint
CREATE TABLE "football_team_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"invited_by" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "football_team_invites_status_check" CHECK ("football_team_invites"."status" IN ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED'))
);
--> statement-breakpoint
CREATE TABLE "football_team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(20) DEFAULT 'PLAYER' NOT NULL,
	"status" varchar(20) DEFAULT 'INVITED' NOT NULL,
	"invited_by" uuid,
	"joined_at" timestamp with time zone,
	"left_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "football_team_members_role_check" CHECK ("football_team_members"."role" IN ('CAPTAIN', 'MANAGER', 'PLAYER')),
	CONSTRAINT "football_team_members_status_check" CHECK ("football_team_members"."status" IN ('INVITED', 'ACTIVE', 'DECLINED', 'LEFT', 'REMOVED'))
);
--> statement-breakpoint
CREATE TABLE "football_team_ranks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"tier_id" uuid,
	"elo_points" integer DEFAULT 1000 NOT NULL,
	"matches_played" integer DEFAULT 0 NOT NULL,
	"matches_won" integer DEFAULT 0 NOT NULL,
	"win_streak" integer DEFAULT 0 NOT NULL,
	"peak_elo" integer DEFAULT 1000 NOT NULL,
	"last_match_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "football_team_ranks_stats_check" CHECK ("football_team_ranks"."elo_points" >= 0 AND "football_team_ranks"."matches_played" >= 0 AND "football_team_ranks"."matches_won" >= 0 AND "football_team_ranks"."matches_won" <= "football_team_ranks"."matches_played")
);
--> statement-breakpoint
CREATE TABLE "football_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"logo_url" text,
	"category_id" uuid NOT NULL,
	"community_id" uuid,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "football_teams_status_check" CHECK ("football_teams"."status" IN ('ACTIVE', 'SUSPENDED', 'ARCHIVED'))
);
--> statement-breakpoint
CREATE TABLE "tournament_team_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"division_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"status" varchar(30) DEFAULT 'DRAFT' NOT NULL,
	"display_name_snapshot" varchar(120) NOT NULL,
	"logo_url_snapshot" text,
	"captain_ids_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"confirmed_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tournament_team_entries_status_check" CHECK ("tournament_team_entries"."status" IN ('DRAFT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'LOCKED', 'WITHDRAWN'))
);
--> statement-breakpoint
CREATE TABLE "tournament_team_roster_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(12) DEFAULT 'MAIN' NOT NULL,
	"jersey_number" integer,
	"position" varchar(30),
	"confirmation_status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tournament_team_roster_role_check" CHECK ("tournament_team_roster_snapshots"."role" IN ('MAIN', 'RESERVE')),
	CONSTRAINT "tournament_team_roster_confirmation_check" CHECK ("tournament_team_roster_snapshots"."confirmation_status" IN ('PENDING', 'CONFIRMED', 'DECLINED')),
	CONSTRAINT "tournament_team_roster_jersey_check" CHECK ("tournament_team_roster_snapshots"."jersey_number" IS NULL OR ("tournament_team_roster_snapshots"."jersey_number" BETWEEN 0 AND 99))
);
--> statement-breakpoint
CREATE TABLE "user_device_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"platform" varchar(20) DEFAULT 'ANDROID' NOT NULL,
	"device_info" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "districts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "districts" CASCADE;--> statement-breakpoint
ALTER TABLE "tournament_divisions" DROP CONSTRAINT "tournament_division_unique_idx";--> statement-breakpoint
ALTER TABLE "advertisements" DROP CONSTRAINT "ads_date_valid";--> statement-breakpoint
ALTER TABLE "communities" DROP CONSTRAINT "communities_district_code_districts_code_fk";
--> statement-breakpoint
ALTER TABLE "wards" DROP CONSTRAINT "wards_district_code_districts_code_fk";
--> statement-breakpoint
ALTER TABLE "advertisements" ALTER COLUMN "image_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "advertisements" ALTER COLUMN "target_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "advertisements" ALTER COLUMN "start_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "advertisements" ALTER COLUMN "end_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "allow_stranger_messages" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "elo_history_logs" ADD COLUMN "tournament_id" uuid;--> statement-breakpoint
ALTER TABLE "pair_ranks" ADD COLUMN "peak_elo" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "pair_ranks" ADD COLUMN "last_active_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "pair_ranks" ADD COLUMN "last_decay_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "pair_ranks" ADD COLUMN "admin_leaderboard_eligible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_ranks" ADD COLUMN "admin_leaderboard_eligible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_ranks" ADD COLUMN "peak_elo" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_ranks" ADD COLUMN "last_active_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "user_ranks" ADD COLUMN "last_decay_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "community_members" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "community_members" ADD COLUMN "notification_preference" varchar(32) DEFAULT 'ALL' NOT NULL;--> statement-breakpoint
ALTER TABLE "tournament_groups" ADD COLUMN "round_config" jsonb;--> statement-breakpoint
ALTER TABLE "tournament_participants" ADD COLUMN "football_team_id" uuid;--> statement-breakpoint
ALTER TABLE "tournament_participants" ADD COLUMN "football_team_logo_url" varchar(1000);--> statement-breakpoint
ALTER TABLE "tournament_participants" ADD COLUMN "ranking_consent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tournament_participants" ADD COLUMN "custom_responses" jsonb;--> statement-breakpoint
ALTER TABLE "tournament_participants" ADD COLUMN "partner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "tournament_participants" ADD COLUMN "partner_invite_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tournament_participants" ADD COLUMN "roster_locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tournament_rosters" ADD COLUMN "status" varchar(20) DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "leg" integer;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "tie_id" varchar(64);--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "type" varchar(32) DEFAULT 'TEXT' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "client_message_id" varchar(128);--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "is_revoked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "revoked_by" uuid;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "reply_to_id" uuid;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "is_pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "pinned_by" uuid;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "pinned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chat_room_members" ADD COLUMN "cleared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD COLUMN "community_id" uuid;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD COLUMN "club_name" varchar(255);--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD COLUMN "club_avatar" text;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD COLUMN "is_announcement_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD COLUMN "slow_mode_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD COLUMN "pinned_message_id" uuid;--> statement-breakpoint
ALTER TABLE "advertisements" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "advertisements" ADD COLUMN "banner_type" varchar(50) DEFAULT 'IMAGE_LINK' NOT NULL;--> statement-breakpoint
ALTER TABLE "advertisements" ADD COLUMN "cta_text" varchar(100);--> statement-breakpoint
ALTER TABLE "advertisements" ADD COLUMN "custom_html" text;--> statement-breakpoint
ALTER TABLE "advertisements" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "advertisements" ADD COLUMN "display_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "advertisements" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "wards" ADD COLUMN "province_code" varchar(20) NOT NULL;--> statement-breakpoint
ALTER TABLE "community_rankings" ADD COLUMN "admin_leaderboard_eligible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "community_rankings" ADD COLUMN "peak_elo" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "community_rankings" ADD COLUMN "last_active_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "community_rankings" ADD COLUMN "last_decay_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "match_elo_outbox" ADD CONSTRAINT "match_elo_outbox_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_buyer_user_id_users_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_blocks" ADD CONSTRAINT "chat_blocks_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_blocks" ADD CONSTRAINT "chat_blocks_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_reactions" ADD CONSTRAINT "chat_message_reactions_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_reactions" ADD CONSTRAINT "chat_message_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_read_states" ADD CONSTRAINT "chat_read_states_room_id_chat_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_read_states" ADD CONSTRAINT "chat_read_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camera_devices" ADD CONSTRAINT "camera_devices_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camera_devices" ADD CONSTRAINT "camera_devices_default_court_id_venue_courts_id_fk" FOREIGN KEY ("default_court_id") REFERENCES "public"."venue_courts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camera_devices" ADD CONSTRAINT "camera_devices_assigned_operator_id_users_id_fk" FOREIGN KEY ("assigned_operator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camera_devices" ADD CONSTRAINT "camera_devices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facebook_page_connections" ADD CONSTRAINT "facebook_page_connections_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facebook_page_connections" ADD CONSTRAINT "facebook_page_connections_connected_by_users_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_court_id_venue_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."venue_courts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_camera_device_id_camera_devices_id_fk" FOREIGN KEY ("camera_device_id") REFERENCES "public"."camera_devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_sponsors" ADD CONSTRAINT "tournament_sponsors_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_sponsors" ADD CONSTRAINT "tournament_sponsors_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_sponsors" ADD CONSTRAINT "tournament_sponsors_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_elo_operations" ADD CONSTRAINT "admin_elo_operations_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_elo_operations" ADD CONSTRAINT "admin_elo_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_elo_operations" ADD CONSTRAINT "admin_elo_operations_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_elo_operations" ADD CONSTRAINT "admin_elo_operations_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_context_statuses" ADD CONSTRAINT "ranking_context_statuses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_context_statuses" ADD CONSTRAINT "ranking_context_statuses_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_context_statuses" ADD CONSTRAINT "ranking_context_statuses_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_context_statuses" ADD CONSTRAINT "ranking_context_statuses_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_member_social_preferences" ADD CONSTRAINT "community_member_social_preferences_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_member_social_preferences" ADD CONSTRAINT "community_member_social_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_poll_options" ADD CONSTRAINT "community_poll_options_poll_id_community_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."community_polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_poll_options" ADD CONSTRAINT "community_poll_options_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_poll_votes" ADD CONSTRAINT "community_poll_votes_poll_id_community_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."community_polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_poll_votes" ADD CONSTRAINT "community_poll_votes_option_id_community_poll_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."community_poll_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_poll_votes" ADD CONSTRAINT "community_poll_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_polls" ADD CONSTRAINT "community_polls_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_polls" ADD CONSTRAINT "community_polls_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_polls" ADD CONSTRAINT "community_polls_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_post_comments" ADD CONSTRAINT "community_post_comments_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_post_comments" ADD CONSTRAINT "community_post_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_post_reactions" ADD CONSTRAINT "community_post_reactions_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_post_reactions" ADD CONSTRAINT "community_post_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_social_reports" ADD CONSTRAINT "community_social_reports_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_social_reports" ADD CONSTRAINT "community_social_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_social_reports" ADD CONSTRAINT "community_social_reports_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_social_reports" ADD CONSTRAINT "community_social_reports_comment_id_community_post_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."community_post_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_social_settings" ADD CONSTRAINT "community_social_settings_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_tag_presets" ADD CONSTRAINT "community_tag_presets_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_tag_presets" ADD CONSTRAINT "community_tag_presets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "football_elo_events" ADD CONSTRAINT "football_elo_events_team_rank_id_football_team_ranks_id_fk" FOREIGN KEY ("team_rank_id") REFERENCES "public"."football_team_ranks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "football_elo_events" ADD CONSTRAINT "football_elo_events_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "football_team_invites" ADD CONSTRAINT "football_team_invites_team_id_football_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."football_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "football_team_invites" ADD CONSTRAINT "football_team_invites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "football_team_invites" ADD CONSTRAINT "football_team_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "football_team_members" ADD CONSTRAINT "football_team_members_team_id_football_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."football_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "football_team_members" ADD CONSTRAINT "football_team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "football_team_members" ADD CONSTRAINT "football_team_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "football_team_ranks" ADD CONSTRAINT "football_team_ranks_team_id_football_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."football_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "football_team_ranks" ADD CONSTRAINT "football_team_ranks_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "football_team_ranks" ADD CONSTRAINT "football_team_ranks_tier_id_elo_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."elo_tiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "football_teams" ADD CONSTRAINT "football_teams_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "football_teams" ADD CONSTRAINT "football_teams_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "football_teams" ADD CONSTRAINT "football_teams_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_team_entries" ADD CONSTRAINT "tournament_team_entries_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_team_entries" ADD CONSTRAINT "tournament_team_entries_division_id_tournament_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."tournament_divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_team_entries" ADD CONSTRAINT "tournament_team_entries_team_id_football_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."football_teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_team_entries" ADD CONSTRAINT "tournament_team_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_team_roster_snapshots" ADD CONSTRAINT "tournament_team_roster_snapshots_entry_id_tournament_team_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."tournament_team_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_team_roster_snapshots" ADD CONSTRAINT "tournament_team_roster_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_device_tokens" ADD CONSTRAINT "user_device_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "match_elo_outbox_match_id_unique" ON "match_elo_outbox" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "idx_elo_outbox_claim" ON "match_elo_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "idx_elo_outbox_lease" ON "match_elo_outbox" USING btree ("locked_at") WHERE status = 'PROCESSING';--> statement-breakpoint
CREATE INDEX "payment_webhook_events_order_code_idx" ON "payment_webhook_events" USING btree ("provider_order_code");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_chat_blocks_pair" ON "chat_blocks" USING btree ("blocker_id","blocked_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_chat_msg_reaction_user" ON "chat_message_reactions" USING btree ("message_id","user_id","emoji");--> statement-breakpoint
CREATE INDEX "idx_chat_msg_reactions_msg" ON "chat_message_reactions" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_chat_read_states_room_user" ON "chat_read_states" USING btree ("room_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_camera_devices_community" ON "camera_devices" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "idx_camera_devices_status" ON "camera_devices" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "facebook_page_connections_community_page_unique_idx" ON "facebook_page_connections" USING btree ("community_id","page_id");--> statement-breakpoint
CREATE INDEX "idx_facebook_page_connections_community" ON "facebook_page_connections" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "idx_facebook_page_connections_status" ON "facebook_page_connections" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "live_sessions_provider_session_unique_idx" ON "live_sessions" USING btree ("provider","provider_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "live_sessions_idempotency_key_unique_idx" ON "live_sessions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_live_sessions_tournament" ON "live_sessions" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "idx_live_sessions_match" ON "live_sessions" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "idx_live_sessions_status" ON "live_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_live_sessions_provider_session" ON "live_sessions" USING btree ("provider_session_id");--> statement-breakpoint
CREATE INDEX "idx_live_sessions_camera_device" ON "live_sessions" USING btree ("camera_device_id");--> statement-breakpoint
CREATE INDEX "idx_live_sessions_court" ON "live_sessions" USING btree ("court_id");--> statement-breakpoint
CREATE UNIQUE INDEX "live_sessions_active_court_unique_idx" ON "live_sessions" USING btree ("court_id") WHERE status IN ('CREATED', 'STARTING', 'LIVE', 'RECONNECTING', 'STOPPING');--> statement-breakpoint
CREATE UNIQUE INDEX "live_sessions_active_camera_unique_idx" ON "live_sessions" USING btree ("camera_device_id") WHERE status IN ('CREATED', 'STARTING', 'LIVE', 'RECONNECTING', 'STOPPING');--> statement-breakpoint
CREATE UNIQUE INDEX "live_sessions_active_match_unique_idx" ON "live_sessions" USING btree ("match_id") WHERE status IN ('CREATED', 'STARTING', 'LIVE', 'RECONNECTING', 'STOPPING');--> statement-breakpoint
CREATE INDEX "idx_tournament_sponsors_tournament_lifecycle" ON "tournament_sponsors" USING btree ("tournament_id","status","is_public","display_order");--> statement-breakpoint
CREATE INDEX "idx_tournament_sponsors_display_window" ON "tournament_sponsors" USING btree ("tournament_id","start_at","end_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_elo_operations_key_idx" ON "admin_elo_operations" USING btree ("operation_key");--> statement-breakpoint
CREATE INDEX "admin_elo_operations_target_history_idx" ON "admin_elo_operations" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "admin_elo_operations_actor_history_idx" ON "admin_elo_operations" USING btree ("admin_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ranking_context_status_context_idx" ON "ranking_context_statuses" USING btree ("user_id","category_id","scope",coalesce("community_id"::text, ''),"match_type",coalesce("gender_restriction", ''));--> statement-breakpoint
CREATE INDEX "ranking_context_status_lookup_idx" ON "ranking_context_statuses" USING btree ("category_id","scope","community_id","match_type","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_community_member_social_preferences" ON "community_member_social_preferences" USING btree ("community_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_community_poll_options_poll" ON "community_poll_options" USING btree ("poll_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_community_poll_votes_user_option" ON "community_poll_votes" USING btree ("option_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_community_poll_votes_poll" ON "community_poll_votes" USING btree ("poll_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_community_polls_post" ON "community_polls" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "idx_community_polls_community" ON "community_polls" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "idx_community_post_comments_post" ON "community_post_comments" USING btree ("post_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_community_post_reactions_user" ON "community_post_reactions" USING btree ("post_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_community_posts_feed" ON "community_posts" USING btree ("community_id","created_at","id");--> statement-breakpoint
CREATE INDEX "idx_community_posts_status" ON "community_posts" USING btree ("community_id","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_community_posts_tournament" ON "community_posts" USING btree ("tournament_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_community_posts_idempotency" ON "community_posts" USING btree ("community_id","author_id","idempotency_key") WHERE "community_posts"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_community_social_reports_queue" ON "community_social_reports" USING btree ("community_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "community_tag_presets_name_unique" ON "community_tag_presets" USING btree ("community_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "uq_football_elo_events_match_team" ON "football_elo_events" USING btree ("match_id","team_rank_id");--> statement-breakpoint
CREATE INDEX "idx_football_elo_events_team_created" ON "football_elo_events" USING btree ("team_rank_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_football_team_invites_pending" ON "football_team_invites" USING btree ("team_id","user_id") WHERE "football_team_invites"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "idx_football_team_invites_user_status" ON "football_team_invites" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_football_team_members_team_user" ON "football_team_members" USING btree ("team_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_football_team_members_team_status" ON "football_team_members" USING btree ("team_id","status");--> statement-breakpoint
CREATE INDEX "idx_football_team_members_user_status" ON "football_team_members" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_football_team_ranks_team_category" ON "football_team_ranks" USING btree ("team_id","category_id");--> statement-breakpoint
CREATE INDEX "idx_football_team_ranks_leaderboard" ON "football_team_ranks" USING btree ("category_id","elo_points","team_id");--> statement-breakpoint
CREATE INDEX "idx_football_teams_status" ON "football_teams" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_football_teams_community" ON "football_teams" USING btree ("community_id","status");--> statement-breakpoint
CREATE INDEX "idx_football_teams_creator" ON "football_teams" USING btree ("created_by","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tournament_team_entries_division_team" ON "tournament_team_entries" USING btree ("tournament_id","division_id","team_id");--> statement-breakpoint
CREATE INDEX "idx_tournament_team_entries_division_status" ON "tournament_team_entries" USING btree ("division_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tournament_team_roster_entry_user" ON "tournament_team_roster_snapshots" USING btree ("entry_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_tournament_team_roster_entry_role" ON "tournament_team_roster_snapshots" USING btree ("entry_id","role");--> statement-breakpoint
CREATE INDEX "idx_user_device_user_id" ON "user_device_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_device_user_token" ON "user_device_tokens" USING btree ("user_id","token");--> statement-breakpoint
ALTER TABLE "tournament_participants" ADD CONSTRAINT "tournament_participants_partner_user_id_users_id_fk" FOREIGN KEY ("partner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_pinned_by_users_id_fk" FOREIGN KEY ("pinned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advertisements" ADD CONSTRAINT "advertisements_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wards" ADD CONSTRAINT "wards_province_code_provinces_code_fk" FOREIGN KEY ("province_code") REFERENCES "public"."provinces"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_to_roles_user_id_role_id_unique" ON "user_to_roles" USING btree ("user_id","role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_idx_match_user" ON "elo_history_logs" USING btree ("match_id","user_id") WHERE "elo_history_logs"."match_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_rosters_participant_user_unique_idx" ON "tournament_rosters" USING btree ("participant_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_standings_group_participant_unique" ON "group_standings" USING btree ("group_id","participant_id");--> statement-breakpoint
CREATE INDEX "idx_chat_messages_room_created" ON "chat_messages" USING btree ("room_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_chat_messages_pinned" ON "chat_messages" USING btree ("room_id","is_pinned");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_chat_rooms_club_community" ON "chat_rooms" USING btree ("community_id") WHERE "chat_rooms"."type" = 'CLUB';--> statement-breakpoint
CREATE INDEX "advertisements_category_id_idx" ON "advertisements" USING btree ("category_id");--> statement-breakpoint
ALTER TABLE "wards" DROP COLUMN "district_code";--> statement-breakpoint
ALTER TABLE "community_sports" ADD CONSTRAINT "community_sports_community_id_unique" UNIQUE("community_id");--> statement-breakpoint
ALTER TABLE "advertisements" ADD CONSTRAINT "ads_date_valid" CHECK ("advertisements"."start_date" IS NULL OR "advertisements"."end_date" IS NULL OR "advertisements"."start_date" < "advertisements"."end_date");