# Design

## Context

- Backend đã có `GET /livestream/matches/:matchId/recording-days` và `GET /livestream/matches/:matchId/recordings?period=` (kiểm quyền qua `getRecordingStreamName`, chỉ trả `{ name, sizeBytes? }`, cố ý không trả `rootPath` hay URL). Danh mục lấy từ AQP `getMP4RecordFile` qua JWT đại lý (`media.aqvision.net/api/rapidmedia/...`), chạy được từ 15/10.
- `<video>` của trình duyệt không gửi được header `Authorization`, nên không thể trỏ thẳng vào một endpoint đòi Bearer token.
- Chưa biết AQP có phục vụ file ghi qua HTTP công khai không (ZLMediaKit thường dùng `/record/<app>/<stream>/<ngày>/<file>.mp4`). Thử với tên luồng giả trên `media.aqvision.net` chỉ ra 404, chưa kết luận được vì cần tên luồng thật.

## Goals / Non-Goals

**Goals:**
- BTC/trọng tài xem lại cả ngày ghi như một video liền, không cần tải từng file.
- URL phát chỉ dùng được trong trình duyệt của người vừa được cấp (BTC/trọng tài), cho đúng một file của một trận, và hết hạn sau vài phút.
- Không lưu video trên VPS.

**Non-Goals:**
- Ghép file trên server, tải về, phát công khai (xem proposal.md).

## Decisions

1. **Danh sách phát do backend dựng.** Endpoint mới `GET /livestream/matches/:matchId/recordings/playlist?period=` dùng lại kiểm quyền và danh mục hiện có, trả `{ period, expiresAt, segments: [{ name, startAt, url }] }` đã xếp theo `startAt` (đọc từ tên file, giờ VN, ISO kèm `+07:00`). Lý do: xếp và kiểm quyền ở một chỗ; web không phải biết cấu trúc đường dẫn AQP.
2. **URL phát hai lớp: token theo file + cookie theo phiên, hạn 10 phút.**
   - `url` = `/api/v1/livestream/recordings/stream?token=...`; `token` là HMAC-SHA256 (khoá dẫn xuất từ `JWT_ACCESS_SECRET` với nhãn riêng `recording-playback`, không thêm biến môi trường) gói `matchId`, `stream`, `period`, `name`, `userId`, `exp`.
   - Cùng phản hồi playlist đặt cookie `sporto_rec` HttpOnly, `SameSite=Lax`, `Secure` khi production, `Path=/api/v1/livestream/recordings`, `Max-Age=600`, giá trị là HMAC gói `userId`, `exp`.
   - Endpoint `stream` chỉ phục vụ khi token hợp lệ, cookie hợp lệ và `userId` của hai lớp trùng nhau. Copy URL sang trình duyệt/người khác thì thiếu cookie → 403.
   - Lý do: `<video src>` không gửi Bearer nhưng có gửi cookie cùng site (web và API cùng `sporto.asia`; axios đã `withCredentials: true` nên cookie được lưu từ phản hồi playlist). Phương án bỏ: JWT người dùng trong query (lộ phiên dài hạn); token đơn thuần không cookie (URL là "vé" ai cầm cũng xem).
3. **Nội dung lấy từ AQP theo kết quả kiểm chứng (task 1).**
   - Nếu AQP phục vụ file qua HTTP: chỉ chọn chuyển hướng 302 khi URL AQP tự cưỡng chế giới hạn tương đương (có chữ ký/hạn dùng do AQP kiểm). URL MP4 công khai cố định của AQP thì KHÔNG trả cho trình duyệt; dùng nhánh proxy.
   - Nếu AQP chỉ phục vụ khi có JWT đại lý, hoặc URL công khai không có giới hạn: endpoint `stream` chuyển tiếp nội dung (proxy) có hỗ trợ `Range` để tua được, không ghi đĩa.
   - Nếu AQP không có cách nào lấy nội dung file: dừng và hỏi người dùng (cần AQP cấp đường dẫn chính thức).
4. **Trình phát phía web dùng hai `<video>` luân phiên.** Một thẻ đang phát, thẻ kia nạp sẵn đoạn sau (`preload="auto"`), hết đoạn thì đổi chỗ; thanh thời gian chung tính từ `duration` từng đoạn (đoạn chưa nạp dùng khoảng ước từ `startAt` của đoạn kế). Lý do: khựng giữa hai đoạn nhỏ nhất mà không cần MSE/HLS. Phương án bỏ: dựng HLS VOD playlist (cần AQP hỗ trợ fMP4/TS segment, chưa có bằng chứng).

## Risks / Trade-offs

- Proxy qua VPS tốn băng thông khi nhiều người xem lại cùng lúc → chỉ BTC/trọng tài, ghi chú theo dõi băng thông; ưu tiên 302 nếu AQP cho phép.
- Giờ bắt đầu suy từ tên file; nếu AQP đổi quy tắc đặt tên thì thứ tự sai → đoạn không đọc được giờ đặt cuối danh sách theo tên, có test cho quy tắc này.
- Đoạn đang ghi dở (file cuối khi trận còn LIVE) có thể chưa phát được → báo lỗi đoạn và bỏ qua theo spec.
