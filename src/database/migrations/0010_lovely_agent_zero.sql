ALTER TABLE "tournaments" ALTER COLUMN "status" SET DEFAULT 'DRAFT';--> statement-breakpoint
ALTER TABLE "tournament_stages" ADD COLUMN "round_config" jsonb;--> statement-breakpoint
ALTER TABLE "tournament_stages" ADD COLUMN "venue_id" uuid;--> statement-breakpoint
ALTER TABLE "tournament_stages" ADD COLUMN "scheduled_date" date;--> statement-breakpoint
ALTER TABLE "tournament_stages" ADD COLUMN "notification_note" text;--> statement-breakpoint
ALTER TABLE "tournament_stages" ADD CONSTRAINT "tournament_stages_venue_id_tournament_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."tournament_venues"("id") ON DELETE set null ON UPDATE no action;