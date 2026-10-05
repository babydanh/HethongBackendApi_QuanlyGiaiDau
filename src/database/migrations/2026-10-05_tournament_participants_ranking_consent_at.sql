-- Bước 1: cột consent thời gian cho ELO.
--
-- Vì sao không dùng cột ranking_consent (boolean) có sẵn:
--   ranking_consent được gán TỰ ĐỘNG từ cờ isRanked của giải
--   (tournament-lite.service.ts:1256 joinLite, :1433 addLiteClubMember),
--   nên trong MỌI giải có tính Elo nó là true cho 100% người tham gia.
--   Nó trả lời "giải này có tính Elo không", không phải "người này có đồng ý không".
--   Dùng nó làm gate consent sẽ luôn true và vô hiệu hoá toàn bộ.
--
-- Cột mới trả lời đúng câu hỏi đó, và mang mốc thời gian để chặn việc tính lại
-- các trận đã diễn ra trước lúc người chơi bấm xác nhận.

ALTER TABLE public.tournament_participants
  ADD COLUMN IF NOT EXISTS ranking_consent_at timestamp with time zone;

-- BACKFILL BẮT BUỘC, chạy TRƯỚC khi bật gate.
--
-- Nếu bật gate mà chưa backfill: toàn bộ participant có cột NULL bị coi là chưa
-- xác nhận -> recalculateEloChain loại hết -> ELO của mọi giải đang chạy về 0.
-- Đó là mất dữ liệu thật, không hoàn tác được.
--
-- Mốc backfill là registered_at (thời điểm vào giải), KHÔNG phải created_at:
-- bảng tournament_participants không có cột created_at. registered_at có
-- defaultNow() nên không NULL với dữ liệu cũ.
--
-- Chỉ backfill cho participant đã có ranking_consent = true (tức là đã từng
-- "được coi là đồng ý" theo cách cũ). Participant chưa có consent thì giữ NULL
-- để họ không tự nhiên có ELO khi chưa xác nhận.
UPDATE public.tournament_participants
   SET ranking_consent_at = registered_at
 WHERE ranking_consent_at IS NULL
   AND ranking_consent = true;

-- Kiểm tra sau backfill: các giải có Elo đang chạy không bị mất dữ liệu.
-- Nếu cột này trả về 0 trong khi có giải ranked đã có trận -> BACKFILL CHƯA CHẠY.
SELECT count(*) AS consented_backfilled
  FROM public.tournament_participants
 WHERE ranking_consent_at IS NOT NULL;
