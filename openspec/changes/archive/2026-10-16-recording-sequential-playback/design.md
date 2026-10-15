# Design

## Context

- Backend đã có `GET /livestream/matches/:matchId/recording-days` và `GET /livestream/matches/:matchId/recordings?period=` (kiểm quyền qua `getRecordingStreamName`, chỉ trả `{ name, sizeBytes? }`, cố ý không trả `rootPath` hay URL). Danh mục lấy từ AQP `getMP4RecordFile` qua JWT đại lý (`media.aqvision.net/api/rapidmedia/...`), chạy được từ 15/10.
- `<video>` của trình duyệt không gửi được header `Authorization`, nên không thể trỏ thẳng vào một endpoint đòi Bearer token.
- AQP phục vụ file ghi qua HTTP công khai tại `/record/<app>/<stream>/<ngày>/<file>.mp4` (đã kiểm chứng, xem mục Kết quả kiểm chứng AQP bên dưới).

## Goals / Non-Goals

**Goals:**
- BTC/trọng tài xem lại cả ngày ghi như một video liền, không cần tải từng file.
- Danh sách phát (biết được tên luồng + tên file) chỉ đến tay BTC/trọng tài được phân công qua SportO.
- Không lưu video trên VPS.

**Non-Goals:**
- Ghép file trên server, tải về, phát công khai (xem proposal.md).

## Decisions

1. **Danh sách phát do backend dựng.** Endpoint mới `GET /livestream/matches/:matchId/recordings/playlist?period=` dùng lại kiểm quyền và danh mục hiện có, trả `{ period, segments: [{ name, startAt, url }] }` đã xếp theo `startAt` (đọc từ tên file, giờ VN, ISO kèm `+07:00`). Lý do: xếp và kiểm quyền ở một chỗ; web không phải biết cấu trúc đường dẫn AQP.
2. **`url` trỏ thẳng file trên máy media AQP.** `url` = `{AQVISION_PLAYBACK_BASE_URL || https://media.aqvision.net}/record/{AQVISION_APP || live}/{stream}/{period}/{name}` (tên luồng/tên file mã hoá `encodeURIComponent`). Người dùng chốt 15/10 sau kiểm chứng (task 1.2), dù Decision 3 cũ khuyên proxy.
   - Lý do: video đi thẳng AQP → trình duyệt, không tốn băng thông VPS (file mẫu khoảng 60MB/đoạn); AQP hỗ trợ `Range` nên tua được ngay.
   - Phương án bỏ: token HMAC + cookie phiên + endpoint chuyển tiếp qua backend (bảo vệ link phía SportO nhưng tốn băng thông VPS, và không chặn được ai đã biết tên luồng vì AQP vẫn mở công khai). Phần token/cookie đã code ở task 2.2 cũ được gỡ bỏ, không để code chết.
3. **Không có hạn dùng phía SportO.** Playlist không trả `expiresAt`; web không cần xin lại playlist định kỳ.
4. **Trình phát phía web dùng hai `<video>` luân phiên.** Một thẻ đang phát, thẻ kia nạp sẵn đoạn sau (`preload="auto"`), hết đoạn thì đổi chỗ; thanh thời gian chung tính từ `duration` từng đoạn (đoạn chưa nạp dùng khoảng ước từ `startAt` của đoạn kế). Lý do: khựng giữa hai đoạn nhỏ nhất mà không cần MSE/HLS. Phương án bỏ: dựng HLS VOD playlist (cần AQP hỗ trợ fMP4/TS segment, chưa có bằng chứng).

## Kết quả kiểm chứng AQP (task 1.1, 15/10)

Chạy probe chỉ-đọc trong container backend production (qua workflow tạm, đã xoá nhánh; run Actions `38774631735`), file thật ngày 2026-10-14, 60.666.086 byte, chỉ xin 16 byte đầu:

| Đường | Không token | Có JWT đại lý |
|---|---|---|
| `https://media.aqvision.net/record/live/<stream>/<ngày>/<file>.mp4` | 206 `video/mp4`, có `ftyp`, hỗ trợ `Range` | 206 như bên trái |
| `https://api.media.aqvision.net/record/live/<stream>/<ngày>/<file>.mp4` | 206 `video/mp4` | 206 |
| `/record/__defaultVhost__/live/...`, `/<ngày>/<file>`, `/<file>` | 404 | 404 |
| `/record`, `/record/live/<stream>[/<ngày>]` (liệt kê thư mục) | 401 | 404 |

Kết luận: AQP phục vụ file ghi **công khai, không cần token, không hạn dùng**; chỉ cần biết tên luồng và tên file. Tên luồng đang lộ sẵn trong URL HLS của trang xem trực tiếp công khai. Theo Decision 3, URL này không tự cưỡng chế giới hạn nên không đủ điều kiện cho nhánh 302.

## Risks / Trade-offs

- **Link bản ghi công khai vĩnh viễn**: ai có `url` (BTC chia sẻ, hoặc ai đoán từ tên luồng đang lộ trong link xem trực tiếp + quy tắc tên file theo giờ) đều xem/tải được, không cần đăng nhập. Đây là cấu hình của AQP, có cả khi không có tính năng này. Giảm thiểu: chỉ BTC/trọng tài nhận playlist; đề nghị AQP khoá đường `/record` bằng token hoặc URL có chữ ký, khi có thì đổi `url` sang dạng ký mà không đổi giao diện.
- Tải video do máy media AQP gánh; nếu AQP giới hạn băng thông thì phát có thể giật.
- Giờ bắt đầu suy từ tên file; nếu AQP đổi quy tắc đặt tên thì thứ tự sai → đoạn không đọc được giờ đặt cuối danh sách theo tên, có test cho quy tắc này.
- Đoạn đang ghi dở (file cuối khi trận còn LIVE) có thể chưa phát được → báo lỗi đoạn và bỏ qua theo spec.
