-- Social: hỗ trợ khách ngoài CLB (guest) không cần tài khoản.
-- user_id nullable + guest_name. Không tạo user mới, chỉ đánh dấu slot đã có người.

ALTER TABLE social_session_participants ADD COLUMN IF NOT EXISTS guest_name VARCHAR(100);

DO $$
BEGIN
  -- Bỏ NOT NULL cũ của user_id (nếu còn) để cho phép guest user_id NULL.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'social_session_participants'
      AND column_name = 'user_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE social_session_participants ALTER COLUMN user_id DROP NOT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_session_participants_guest_check') THEN
    ALTER TABLE social_session_participants ADD CONSTRAINT social_session_participants_guest_check
      CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL);
  END IF;
END $$;

-- Unique (session_id, user_id) giữ nguyên: NULL không bằng NULL nên nhiều guest cùng session vẫn insert được.
-- Không cần index mới cho guest vì list theo session đã có social_session_participants_session_idx.
