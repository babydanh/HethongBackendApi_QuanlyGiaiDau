CREATE TABLE "community_follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_community_follow" UNIQUE("community_id","user_id","type")
);
--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "province_code" varchar(20);--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "district_code" varchar(20);--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "ward_code" varchar(20);--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "visibility" varchar(50) DEFAULT 'PUBLIC' NOT NULL;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "join_mode" varchar(50) DEFAULT 'OPEN' NOT NULL;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "join_questions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "rules" text;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "max_members" integer;--> statement-breakpoint
ALTER TABLE "community_members" ADD COLUMN "invited_by" uuid;--> statement-breakpoint
ALTER TABLE "community_members" ADD COLUMN "join_answers" jsonb;--> statement-breakpoint
ALTER TABLE "community_members" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "community_members" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "community_follows" ADD CONSTRAINT "community_follows_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_follows" ADD CONSTRAINT "community_follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communities" ADD CONSTRAINT "communities_province_code_provinces_code_fk" FOREIGN KEY ("province_code") REFERENCES "public"."provinces"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communities" ADD CONSTRAINT "communities_district_code_districts_code_fk" FOREIGN KEY ("district_code") REFERENCES "public"."districts"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communities" ADD CONSTRAINT "communities_ward_code_wards_code_fk" FOREIGN KEY ("ward_code") REFERENCES "public"."wards"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;