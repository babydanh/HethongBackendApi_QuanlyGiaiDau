CREATE TABLE IF NOT EXISTS "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"target_type" varchar(50) NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"evidence_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" varchar(50) DEFAULT 'PENDING' NOT NULL,
	"resolved_by" uuid,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tournament_staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(50) NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"payment_id" uuid,
	"refund_id" uuid,
	"payout_id" uuid,
	"entry_type" varchar(50) NOT NULL,
	"direction" varchar(10) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_ledger_entries_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "ledger_amount_positive" CHECK ("financial_ledger_entries"."amount" > 0),
	CONSTRAINT "ledger_direction_valid" CHECK ("financial_ledger_entries"."direction" IN ('CREDIT', 'DEBIT'))
);
--> statement-breakpoint
CREATE TABLE "payment_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"status" varchar(50) DEFAULT 'REQUESTED' NOT NULL,
	"reason" text NOT NULL,
	"bank_name" varchar(100),
	"bank_account_number" varchar(50),
	"bank_account_name" varchar(255),
	"transaction_proof_url" text,
	"requested_by" uuid,
	"processed_by" uuid,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_refund_amount_positive" CHECK ("payment_refunds"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "match_muted_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"muted_by" uuid,
	"reason" text,
	"type" varchar(20) DEFAULT 'MUTE' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"actor_id" uuid,
	"action" varchar(50) NOT NULL,
	"from_status" varchar(50),
	"to_status" varchar(50) NOT NULL,
	"note" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(20) NOT NULL,
	"code" varchar(10) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"is_used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "status" SET DEFAULT 'SUBMITTED';--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "purpose" varchar(50) DEFAULT 'REGISTRATION_FEE' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider_order_code" varchar(50);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider_transaction_id" varchar(255);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "idempotency_key" varchar(255);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "source" varchar(50) DEFAULT 'USER_REPORT' NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "source_reference_id" uuid;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "category" varchar(50) DEFAULT 'OTHER' NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "assigned_to" uuid;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "triaged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "tournament_staff" ADD CONSTRAINT "tournament_staff_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_staff" ADD CONSTRAINT "tournament_staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_staff" ADD CONSTRAINT "tournament_staff_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_ledger_entries" ADD CONSTRAINT "financial_ledger_entries_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_ledger_entries" ADD CONSTRAINT "financial_ledger_entries_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_ledger_entries" ADD CONSTRAINT "financial_ledger_entries_refund_id_payment_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."payment_refunds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_ledger_entries" ADD CONSTRAINT "financial_ledger_entries_payout_id_organizer_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."organizer_payouts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_ledger_entries" ADD CONSTRAINT "financial_ledger_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_muted_users" ADD CONSTRAINT "match_muted_users_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_muted_users" ADD CONSTRAINT "match_muted_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_muted_users" ADD CONSTRAINT "match_muted_users_muted_by_users_id_fk" FOREIGN KEY ("muted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_actions" ADD CONSTRAINT "report_actions_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_actions" ADD CONSTRAINT "report_actions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_actions_timeline_idx" ON "report_actions" USING btree ("report_id","created_at");--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_order_code_uidx" ON "payments" USING btree ("provider_order_code");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idempotency_key_uidx" ON "payments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "reports_queue_idx" ON "reports" USING btree ("status","target_type","category","created_at");--> statement-breakpoint
CREATE INDEX "reports_reporter_idx" ON "reports" USING btree ("reporter_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_unique_open_idx" ON "reports" USING btree ("reporter_id","target_type","target_id","category") WHERE "reports"."status" not in ('RESOLVED', 'REJECTED');--> statement-breakpoint
CREATE UNIQUE INDEX "reports_source_reference_unique_idx" ON "reports" USING btree ("source","source_reference_id") WHERE "reports"."source_reference_id" is not null;--> statement-breakpoint
CREATE INDEX "reports_source_reference_idx" ON "reports" USING btree ("source_reference_id");--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_type_check" CHECK ("reports"."target_type" in ('USER', 'TOURNAMENT', 'MATCH', 'COMMUNITY'));--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_source_check" CHECK ("reports"."source" in ('USER_REPORT', 'LEGACY_DISPUTE'));--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_category_check" CHECK ("reports"."category" in ('CHEATING', 'RULE_VIOLATION', 'ABUSIVE_BEHAVIOR', 'FAKE_INFORMATION', 'PAYMENT_FRAUD', 'UNSAFE_ORGANIZATION', 'OTHER'));--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_status_check" CHECK ("reports"."status" in ('SUBMITTED', 'TRIAGED', 'UNDER_REVIEW', 'ESCALATED', 'RESOLVED', 'REJECTED'));