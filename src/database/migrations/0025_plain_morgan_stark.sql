ALTER TABLE "profiles" ADD COLUMN "bank_name" varchar(100);--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "bank_account_number" varchar(50);--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "bank_account_name" varchar(255);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refund_bank_name" varchar(100);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refund_account_number" varchar(50);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refund_account_name" varchar(255);