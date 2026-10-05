-- Bước 1: consent thời gian cho ELO, đặt trên tournament_rosters.
--
-- Vì sao không dùng cột ranking_consent (boolean) có sẵn trên tournament_participants:
--   Cột đó được gán TỰ ĐỘNG từ cờ isRanked của giải
--   (tournament-lite.service.ts:1256 joinLite, :1433 addLiteClubMember),
--   nên trong MỌI giải có tính Elo nó là true cho 100% người tham gia.
--   Nó trả lời "giải này có tính Elo không", không phải "người này có đồng ý không".
--   Gate theo nó sẽ luôn pass và vô hiệu hoá toàn bộ.
--
-- Vì sao đặt trên tournament_rosters chứ không phải tournament_participants:
--   ELO được gán theo TỪNG user qua tournament_rosters.userId
--   (rankings.service.ts:600-617 cho winner và 628-645 cho loser).
--   Một participant có thể mang nhiều user qua role MAIN/RESERVE, nên một mốc thời
--   gian ở mức participant không biểu diễn được consent của ai: 1 người xác nhận
--   thì cả đội cùng qua gate và những người chưa từng bấm vẫn nhận điểm.
--
-- NULL = chưa xác nhận.

ALTER TABLE public.tournament_rosters
  ADD COLUMN IF NOT EXISTS ranking_consent_at timestamp with time zone;

-- Theo dõi việc gửi mail xác nhận. Không có 2 cột này thì scheduler không phân biệt
-- được "chưa từng gửi" với "đã gửi rồi bị bỏ qua", và cột trạng thái xác nhận trên
-- UI tổ chức trở thành không kiểm chứng được. Reminder tự động 1-3 lần lịch từ đây.
ALTER TABLE public.tournament_rosters
  ADD COLUMN IF NOT EXISTS consent_notified_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS consent_notified_count integer NOT NULL DEFAULT 0;

-- BACKFILL BẮT BUỘC, chạy TRƯỚC khi bật gate.
--
-- Nếu bật gate mà chưa backfill: toàn bộ roster có cột NULL bị coi là chưa xác nhận
-- -> ELO của mọi giải đang chạy về 0. Đó là mất dữ liệu thật, không hoàn tác được.
--
-- Chỉ backfill cho roster thuộc participant đã có ranking_consent = true (tức là
-- đã từng "được coi là đồng ý" theo cách cũ). Roster của participant chưa có
-- consent (import Excel, wildcard) giữ NULL để rơi vào luồng xác nhận mới và chỉ
-- tính từ trận sau consent_at — không có cú flip nào làm thay đổi bảng xếp hạng.
--
-- Mốc là registered_at (thời điểm vào giải), KHÔNG phải created_at:
-- bảng tournament_participants không có cột created_at, chỉ có registered_at
-- và roster_locked_at.
UPDATE public.tournament_rosters r
   SET ranking_consent_at = p.registered_at
  FROM public.tournament_participants p
 WHERE p.id = r.participant_id
   AND r.ranking_consent_at IS NULL
   AND p.ranking_consent = true;

-- Kiểm tra sau backfill: các giải có Elo đang chạy không bị mất dữ liệu.
-- Nếu cột này trả về 0 trong khi có giải ranked đã có trận -> BACKFILL CHƯA CHẠY.
SELECT count(*) AS consented_backfilled
  FROM public.tournament_rosters
 WHERE ranking_consent_at IS NOT NULL;
