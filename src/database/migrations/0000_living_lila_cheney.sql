CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"avatar_url" text,
	"phone_number" varchar(20),
	"date_of_birth" date,
	"bio" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name"),
	CONSTRAINT "roles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"refresh_token" text NOT NULL,
	"user_agent" text,
	"ip_address" varchar(45),
	"is_revoked" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_refresh_token_unique" UNIQUE("refresh_token")
);
--> statement-breakpoint
CREATE TABLE "user_to_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by" uuid
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"is_email_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"category_config" jsonb DEFAULT '{}' NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name"),
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "elo_history_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"match_id" uuid,
	"reason" varchar(100),
	"previous_elo" integer NOT NULL,
	"new_elo" integer NOT NULL,
	"changed_points" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "elo_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"min_elo" integer NOT NULL,
	"max_elo" integer NOT NULL,
	"icon_url" text,
	CONSTRAINT "elo_range_valid" CHECK ("elo_tiers"."min_elo" < "elo_tiers"."max_elo")
);
--> statement-breakpoint
CREATE TABLE "user_ranks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"elo_points" integer DEFAULT 1200 NOT NULL,
	"tier_id" uuid,
	"matches_played" integer DEFAULT 0 NOT NULL,
	"matches_won" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "elo_non_negative" CHECK ("user_ranks"."elo_points" >= 0),
	CONSTRAINT "wins_lte_played" CHECK ("user_ranks"."matches_won" <= "user_ranks"."matches_played")
);
--> statement-breakpoint
CREATE TABLE "communities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"logo_url" text,
	"banner_url" text,
	"creator_id" uuid NOT NULL,
	"status" varchar(50) DEFAULT 'PENDING' NOT NULL,
	"approved_by" uuid,
	"rejected_reason" text,
	"reviewed_at" timestamp with time zone,
	"location_geolocation" "text",
	"location_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "community_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(50) DEFAULT 'MEMBER' NOT NULL,
	"status" varchar(50) DEFAULT 'JOINED' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_sports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"category_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"location_address" text NOT NULL,
	"location_geolocation" "text",
	"images_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venue_courts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"court_name" varchar(100) NOT NULL,
	"status" varchar(50) DEFAULT 'AVAILABLE' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stage_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"group_id" uuid,
	"registered_by" uuid NOT NULL,
	"team_name" varchar(255) NOT NULL,
	"seed" integer,
	"points" integer DEFAULT 0 NOT NULL,
	"is_paid" boolean DEFAULT false NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_rosters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(50) DEFAULT 'MAIN' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid,
	"category_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"status" varchar(50) DEFAULT 'UPCOMING' NOT NULL,
	"sport_rules" jsonb NOT NULL,
	"tournament_config" jsonb NOT NULL,
	"entry_fee" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"platform_fee_percentage" numeric(5, 2) DEFAULT '5.00' NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"venue_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "entry_fee_non_negative" CHECK ("tournaments"."entry_fee" >= 0),
	CONSTRAINT "platform_fee_valid" CHECK ("tournaments"."platform_fee_percentage" >= 0 AND "tournaments"."platform_fee_percentage" <= 100)
);
--> statement-breakpoint
CREATE TABLE "group_standings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"played" integer DEFAULT 0 NOT NULL,
	"won" integer DEFAULT 0 NOT NULL,
	"lost" integer DEFAULT 0 NOT NULL,
	"draws" integer DEFAULT 0 NOT NULL,
	"points_for" integer DEFAULT 0 NOT NULL,
	"points_against" integer DEFAULT 0 NOT NULL,
	"total_points" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"filed_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"evidence_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" varchar(50) DEFAULT 'OPEN' NOT NULL,
	"resolved_by" uuid,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "match_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" varchar(50) DEFAULT 'PLAYED' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"participant1_id" uuid,
	"participant2_id" uuid,
	"winner_id" uuid,
	"status" varchar(50) DEFAULT 'SCHEDULED' NOT NULL,
	"score_details" jsonb DEFAULT '{}' NOT NULL,
	"p1_sets_won" integer DEFAULT 0 NOT NULL,
	"p2_sets_won" integer DEFAULT 0 NOT NULL,
	"total_sets_played" integer DEFAULT 0 NOT NULL,
	"round_number" integer NOT NULL,
	"match_order" integer NOT NULL,
	"bracket_branch" varchar(50) DEFAULT 'MAIN' NOT NULL,
	"next_match_id" uuid,
	"loser_next_match_id" uuid,
	"court_id" uuid,
	"referee_id" uuid,
	"score_confirmed_by" uuid,
	"score_confirmed_at" timestamp with time zone,
	"match_evidence_images" text[] DEFAULT '{}'::text[] NOT NULL,
	"scheduled_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "sets_non_negative" CHECK ("matches"."p1_sets_won" >= 0 AND "matches"."p2_sets_won" >= 0),
	CONSTRAINT "different_participants" CHECK ("matches"."participant1_id" IS DISTINCT FROM "matches"."participant2_id")
);
--> statement-breakpoint
CREATE TABLE "organizer_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"organizer_id" uuid NOT NULL,
	"total_collected" numeric(12, 2) NOT NULL,
	"amount_requested" numeric(12, 2) NOT NULL,
	"platform_fee_retained" numeric(12, 2) NOT NULL,
	"bank_name" varchar(100) NOT NULL,
	"bank_account_number" varchar(50) NOT NULL,
	"bank_account_name" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'PENDING' NOT NULL,
	"transaction_proof_url" text,
	"processed_by" uuid,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payout_amounts_valid" CHECK ("organizer_payouts"."amount_requested" > 0 AND "organizer_payouts"."platform_fee_retained" >= 0 AND "organizer_payouts"."total_collected" >= "organizer_payouts"."amount_requested" + "organizer_payouts"."platform_fee_retained")
);
--> statement-breakpoint
CREATE TABLE "payment_status_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"previous_status" varchar(50) NOT NULL,
	"new_status" varchar(50) NOT NULL,
	"changed_by" uuid,
	"reason" text,
	"ip_address" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"participant_id" uuid,
	"tournament_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"platform_fee_amount" numeric(12, 2),
	"status" varchar(50) DEFAULT 'PENDING' NOT NULL,
	"payment_gateway" varchar(50),
	"transaction_reference" varchar(255),
	"gateway_response" jsonb,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_transaction_reference_unique" UNIQUE("transaction_reference"),
	CONSTRAINT "amount_positive" CHECK ("payments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "payout_status_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payout_id" uuid NOT NULL,
	"previous_status" varchar(50) NOT NULL,
	"new_status" varchar(50) NOT NULL,
	"changed_by" uuid,
	"note" text,
	"ip_address" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"sender_id" uuid,
	"message_text" text,
	"attachments_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_room_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255),
	"type" varchar(50) DEFAULT 'DIRECT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_id" uuid NOT NULL,
	"receiver_id" uuid NOT NULL,
	"status" varchar(50) DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "no_self_friend" CHECK ("friendships"."sender_id" != "friendships"."receiver_id")
);
--> statement-breakpoint
CREATE TABLE "match_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"user_id" uuid,
	"comment_text" text NOT NULL,
	"parent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(50) DEFAULT 'LIKE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receiver_id" uuid NOT NULL,
	"sender_id" uuid,
	"type" varchar(100) NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"redirect_url" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "advertisements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"image_url" text NOT NULL,
	"target_url" text NOT NULL,
	"placement_slot" varchar(100) NOT NULL,
	"views_count" integer DEFAULT 0 NOT NULL,
	"clicks_count" integer DEFAULT 0 NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ads_date_valid" CHECK ("advertisements"."start_date" < "advertisements"."end_date")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" varchar(100) NOT NULL,
	"table_name" varchar(100) NOT NULL,
	"record_id" uuid NOT NULL,
	"old_values" jsonb,
	"new_values" jsonb,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_to_roles" ADD CONSTRAINT "user_to_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_to_roles" ADD CONSTRAINT "user_to_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_to_roles" ADD CONSTRAINT "user_to_roles_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo_history_logs" ADD CONSTRAINT "elo_history_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo_history_logs" ADD CONSTRAINT "elo_history_logs_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo_tiers" ADD CONSTRAINT "elo_tiers_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ranks" ADD CONSTRAINT "user_ranks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ranks" ADD CONSTRAINT "user_ranks_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ranks" ADD CONSTRAINT "user_ranks_tier_id_elo_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."elo_tiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communities" ADD CONSTRAINT "communities_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communities" ADD CONSTRAINT "communities_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_sports" ADD CONSTRAINT "community_sports_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_sports" ADD CONSTRAINT "community_sports_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_courts" ADD CONSTRAINT "venue_courts_venue_id_tournament_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."tournament_venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_groups" ADD CONSTRAINT "tournament_groups_stage_id_tournament_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."tournament_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_participants" ADD CONSTRAINT "tournament_participants_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_participants" ADD CONSTRAINT "tournament_participants_group_id_tournament_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."tournament_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_participants" ADD CONSTRAINT "tournament_participants_registered_by_users_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_rosters" ADD CONSTRAINT "tournament_rosters_participant_id_tournament_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."tournament_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_rosters" ADD CONSTRAINT "tournament_rosters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_stages" ADD CONSTRAINT "tournament_stages_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_venue_id_tournament_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."tournament_venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_standings" ADD CONSTRAINT "group_standings_group_id_tournament_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."tournament_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_standings" ADD CONSTRAINT "group_standings_participant_id_tournament_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."tournament_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_disputes" ADD CONSTRAINT "match_disputes_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_disputes" ADD CONSTRAINT "match_disputes_filed_by_users_id_fk" FOREIGN KEY ("filed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_disputes" ADD CONSTRAINT "match_disputes_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_participant_id_tournament_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."tournament_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_group_id_tournament_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."tournament_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_participant1_id_tournament_participants_id_fk" FOREIGN KEY ("participant1_id") REFERENCES "public"."tournament_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_participant2_id_tournament_participants_id_fk" FOREIGN KEY ("participant2_id") REFERENCES "public"."tournament_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_winner_id_tournament_participants_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."tournament_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_court_id_venue_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."venue_courts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_referee_id_users_id_fk" FOREIGN KEY ("referee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_score_confirmed_by_users_id_fk" FOREIGN KEY ("score_confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizer_payouts" ADD CONSTRAINT "organizer_payouts_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizer_payouts" ADD CONSTRAINT "organizer_payouts_organizer_id_users_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizer_payouts" ADD CONSTRAINT "organizer_payouts_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_status_logs" ADD CONSTRAINT "payment_status_logs_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_status_logs" ADD CONSTRAINT "payment_status_logs_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_participant_id_tournament_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."tournament_participants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_status_logs" ADD CONSTRAINT "payout_status_logs_payout_id_organizer_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."organizer_payouts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_status_logs" ADD CONSTRAINT "payout_status_logs_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_room_id_chat_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_room_members" ADD CONSTRAINT "chat_room_members_room_id_chat_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_room_members" ADD CONSTRAINT "chat_room_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_receiver_id_users_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_comments" ADD CONSTRAINT "match_comments_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_comments" ADD CONSTRAINT "match_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_reactions" ADD CONSTRAINT "match_reactions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_reactions" ADD CONSTRAINT "match_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_receiver_id_users_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
