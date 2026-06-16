ALTER TABLE "profiles" ADD COLUMN "cover_url" text;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "is_registration_locked" boolean DEFAULT false NOT NULL;