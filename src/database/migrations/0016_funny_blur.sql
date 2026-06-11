ALTER TABLE "users" ADD COLUMN "is_mock" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "parent_tournaments" ADD COLUMN "sports" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tournament_participants" ADD COLUMN "is_mock" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tournament_stages" ADD COLUMN "match_settings" jsonb;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "city" varchar(100);--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "reserved_slots_count" integer DEFAULT 0 NOT NULL;