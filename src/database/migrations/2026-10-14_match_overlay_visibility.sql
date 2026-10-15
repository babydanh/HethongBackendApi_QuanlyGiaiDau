-- Overlay H2H (banner đối đầu) và BRACKET (bảng nhánh) trên sóng live, theo từng trận.
-- Áp cho cả 3 loại trận: giải đấu, buổi giao lưu CLB, trận rời CLB.
-- DEFAULT false: mọi bản ghi (cũ và mới) bắt đầu với overlay tắt.
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS h2h_overlay_visible boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS bracket_overlay_visible boolean DEFAULT false NOT NULL;

ALTER TABLE public.club_match_session_matches
  ADD COLUMN IF NOT EXISTS h2h_overlay_visible boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS bracket_overlay_visible boolean DEFAULT false NOT NULL;

ALTER TABLE public.club_standalone_matches
  ADD COLUMN IF NOT EXISTS h2h_overlay_visible boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS bracket_overlay_visible boolean DEFAULT false NOT NULL;
