-- P2C.1: Tag BQT cho thành viên cộng đồng.
-- Column text[] đơn giản (hiển thị trực tiếp, không query theo tag); streak tính động KHÔNG lưu.
-- Rollback: ALTER TABLE "community_members" DROP COLUMN IF EXISTS "tags";
--> statement-breakpoint
ALTER TABLE "community_members"
  ADD COLUMN IF NOT EXISTS "tags" text[] NOT NULL DEFAULT '{}';
