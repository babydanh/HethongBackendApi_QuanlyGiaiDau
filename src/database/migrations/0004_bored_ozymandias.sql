ALTER TABLE "users" ADD COLUMN "accepted_tos_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tournament_venues" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "registration_start_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "registration_end_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "max_participants" integer;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "is_bye" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refund_status" varchar(50);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refunded_amount" numeric(12, 2) DEFAULT '0.00';