CREATE TABLE "community_rankings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"elo_points" integer DEFAULT 1000 NOT NULL,
	"matches_played" integer DEFAULT 0 NOT NULL,
	"matches_won" integer DEFAULT 0 NOT NULL,
	"win_streak" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_user_category_unique" UNIQUE("community_id","user_id","category_id"),
	CONSTRAINT "community_elo_non_negative" CHECK ("community_rankings"."elo_points" >= 0)
);
--> statement-breakpoint
ALTER TABLE "user_ranks" ADD COLUMN "win_streak" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tournament_participants" ADD COLUMN "team_invite_token" varchar(50);--> statement-breakpoint
ALTER TABLE "tournament_participants" ADD COLUMN "team_status" varchar(50) DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "visibility" varchar(50) DEFAULT 'PUBLIC' NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "gender_restriction" varchar(20);--> statement-breakpoint
ALTER TABLE "community_rankings" ADD CONSTRAINT "community_rankings_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_rankings" ADD CONSTRAINT "community_rankings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_rankings" ADD CONSTRAINT "community_rankings_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_participants" ADD CONSTRAINT "tournament_participants_team_invite_token_unique" UNIQUE("team_invite_token");