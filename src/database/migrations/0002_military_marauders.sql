CREATE TABLE "community_gallery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"community_id" uuid NOT NULL,
	"uploader_id" uuid,
	"image_url" text NOT NULL,
	"caption" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "social_links" jsonb;--> statement-breakpoint
ALTER TABLE "community_gallery" ADD CONSTRAINT "community_gallery_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_gallery" ADD CONSTRAINT "community_gallery_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;