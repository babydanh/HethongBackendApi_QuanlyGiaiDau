CREATE TABLE "community_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenger_id" uuid NOT NULL,
	"challenged_id" uuid NOT NULL,
	"sender_user_id" uuid NOT NULL,
	"status" varchar(50) DEFAULT 'PENDING' NOT NULL,
	"message" text,
	"scheduled_at" timestamp with time zone,
	"tournament_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "platform_fee_per_player" integer DEFAULT 10000 NOT NULL;--> statement-breakpoint
ALTER TABLE "community_challenges" ADD CONSTRAINT "community_challenges_challenger_id_communities_id_fk" FOREIGN KEY ("challenger_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_challenges" ADD CONSTRAINT "community_challenges_challenged_id_communities_id_fk" FOREIGN KEY ("challenged_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_challenges" ADD CONSTRAINT "community_challenges_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_challenges" ADD CONSTRAINT "community_challenges_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE set null ON UPDATE no action;