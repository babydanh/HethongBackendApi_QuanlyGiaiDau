-- Migration: Add peak_elo, last_active_at, last_decay_at and missing columns to ranks & payments
ALTER TABLE "user_ranks" ADD COLUMN IF NOT EXISTS "peak_elo" integer DEFAULT 1000 NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_ranks" ADD COLUMN IF NOT EXISTS "last_active_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_ranks" ADD COLUMN IF NOT EXISTS "last_decay_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "community_rankings" ADD COLUMN IF NOT EXISTS "peak_elo" integer DEFAULT 1000 NOT NULL;
--> statement-breakpoint
ALTER TABLE "community_rankings" ADD COLUMN IF NOT EXISTS "last_active_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "community_rankings" ADD COLUMN IF NOT EXISTS "last_decay_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "pair_ranks" ADD COLUMN IF NOT EXISTS "peak_elo" integer DEFAULT 1000 NOT NULL;
--> statement-breakpoint
ALTER TABLE "pair_ranks" ADD COLUMN IF NOT EXISTS "last_active_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "pair_ranks" ADD COLUMN IF NOT EXISTS "last_decay_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "division_id" uuid;
