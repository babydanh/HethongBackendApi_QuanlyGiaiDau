-- Camera PULL có nguồn là camera IP tại sân: SportO nhờ media server AQP kéo luồng
-- (`addStreamProxy`) và AQP trả về một khoá proxy nội bộ. Khoá đó phải được lưu lại
-- để `delStreamProxy` ngắt đúng proxy khi camera bị xoá — nếu không, luồng vẫn bị
-- kéo mãi trên AQP sau khi camera đã biến mất khỏi SportO.
--
-- NULL với mọi camera hiện có (PUSH và PULL dán URL phát sẵn): không có proxy nào
-- để ngắt, hành vi cũ giữ nguyên.
ALTER TABLE "livestream_cameras"
  ADD COLUMN IF NOT EXISTS "pull_proxy_key" varchar(255);
