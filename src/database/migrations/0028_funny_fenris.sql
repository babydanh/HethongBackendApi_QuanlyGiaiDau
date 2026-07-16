CREATE TABLE "livestream_cameras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"mode" varchar(20) DEFAULT 'PUSH' NOT NULL,
	"protocol" varchar(20) DEFAULT 'RTMP' NOT NULL,
	"stream_name" varchar(255) NOT NULL,
	"stream_key" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'IDLE' NOT NULL,
	"playback_url" text,
	"rtsp_url_encrypted" text,
	"username_encrypted" text,
	"password_encrypted" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "match_livestreams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"camera_id" uuid,
	"stream_status" varchar(20) DEFAULT 'IDLE' NOT NULL,
	"playback_url" text,
	"recording_url" text,
	"is_featured" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pair_ranks" DROP CONSTRAINT "user_pair_category_unique_idx";--> statement-breakpoint
ALTER TABLE "community_rankings" DROP CONSTRAINT "community_user_category_unique";--> statement-breakpoint
ALTER TABLE "pair_ranks" ADD COLUMN "match_type" varchar(50) DEFAULT 'DOUBLES' NOT NULL;--> statement-breakpoint
ALTER TABLE "pair_ranks" ADD COLUMN "gender_restriction" varchar(20);--> statement-breakpoint
ALTER TABLE "pair_ranks" ADD COLUMN "scope" varchar(20) DEFAULT 'PUBLIC' NOT NULL;--> statement-breakpoint
ALTER TABLE "pair_ranks" ADD COLUMN "community_id" uuid;--> statement-breakpoint
ALTER TABLE "tournament_participants" ADD COLUMN "is_wildcard" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "community_rankings" ADD COLUMN "match_type" varchar(50) DEFAULT 'SINGLES' NOT NULL;--> statement-breakpoint
ALTER TABLE "community_rankings" ADD COLUMN "gender_restriction" varchar(20);--> statement-breakpoint
ALTER TABLE "livestream_cameras" ADD CONSTRAINT "livestream_cameras_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "livestream_cameras" ADD CONSTRAINT "livestream_cameras_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_livestreams" ADD CONSTRAINT "match_livestreams_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_livestreams" ADD CONSTRAINT "match_livestreams_camera_id_livestream_cameras_id_fk" FOREIGN KEY ("camera_id") REFERENCES "public"."livestream_cameras"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "livestream_cameras_stream_name_unique_idx" ON "livestream_cameras" USING btree ("stream_name");--> statement-breakpoint
CREATE INDEX "idx_livestream_cameras_tournament" ON "livestream_cameras" USING btree ("tournament_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_livestreams_match_unique_idx" ON "match_livestreams" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "idx_match_livestreams_camera" ON "match_livestreams" USING btree ("camera_id");--> statement-breakpoint
ALTER TABLE "pair_ranks" ADD CONSTRAINT "pair_ranks_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_pair_rank_context_idx" ON "pair_ranks" USING btree ("user1_id","user2_id","category_id","match_type","scope",COALESCE("gender_restriction", ''),COALESCE("community_id"::text, ''));--> statement-breakpoint
CREATE INDEX "idx_groups_stage_id" ON "tournament_groups" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX "idx_participants_tournament_status" ON "tournament_participants" USING btree ("tournament_id","team_status");--> statement-breakpoint
CREATE INDEX "idx_participants_tournament_id" ON "tournament_participants" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "idx_stages_tournament_division" ON "tournament_stages" USING btree ("tournament_id","tournament_division_id");--> statement-breakpoint
CREATE INDEX "idx_tournaments_status_visibility" ON "tournaments" USING btree ("status","visibility");--> statement-breakpoint
CREATE INDEX "idx_tournaments_created_by" ON "tournaments" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_standings_group_id" ON "group_standings" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_receiver_read" ON "notifications" USING btree ("receiver_id","is_read");--> statement-breakpoint
CREATE UNIQUE INDEX "community_rank_null_gender_idx" ON "community_rankings" USING btree ("community_id","user_id","category_id","match_type") WHERE "community_rankings"."gender_restriction" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "community_rank_with_gender_idx" ON "community_rankings" USING btree ("community_id","user_id","category_id","match_type","gender_restriction") WHERE "community_rankings"."gender_restriction" IS NOT NULL;