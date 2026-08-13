-- Migration: Team roster status + unique constraint (bóng đá đội nhiều người)
-- Date: 2026-08-13
-- Purpose:
--   - tournament_rosters thêm cột `status` (INVITED/ACTIVE/REMOVED) cho luồng mời từng người.
--   - Unique index (participant_id, user_id) chặn trùng roster trong cùng 1 đội.

-- Preflight (chạy trước): kiểm tra dữ liệu trùng trước khi tạo unique index
--   SELECT participant_id, user_id, COUNT(*) FROM tournament_rosters
--   GROUP BY participant_id, user_id HAVING COUNT(*) > 1;
-- Nếu có trùng: cần xử lý (xoá bản lặp) trước khi chạy bước dưới.

ALTER TABLE tournament_rosters
  ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS tournament_rosters_participant_user_unique_idx
  ON tournament_rosters (participant_id, user_id);

-- Rollback:
--   DROP INDEX IF EXISTS tournament_rosters_participant_user_unique_idx;
--   ALTER TABLE tournament_rosters DROP COLUMN IF EXISTS status;
