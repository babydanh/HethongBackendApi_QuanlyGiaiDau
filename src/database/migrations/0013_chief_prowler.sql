ALTER TABLE "communities" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';--> statement-breakpoint
ALTER TABLE "organizer_payouts" ALTER COLUMN "bank_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "organizer_payouts" ALTER COLUMN "bank_account_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "organizer_payouts" ALTER COLUMN "bank_account_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "organizer_payouts" ADD COLUMN "hold_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizer_payouts" ADD COLUMN "payout_trigger" varchar(50) DEFAULT 'MANUAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizer_payouts" ADD COLUMN "disbursed_at" timestamp with time zone;