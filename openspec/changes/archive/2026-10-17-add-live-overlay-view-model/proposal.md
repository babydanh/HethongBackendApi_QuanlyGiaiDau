## Why

Trang xem trận (Web) và màn live (App) đã có đồ hoạ H2H và Bracket phủ lên video, bật bằng `PATCH /matches/:id/overlay-visibility`. Nhưng hai nơi đang vẽ khác nhau và sai với đôi:

- Web chỉ giữ cờ trong state cục bộ (`page.tsx:276`), không đọc cờ Backend và không nghe `overlay:visibility`; người xem Web không bao giờ thấy overlay do BTC bật. Flutter có nghe socket.
- Cả hai dùng `teamName` + avatar người đầu tiên, nên đôi bị coi như đơn; tên đôi phụ thuộc chuỗi người đăng ký gõ.
- Bracket Web không có ô điểm, không đường nối, cuộn ngang; Flutter không có đường nối; payload `GET /tournaments/:id/bracket` không có tên vòng và member không có avatar.

Chủ dự án đã gửi hai ảnh mẫu (H2H đơn "Danh VS Luân", Bracket đôi 8 cặp) và yêu cầu Web + Flutter hiện **giống hệt**, cả đơn lẫn đôi. Phần dễ lệch nhất (tên đôi, BYE/chờ kết quả, tên vòng, cửa sổ cột, điểm) phải nằm ở một nơi duy nhất có test: Backend.

## What Changes

- Thêm `GET /matches/:id/overlay` (công khai, cùng quyền xem trận như `GET /matches/:id`) trả view-model đã dựng sẵn cho H2H và Bracket, kèm hai cờ hiện/ẩn hiện có. Web và App chỉ vẽ.
- H2H: `title` luôn là **"ĐỐI ĐẦU"** (tiếng Việt, chủ dự án chọn thay cho "HEAD TO HEAD"), `round` là nhãn vòng hoặc null. Tên một bên: chỉ tính thành viên roster ACTIVE + MAIN, ghép tên gọi bằng " - " (đôi: "Danh - Luân"); trùng tên gọi thì dùng 2 từ cuối; không có thành viên hoặc từ 3 người trở lên thì dùng `teamName`; cặp mới chỉ có 1 người thì kèm ghi chú "(chờ đồng đội)".
- Bracket: tối đa **4 cột** (4 vòng liên tiếp, luôn chứa trận đang xem, lệch về chung kết nhất có thể); thẻ trận chỉ có **tên bên 1, tên bên 2 và ô điểm = số set mỗi bên đã thắng**; **không mã trận, không seed**; nhãn vòng **chỉ tiếng Việt** theo khoảng cách tới chung kết; trận đang xem đánh dấu `live`, đường nối tới vòng sau đánh dấu `litNext`.
- Vòng bảng, loại kép hoặc định dạng chưa hỗ trợ: `bracket: null` kèm `bracketReason`.
- Cache theo trận vài giây ở server để nhiều người xem không nhân tải truy vấn bracket.
- Đính kèm 3 file logo SVG vector vẽ lại (`assets/`), dùng ở hai app (file `sporto_v1_with_text.svg` hiện có thực chất là PNG nhúng 534 KB).

## Out of scope

- Không đổi `PATCH /matches/:id/overlay-visibility`, socket `overlay:visibility`, cột `h2hOverlayVisible/bracketOverlayVisible`, `GET /tournaments/:id/bracket`.
- Không đẩy snapshot qua socket (đã loại ở Design-It-Twice); chỉ GET.
- Không hiện thành tích đối đầu (W–L), seed, ELO, mã trận. Không in đồ hoạ vào luồng video (AQP); chỉ phủ lên player.
- Không vẽ giải vòng bảng, loại kép, trận tranh hạng ba. Không phục vụ trận CLB/kèo (nằm ngoài bảng `matches`): endpoint trả 404.
- Không thay đổi Web và Flutter trong change này: hai thay đổi đó là change riêng ở mỗi repo, phụ thuộc hợp đồng này (xem Impact).
- Không migration, không đổi schema.

## Impact

- Backend: thêm module con `matches/overlay` (mapper thuần, repository một truy vấn, controller). Không migration. Push `main` = deploy production.
- Repo khác bị ảnh hưởng (làm sau, change riêng, sau khi hợp đồng này được duyệt):
  - Web Next.js: gọi `GET /matches/:id/overlay`; thay `activeOverlayMode` cục bộ bằng cờ Backend + socket `overlay:visibility`; vẽ lại `LiveHeadToHeadOverlay`/`LiveBracketOverlay` theo khung cố định; nút trong modal chấm điểm gọi `PATCH /matches/:id/overlay-visibility`. Đổi hành vi: bật overlay giờ ảnh hưởng mọi người xem.
  - App Flutter: tách `_buildH2hOverlay`/`_buildBracketOverlay` khỏi `live_score_screen.dart` (3.898 dòng) ra `widgets/live_overlay/`, đọc cờ khi vào/nối lại socket.
- Endpoint mới: `GET /matches/:id/overlay`. Không endpoint nào bị sửa hoặc xoá.
- Rủi ro đã biết: số truy vấn cố định (≤ 6, không N+1) và cache nội dung 3 s; `GET /matches/:id` công khai chưa được kiểm toàn bộ trường nhạy cảm (endpoint mới chỉ chọn trường an toàn); giá trị `status`, `bracketBranch`, roster đã đối chiếu ở `design.md`; SQL chưa chạy trên Postgres thật (Docker không chạy).
