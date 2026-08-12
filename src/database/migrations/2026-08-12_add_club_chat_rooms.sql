-- P2D.1: Club Chat — room type CLUB.
--
-- EXPAND (không xoá dữ liệu cũ):
--   * Preflight: chat_rooms.type là varchar(50) trong DB (enum chỉ tồn tại ở DTO) →
--     CLUB chỉ là một giá trị chuỗi hợp lệ, KHÔNG cần migration enum.
--     Xác nhận: SELECT column_type FROM information_schema.columns
--     WHERE table_name='chat_rooms' AND column_name='type';  → phải là character varying.
--   * community_id uuid NULL REFERENCES communities(id) ON DELETE CASCADE
--     (row DIRECT/GROUP/SUPPORT cũ không bị ảnh hưởng, community_id = NULL).
--   * club_name / club_avatar denormalized — snapshot lúc tạo room
--     (đổi tên/logo CLB sau này KHÔNG cập nhật room; lazy-create mới lấy giá trị mới).
--   * Partial unique uq_chat_rooms_club_community: tối đa 1 room CLUB / community.
--
-- ROLLBACK (code trước, DB sau — tắt feature/routes CLUB trước khi chạy):
--   1. Archive message CLUB nếu cần:
--        SELECT * FROM chat_messages WHERE room_id IN
--          (SELECT id FROM chat_rooms WHERE type='CLUB');
--   2. DELETE FROM chat_room_members WHERE room_id IN
--        (SELECT id FROM chat_rooms WHERE type='CLUB');   -- (thường rỗng: membership động)
--   3. DELETE FROM chat_messages WHERE room_id IN
--        (SELECT id FROM chat_rooms WHERE type='CLUB');
--   4. DELETE FROM chat_rooms WHERE type='CLUB';
--   5. DROP INDEX IF EXISTS uq_chat_rooms_club_community;
--   6. ALTER TABLE chat_rooms
--        DROP COLUMN IF EXISTS club_avatar,
--        DROP COLUMN IF EXISTS club_name,
--        DROP COLUMN IF EXISTS community_id;
--   Test down trên clone có đủ 4 loại room (DIRECT/GROUP/SUPPORT/CLUB);
--   không cascade message ngoài ý muốn (chat_messages.room_id FK ON DELETE CASCADE —
--   xoá room CLUB ở bước 4 sẽ xoá message CLUB theo, đã export ở bước 1).
--> statement-breakpoint
ALTER TABLE "chat_rooms"
  ADD COLUMN IF NOT EXISTS "community_id" uuid REFERENCES "communities"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "chat_rooms"
  ADD COLUMN IF NOT EXISTS "club_name" varchar(255);
--> statement-breakpoint
ALTER TABLE "chat_rooms"
  ADD COLUMN IF NOT EXISTS "club_avatar" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_rooms_club_community
  ON "chat_rooms" ("community_id")
  WHERE "type" = 'CLUB';
