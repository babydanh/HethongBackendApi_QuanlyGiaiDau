ALTER TABLE "advertisements" ADD COLUMN IF NOT EXISTS "category_id" uuid;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "advertisements"
    ADD CONSTRAINT "advertisements_category_id_categories_id_fk"
    FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advertisements_category_id_idx"
  ON "advertisements" USING btree ("category_id");
