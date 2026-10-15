# Tasks

## 1. Kiểm chứng cách lấy nội dung file từ AQP

- [x] 1.1 Lấy tên luồng thật của một trận đã có bản ghi (BTC cung cấp, hoặc đọc từ DB production chỉ-đọc) và thử các dạng URL file ghi của AQP (có/không JWT đại lý); xong khi ghi được kết quả HTTP + content-type từng dạng vào design.md
- [x] 1.2 Chốt cách nối video với người dùng; xong khi design.md ghi rõ cách đã chọn và lý do (người dùng chọn trỏ thẳng link AQP, Decision 2)

## 2. Backend

- [x] 2.1 Hàm đọc giờ bắt đầu từ tên file + sắp xếp (đoạn không đọc được giờ xếp cuối); xong khi unit test cho các tên file mẫu ngày 15/10 pass
- [x] 2.2 `url` của từng đoạn trỏ thẳng file AQP theo Decision 2; gỡ token HMAC, cookie `sporto_rec` và `expiresAt` đã code trước đó; xong khi unit test dựng `url` (base mặc định, base từ biến môi trường, tên có ký tự đặc biệt được mã hoá) pass và grep không còn `sporto_rec`/`recording-playback-token`
- [x] 2.3 Endpoint `GET /livestream/matches/:matchId/recordings/playlist?period=` dùng kiểm quyền hiện có; xong khi test controller/service: BTC 200 có segments đã xếp kèm `url` AQP, người không có quyền 403, period sai 400, AQP lỗi 503 không lộ thông tin nhà cung cấp
- [x] 2.4 Chạy `npx jest src/modules/livestream` và `tsc --noEmit` (lọc livestream) của Backend; xong khi pass

