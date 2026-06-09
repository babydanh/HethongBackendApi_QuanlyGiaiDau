ALTER TABLE "user_ranks" ADD COLUMN "community_id" uuid;--> statement-breakpoint
ALTER TABLE "user_ranks" ADD COLUMN "match_type" varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "match_type" varchar(50) DEFAULT 'DOUBLES' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_ranks" ADD CONSTRAINT "user_ranks_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ranks" ADD CONSTRAINT "user_category_rank_unique_idx" UNIQUE("user_id","category_id","match_type","community_id");