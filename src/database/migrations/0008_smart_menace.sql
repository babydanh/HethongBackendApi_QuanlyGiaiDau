ALTER TABLE "tournaments" ADD COLUMN "tournament_type" varchar(50) DEFAULT 'CLUB' NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "banner_url" text;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "gallery_images" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "prize_description" text;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "prizes" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "invite_code" varchar(20);--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "contact_info" jsonb;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_invite_code_unique" UNIQUE("invite_code");