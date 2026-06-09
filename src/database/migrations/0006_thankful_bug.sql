CREATE TABLE "districts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"name_en" varchar(255),
	"full_name" varchar(255),
	"full_name_en" varchar(255),
	"code_name" varchar(255),
	"province_code" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "districts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "provinces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"name_en" varchar(255),
	"full_name" varchar(255),
	"full_name_en" varchar(255),
	"code_name" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provinces_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "wards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"name_en" varchar(255),
	"full_name" varchar(255),
	"full_name_en" varchar(255),
	"code_name" varchar(255),
	"district_code" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wards_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "districts" ADD CONSTRAINT "districts_province_code_provinces_code_fk" FOREIGN KEY ("province_code") REFERENCES "public"."provinces"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wards" ADD CONSTRAINT "wards_district_code_districts_code_fk" FOREIGN KEY ("district_code") REFERENCES "public"."districts"("code") ON DELETE cascade ON UPDATE no action;