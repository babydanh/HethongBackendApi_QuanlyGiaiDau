ALTER TABLE "user_ranks" ALTER COLUMN "elo_points" SET DEFAULT 1000;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "province_code" varchar(20);--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_province_code_provinces_code_fk" FOREIGN KEY ("province_code") REFERENCES "public"."provinces"("code") ON DELETE set null ON UPDATE no action;