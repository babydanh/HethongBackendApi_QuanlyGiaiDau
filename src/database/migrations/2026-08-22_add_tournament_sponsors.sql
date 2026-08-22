CREATE TABLE IF NOT EXISTS "tournament_sponsors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" uuid NOT NULL,
  "display_name" varchar(160) NOT NULL,
  "tier" varchar(30) DEFAULT 'GOLD' NOT NULL,
  "logo_url" text NOT NULL,
  "website_url" text,
  "short_description" varchar(500),
  "display_order" integer DEFAULT 0 NOT NULL,
  "status" varchar(20) DEFAULT 'DRAFT' NOT NULL,
  "is_public" boolean DEFAULT true NOT NULL,
  "start_at" timestamp with time zone,
  "end_at" timestamp with time zone,
  "created_by" uuid NOT NULL,
  "updated_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "tournament_sponsors_tournament_fk" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE cascade,
  CONSTRAINT "tournament_sponsors_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE restrict,
  CONSTRAINT "tournament_sponsors_updated_by_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE restrict,
  CONSTRAINT "tournament_sponsors_display_order_non_negative" CHECK ("display_order" >= 0),
  CONSTRAINT "tournament_sponsors_display_window_valid" CHECK ("start_at" IS NULL OR "end_at" IS NULL OR "start_at" <= "end_at"),
  CONSTRAINT "tournament_sponsors_tier_valid" CHECK ("tier" IN ('TITLE', 'DIAMOND', 'GOLD', 'SILVER', 'BRONZE', 'IN_KIND')),
  CONSTRAINT "tournament_sponsors_status_valid" CHECK ("status" IN ('DRAFT', 'PUBLISHED', 'HIDDEN', 'ARCHIVED'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tournament_sponsors_tournament_lifecycle"
  ON "tournament_sponsors" ("tournament_id", "status", "is_public", "display_order");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tournament_sponsors_display_window"
  ON "tournament_sponsors" ("tournament_id", "start_at", "end_at");
