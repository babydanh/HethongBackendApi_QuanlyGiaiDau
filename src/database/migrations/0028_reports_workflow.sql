ALTER TABLE "reports"
  ADD COLUMN IF NOT EXISTS "source" varchar(50) NOT NULL DEFAULT 'USER_REPORT',
  ADD COLUMN IF NOT EXISTS "source_reference_id" uuid,
  ADD COLUMN IF NOT EXISTS "category" varchar(50) NOT NULL DEFAULT 'OTHER',
  ADD COLUMN IF NOT EXISTS "assigned_to" uuid,
  ADD COLUMN IF NOT EXISTS "triaged_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone NOT NULL DEFAULT now();

UPDATE "reports"
SET "status" = 'SUBMITTED', "updated_at" = now()
WHERE "status" = 'PENDING';

ALTER TABLE "reports"
  ALTER COLUMN "status" SET DEFAULT 'SUBMITTED';

ALTER TABLE "reports"
  ADD CONSTRAINT "reports_assigned_to_users_id_fk"
  FOREIGN KEY ("assigned_to") REFERENCES "users"("id")
  ON DELETE SET NULL;

ALTER TABLE "reports"
  ADD CONSTRAINT "reports_target_type_check"
  CHECK ("target_type" IN ('USER', 'TOURNAMENT', 'MATCH', 'COMMUNITY')),
  ADD CONSTRAINT "reports_source_check"
  CHECK ("source" IN ('USER_REPORT', 'LEGACY_DISPUTE')),
  ADD CONSTRAINT "reports_category_check"
  CHECK ("category" IN (
    'CHEATING',
    'RULE_VIOLATION',
    'ABUSIVE_BEHAVIOR',
    'FAKE_INFORMATION',
    'PAYMENT_FRAUD',
    'UNSAFE_ORGANIZATION',
    'OTHER'
  )),
  ADD CONSTRAINT "reports_status_check"
  CHECK ("status" IN (
    'SUBMITTED',
    'TRIAGED',
    'UNDER_REVIEW',
    'ESCALATED',
    'RESOLVED',
    'REJECTED'
  ));

CREATE INDEX IF NOT EXISTS "reports_queue_idx"
  ON "reports" ("status", "target_type", "category", "created_at");
CREATE INDEX IF NOT EXISTS "reports_reporter_idx"
  ON "reports" ("reporter_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "reports_unique_open_idx"
  ON "reports" ("reporter_id", "target_type", "target_id", "category")
  WHERE "status" NOT IN ('RESOLVED', 'REJECTED');
CREATE UNIQUE INDEX IF NOT EXISTS "reports_source_reference_unique_idx"
  ON "reports" ("source", "source_reference_id")
  WHERE "source_reference_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "reports_source_reference_idx"
  ON "reports" ("source_reference_id");

CREATE TABLE IF NOT EXISTS "report_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "report_id" uuid NOT NULL,
  "actor_id" uuid,
  "action" varchar(50) NOT NULL,
  "from_status" varchar(50),
  "to_status" varchar(50) NOT NULL,
  "note" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "report_actions_report_id_reports_id_fk"
    FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE,
  CONSTRAINT "report_actions_actor_id_users_id_fk"
    FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "report_actions_timeline_idx"
  ON "report_actions" ("report_id", "created_at");

INSERT INTO "report_actions" (
  "report_id",
  "actor_id",
  "action",
  "from_status",
  "to_status",
  "note",
  "created_at"
)
SELECT
  r."id",
  r."reporter_id",
  'LEGACY_IMPORT',
  NULL,
  r."status",
  'Khởi tạo lịch sử từ báo cáo có sẵn trước migration',
  r."created_at"
FROM "reports" r
WHERE NOT EXISTS (
  SELECT 1 FROM "report_actions" ra WHERE ra."report_id" = r."id"
);

-- Không drop hoặc sửa dữ liệu bảng match_disputes trong migration này.
