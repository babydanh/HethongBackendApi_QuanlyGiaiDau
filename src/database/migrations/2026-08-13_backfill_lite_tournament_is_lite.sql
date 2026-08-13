-- Migration: Backfill isLite flag for legacy Lite tournaments
-- Date: 2026-08-13
-- Purpose:
--   Tách 2 khái niệm đang trộn lẫn trong tournament_config:
--     (A) mode = 'LITE'  → CÁCH TÍNH ĐIỂM (scoring mode), có thể bật trên giải nâng cao.
--     (B) isLite = true  → LOẠI GIẢI lite (nhanh/đơn giản), KHÁC hẳn scoring.
--   Trước đây hệ thống dùng tournament_config->>'mode' = 'LITE' làm cờ loại giải,
--   nên giải nâng cao chọn scoring LITE bị hiểu nhầm thành giải lite.
--   Migration này gán isLite=true cho các giải LITE THẬT (được tạo qua POST /tournaments/lite,
--   nhận diện bằng mode='LITE' + hideAdvancedSettings=true). Giải nâng cao dùng scoring LITE
--   không có hideAdvancedSettings=true nên KHÔNG bị gắn nhầm isLite.

-- Backfill: giải lite thật = mode='LITE' AND hideAdvancedSettings IS TRUE
UPDATE tournaments
SET tournament_config = jsonb_set(
      COALESCE(tournament_config, '{}'::jsonb),
      '{isLite}',
      'true'::jsonb,
      true   -- create key if missing
    )
WHERE tournament_config->>'mode' = 'LITE'
  AND COALESCE(tournament_config->>'hideAdvancedSettings', 'false') = 'true'
  AND (tournament_config->>'isLite') IS NULL;

-- Rollback:
--   UPDATE tournaments
--   SET tournament_config = tournament_config - 'isLite'
--   WHERE tournament_config->>'isLite' = 'true';
