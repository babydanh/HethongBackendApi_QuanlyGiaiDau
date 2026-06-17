-- Phase 5 Stage 2: Create tournament_divisions table
-- Separates tournament divisions into dedicated table for better data modeling

CREATE TABLE "tournament_divisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tournament_id" uuid NOT NULL REFERENCES "tournaments"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "match_type" varchar(50) NOT NULL,
  "gender_restriction" varchar(20),
  "max_participants" integer,
  "entry_fee" numeric(12, 2) NOT NULL DEFAULT '0.00',
  "status" varchar(50) NOT NULL DEFAULT 'DRAFT',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tournament_divisions_unique_idx" UNIQUE ("tournament_id", "match_type", "gender_restriction"),
  CONSTRAINT "valid_division_status" CHECK ("status" IN ('DRAFT', 'OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  CONSTRAINT "valid_match_type" CHECK ("match_type" IN ('SINGLES', 'DOUBLES', 'MIXED_DOUBLES')),
  CONSTRAINT "valid_gender_restriction" CHECK ("gender_restriction" IS NULL OR "gender_restriction" IN ('MALE', 'FEMALE', 'MIXED'))
);--> statement-breakpoint

-- Create indexes for performance
CREATE INDEX "idx_tournament_divisions_tournament_id" ON "tournament_divisions" ("tournament_id");--> statement-breakpoint
CREATE INDEX "idx_tournament_divisions_match_type" ON "tournament_divisions" ("match_type");--> statement-breakpoint
CREATE INDEX "idx_tournament_divisions_status" ON "tournament_divisions" ("status");--> statement-breakpoint
CREATE INDEX "idx_tournament_divisions_created_at" ON "tournament_divisions" ("created_at" DESC);--> statement-breakpoint

-- Migrate data from tournaments (where parent_id IS NOT NULL)
INSERT INTO "tournament_divisions" ("id", "tournament_id", "name", "match_type", "gender_restriction", "max_participants", "entry_fee", "status", "created_at")
SELECT 
  "id",
  "parent_id",
  "name",
  COALESCE("match_type", 'DOUBLES'),
  "gender_restriction",
  "max_participants",
  "entry_fee",
  COALESCE("status", 'DRAFT'),
  COALESCE("created_at", now())
FROM "tournaments"
WHERE "parent_id" IS NOT NULL AND "deleted_at" IS NULL;--> statement-breakpoint

-- Add tournament_division_id column to tournament_participants
ALTER TABLE "tournament_participants" ADD COLUMN "tournament_division_id" uuid REFERENCES "tournament_divisions"("id") ON DELETE CASCADE;--> statement-breakpoint

-- Migrate data: tournament_id pointing to divisions now becomes tournament_division_id
UPDATE "tournament_participants" 
SET "tournament_division_id" = "tournament_id"
WHERE "tournament_id" IN (
  SELECT "id" FROM "tournament_divisions"
);--> statement-breakpoint

-- Add tournament_division_id column to tournament_stages
ALTER TABLE "tournament_stages" ADD COLUMN "tournament_division_id" uuid REFERENCES "tournament_divisions"("id") ON DELETE CASCADE;--> statement-breakpoint

-- Migrate data: tournament_id pointing to divisions now becomes tournament_division_id
UPDATE "tournament_stages" 
SET "tournament_division_id" = "tournament_id"
WHERE "tournament_id" IN (
  SELECT "id" FROM "tournament_divisions"
);--> statement-breakpoint

-- Add division_id column to payments for optional division-level fee tracking
ALTER TABLE "payments" ADD COLUMN "division_id" uuid REFERENCES "tournament_divisions"("id") ON DELETE CASCADE;--> statement-breakpoint
