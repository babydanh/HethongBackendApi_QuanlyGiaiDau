CREATE TABLE "psr_point_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"standing_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"rank_achieved" integer NOT NULL,
	"base_points" integer NOT NULL,
	"bonus_points" integer DEFAULT 0 NOT NULL,
	"multiplier" real DEFAULT 1 NOT NULL,
	"total_points" integer NOT NULL,
	"is_direct_entry" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "series_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"leg_id" uuid NOT NULL,
	"tournament_id" uuid NOT NULL,
	"region" varchar(100),
	"order" integer NOT NULL,
	"point_multiplier" real DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "series_events_tournament_id_unique" UNIQUE("tournament_id")
);
--> statement-breakpoint
CREATE TABLE "series_legs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"series_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"order" integer NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"status" varchar(50) DEFAULT 'UPCOMING' NOT NULL,
	"direct_entry_slots" integer DEFAULT 2 NOT NULL,
	"wildcard_slots" integer DEFAULT 16 NOT NULL,
	"rules_override" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "series_standings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"leg_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"total_psr_points" integer DEFAULT 0 NOT NULL,
	"events_played" integer DEFAULT 0 NOT NULL,
	"best_rank" integer,
	"direct_entry" boolean DEFAULT false NOT NULL,
	"wildcard_entry" boolean DEFAULT false NOT NULL,
	"locked_out" boolean DEFAULT false NOT NULL,
	"qualified_event_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"banner_url" text,
	"logo_url" text,
	"organizer_id" uuid NOT NULL,
	"status" varchar(50) DEFAULT 'DRAFT' NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"total_prize" numeric(12, 2),
	"rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"visibility" varchar(50) DEFAULT 'PUBLIC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "tournament_series_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "psr_point_logs" ADD CONSTRAINT "psr_point_logs_standing_id_series_standings_id_fk" FOREIGN KEY ("standing_id") REFERENCES "public"."series_standings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psr_point_logs" ADD CONSTRAINT "psr_point_logs_event_id_series_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."series_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psr_point_logs" ADD CONSTRAINT "psr_point_logs_participant_id_tournament_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."tournament_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_events" ADD CONSTRAINT "series_events_leg_id_series_legs_id_fk" FOREIGN KEY ("leg_id") REFERENCES "public"."series_legs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_events" ADD CONSTRAINT "series_events_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_legs" ADD CONSTRAINT "series_legs_series_id_tournament_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."tournament_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_standings" ADD CONSTRAINT "series_standings_leg_id_series_legs_id_fk" FOREIGN KEY ("leg_id") REFERENCES "public"."series_legs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_standings" ADD CONSTRAINT "series_standings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_standings" ADD CONSTRAINT "series_standings_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_standings" ADD CONSTRAINT "series_standings_qualified_event_id_series_events_id_fk" FOREIGN KEY ("qualified_event_id") REFERENCES "public"."series_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_series" ADD CONSTRAINT "tournament_series_organizer_id_users_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;