> Change song song với `recording-sequential-playback` ở repo HethongFrontEndWeb_QLgiaidau (người dùng duyệt apply 15/10). File này chỉ giữ phần Backend.

# Proposal

## Why

Modal "Bản ghi MP4" ở tab Livestream của trang quản lý giải hiện chỉ liệt kê tên file (thiết kế ban đầu 09/10 cố ý không trả URL phát). AQP cắt bản ghi một trận thành nhiều đoạn MP4 khoảng 2 phút (trận "Chung kết • danh vs da" ngày 15/10 có 6 đoạn 23:02–23:11) và danh sách đang không theo thứ tự giờ, nên BTC/trọng tài không xem lại được trận ngay trên SportO. Người dùng chốt 15/10: phát nối tiếp các đoạn, chỉ BTC/trọng tài của giải được xem.

## What Changes

- Modal "Bản ghi MP4" thêm trình phát: các đoạn của ngày đã chọn được xếp theo giờ bắt đầu, phát liền nhau, có một thanh thời gian chung cho cả ngày ghi; bấm một đoạn trong danh sách thì nhảy tới đầu đoạn đó.
- Danh sách file sắp theo giờ bắt đầu (tăng dần) thay vì thứ tự AQP trả về.
- Câu mô tả "màn hình này không phát hoặc tải video" được thay bằng mô tả trình phát; không thêm nút tải về.
- **Backend (repo HethongBackendApi_QuanlyGiaiDau)**: thêm endpoint trả danh sách đoạn phát được của một ngày ghi, đã xếp theo giờ, mỗi đoạn kèm đường dẫn file ghi trực tiếp trên máy media AQP (người dùng chốt 15/10 sau kiểm chứng: trỏ thẳng link AQP, không chuyển tiếp qua VPS); chỉ người có quyền điều khiển trận (BTC/trọng tài được phân công) gọi được. Endpoint danh sách tên file hiện có giữ nguyên.

## Out of scope (KHÔNG làm)

- Không ghép thành một file MP4 trên server (không chạy ffmpeg, không lưu video trên VPS).
- Không cho khán giả/công khai xem lại; không thêm vào trang trận public.
- Không thêm tải file về máy, không chia sẻ link bản ghi ra ngoài.
- Không đổi cách AQP ghi (độ dài đoạn, định dạng), không đổi luồng phát trực tiếp.

## Capabilities

### New Capabilities

- `match-recording-playback`: BTC/trọng tài xem lại bản ghi MP4 của một trận ngay trong trang quản lý, các đoạn phát nối tiếp theo thứ tự giờ, có kiểm quyền.

### Modified Capabilities

(không có: `openspec/specs/` chưa có spec nào về danh mục bản ghi)

## Impact

- Web: modal bản ghi trong `src/app/organizer/tournaments/[id]/manage/components/LivestreamTab.tsx` (tách thành component trình phát riêng), API client `src/features/tournaments/api.ts`, `messages/vi.json` + `messages/en.json`.
- Backend: module `livestream` (controller + service), thêm endpoint `GET /livestream/matches/:matchId/recordings/playlist?period=YYYY-MM-DD`; không thêm endpoint chuyển tiếp nội dung.
- Hạ tầng: video đi thẳng từ máy media AQP tới trình duyệt, không tốn băng thông VPS. Đổi lại đường dẫn file không hết hạn và AQP không đòi đăng nhập (xem design.md, Risks).
