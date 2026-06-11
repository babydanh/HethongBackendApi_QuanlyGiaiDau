CREATE TABLE "parent_tournaments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"banner_url" text,
	"logo_url" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "parent_tournaments" ADD CONSTRAINT "parent_tournaments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_parent_id_parent_tournaments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."parent_tournaments"("id") ON DELETE cascade ON UPDATE no action;