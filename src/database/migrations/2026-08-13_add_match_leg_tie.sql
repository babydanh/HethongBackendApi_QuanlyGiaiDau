-- Migration: Two-legged knockout support (bóng đá Champion League style)
-- Date: 2026-08-13
-- Purpose:
--   Thêm cột leg + tieId vào matches để nhóm 2 trận lượt đi/lượt về
--   của cùng một cặp đấu trong knockout. Aggregate = tổng tỷ số 2 lượt,
--   hòa tổng → luân lưu (penaltyShootout).

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS leg integer,
  ADD COLUMN IF NOT EXISTS tie_id varchar(64);

-- Index cho tie lookup nhanh (completeMatchInTx tìm trận cùng tieId)
CREATE INDEX IF NOT EXISTS idx_matches_tie_id ON matches (tie_id);

-- Rollback:
--   DROP INDEX IF EXISTS idx_matches_tie_id;
--   ALTER TABLE matches DROP COLUMN IF EXISTS leg, DROP COLUMN IF EXISTS tie_id;
