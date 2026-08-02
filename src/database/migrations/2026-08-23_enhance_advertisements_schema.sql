-- Enhance advertisements table with additional fields for standard international ad management
ALTER TABLE "advertisements" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "advertisements" ADD COLUMN IF NOT EXISTS "banner_type" varchar(50) DEFAULT 'IMAGE_LINK' NOT NULL;
ALTER TABLE "advertisements" ADD COLUMN IF NOT EXISTS "cta_text" varchar(100);
ALTER TABLE "advertisements" ADD COLUMN IF NOT EXISTS "custom_html" text;
ALTER TABLE "advertisements" ADD COLUMN IF NOT EXISTS "display_order" integer DEFAULT 0 NOT NULL;
ALTER TABLE "advertisements" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

-- Make imageUrl and targetUrl nullable for custom HTML banners
ALTER TABLE "advertisements" ALTER COLUMN "image_url" DROP NOT NULL;
ALTER TABLE "advertisements" ALTER COLUMN "target_url" DROP NOT NULL;

-- Make startDate and endDate nullable for perpetual/immediate banners
ALTER TABLE "advertisements" ALTER COLUMN "start_date" DROP NOT NULL;
ALTER TABLE "advertisements" ALTER COLUMN "end_date" DROP NOT NULL;

-- Update constraint
ALTER TABLE "advertisements" DROP CONSTRAINT IF EXISTS "ads_date_valid";
ALTER TABLE "advertisements" ADD CONSTRAINT "ads_date_valid" CHECK ("advertisements"."start_date" IS NULL OR "advertisements"."end_date" IS NULL OR "advertisements"."start_date" < "advertisements"."end_date");
