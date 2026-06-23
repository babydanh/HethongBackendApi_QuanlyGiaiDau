CREATE TABLE IF NOT EXISTS "user_change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"request_type" varchar(50) NOT NULL,
	"old_value" text NOT NULL,
	"new_value" text NOT NULL,
	"status" varchar(50) DEFAULT 'PENDING' NOT NULL,
	"admin_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "is_gender_locked" boolean DEFAULT false NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_phone_verified" boolean DEFAULT false NOT NULL;
