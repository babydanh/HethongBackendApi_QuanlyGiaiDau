# Tasks

## 1. Kiểm chứng cách lấy nội dung file từ AQP

- [ ] 1.1 Lấy tên luồng thật của một trận đã có bản ghi và thử các dạng URL file ghi của AQP (có/không JWT đại lý); xong khi ghi được kết quả HTTP + content-type từng dạng vào design.md
- [ ] 1.2 Chốt nhánh 302 / proxy / dừng hỏi người dùng theo Decision 3; xong khi design.md ghi rõ nhánh đã chọn và lý do

## 2. Backend

- [ ] 2.1 Hàm đọc giờ bắt đầu từ tên file + sắp xếp (đoạn không đọc được giờ xếp cuối); xong khi unit test cho các tên file mẫu ngày 15/10 pass
- [ ] 2.2 Ký/kiểm token phát theo file (HMAC, hạn 10 phút, gắn matchId/stream/period/name/userId) và cookie phiên `sporto_rec` (HttpOnly, gắn userId/exp); xong khi unit test token hợp lệ, hết hạn, bị sửa, khác trận, thiếu cookie, cookie khác người đều đúng
- [ ] 2.3 Endpoint `GET /livestream/matches/:matchId/recordings/playlist?period=` dùng kiểm quyền hiện có, đặt cookie `sporto_rec`; xong khi test controller/service: BTC 200 có segments đã xếp + Set-Cookie, người không có quyền 403, period sai 400, AQP lỗi 503 không lộ thông tin nhà cung cấp
- [ ] 2.4 Endpoint `GET /livestream/recordings/stream?token=` theo nhánh ở 1.2 (302 hoặc proxy có `Range`); xong khi test: token + cookie hợp lệ trả 302/206, token hết hạn/sai hoặc thiếu cookie trả 403
- [ ] 2.5 Chạy `npx jest src/modules/livestream` và `tsc --noEmit` (lọc livestream); xong khi pass
