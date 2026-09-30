-- Migration: gắn camera livestream vào sân để khai URL phát tại setting sân.
-- tournament_id giữ NOT NULL: sân vẫn thuộc giải, chỉ bổ sung liên kết tới sân.
-- SET NULL chứ không CASCADE: xoá sân (hoặc xoá venue, cascade xuống venue_courts)
-- không được làm mất vĩnh viễn URL mà BTC đã khai. Camera sống, mất liên kết, gán lại là xong.
-- Không đặt unique index theo court_id: cùng một sân có thể được khai lại URL mới cho
-- giải khác, hoặc thay URL khi thiết bị đổi. Việc chọn camera nào đang phục vụ do
-- query theo (court_id, tournament_id) quyết định, không phải bằng ràng buộc DB.
--> statement-breakpoint
ALTER TABLE "livestream_cameras"
  ADD COLUMN IF NOT EXISTS "court_id" uuid REFERENCES "venue_courts"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_livestream_cameras_court"
  ON "livestream_cameras" USING btree ("court_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_livestream_cameras_court_tournament"
  ON "livestream_cameras" USING btree ("court_id", "tournament_id");
