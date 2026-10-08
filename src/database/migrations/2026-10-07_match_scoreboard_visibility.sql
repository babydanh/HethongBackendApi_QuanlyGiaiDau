-- Ẩn/hiện bảng điểm live (overlay trên sóng) cho từng trận.
-- Áp cho cả 3 loại trận: giải đấu, buổi giao lưu CLB, trận rời CLB.
-- DEFAULT true: mọi bản ghi cũ giữ nguyên hành vi hiển thị.
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS scoreboard_visible boolean DEFAULT true NOT NULL;

ALTER TABLE public.club_match_session_matches
  ADD COLUMN IF NOT EXISTS scoreboard_visible boolean DEFAULT true NOT NULL;

ALTER TABLE public.club_standalone_matches
  ADD COLUMN IF NOT EXISTS scoreboard_visible boolean DEFAULT true NOT NULL;
