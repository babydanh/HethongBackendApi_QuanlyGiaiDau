## Context

- Đã có sẵn và GIỮ NGUYÊN: `PATCH /matches/:id/overlay-visibility` (`kind` H2H|BRACKET, `visible`; vai trò ORGANIZER/ADMIN/REFEREE; bật cái này tắt cái kia), hai cột `h2hOverlayVisible/bracketOverlayVisible`, socket `overlay:visibility` tới phòng `match:<id>` (`matches.controller.ts:133-155`, `live-score.gateway.ts:437-447`, `overlay-visibility.ts`).
- Web có `LiveHeadToHeadOverlay.tsx` và `LiveBracketOverlay.tsx` nhưng bật/tắt bằng state cục bộ (`page.tsx:276`, `:2503`); không có kết quả grep cờ/socket overlay trong `src/`. Flutter có `_buildH2hOverlay` (`live_score_screen.dart:1767`) và `_buildBracketOverlay` (`:1990`), có nghe `overlay:visibility`.
- Dữ liệu: `matches` (`participant1Id/2Id`, `winnerId`, `roundNumber`, `matchOrder`, `nextMatchId`, `bracketBranch`, `p1SetsWon/p2SetsWon`, `scoreDetails`, `revision`); `tournament_participants` (`teamName`, `seed`, division); thành viên qua `tournament_rosters` + `profiles`. Payload bracket hiện không có tên vòng; member của bracket chỉ có `userId, fullName` (chi tiết trận có `avatarUrl`).
- Nguồn thiết kế hiển thị: hai ảnh mẫu của chủ dự án (H2H đơn "Danh VS Luân" nhãn "CHUNG KẾT"; Bracket đôi 8 cặp). Bản phác trực quan: Lavish phiên 2026-10-15 (thư mục tạm, không lưu trong repo); nội dung chốt nằm trong tài liệu này.

## Goals / Non-Goals

- Goals: một nguồn duy nhất cho tên đôi, tên vòng, cửa sổ cột, BYE/chờ kết quả, điểm; Web và Flutter chỉ vẽ nên hiện giống hệt; đơn và đôi cùng một hợp đồng; không lộ dữ liệu cá nhân.
- Non-Goals: thành tích đối đầu, seed, ELO, mã trận; vòng bảng/loại kép; in đồ hoạ vào luồng video; đẩy snapshot qua socket; sửa Web/Flutter (change riêng).

## Decisions

1. **Phủ lên player, không in vào luồng.** Chủ dự án chọn "Phủ lên player". Backend hiện chưa gọi API đồ hoạ của AQP và chưa kiểm được AQP có hỗ trợ.
2. **Backend dựng sẵn view-model** (chủ dự án chọn). Design-It-Twice đã chạy 3 bản đối nghịch: (①) một GET, chuỗi dựng sẵn; (②) dữ liệu thuần, client tự suy nhãn bằng bảng quy tắc; (③) đẩy snapshot qua socket kèm `revision`. Chọn ① làm nền vì ② đảo ngược quyết định "một nơi lo logic" và ③ đòi sửa `joinMatch`, hàng đợi theo trận, throttle, hash view. Mượn từ ②: fixture + kết quả mong đợi dùng chung, chuẩn hoá tên NFC/NBSP, nhãn vòng theo khoảng cách tới chung kết (đếm số đội sai khi có BYE), chỉ thêm trường. Mượn từ ③: client bỏ phản hồi cũ theo thứ tự yêu cầu, giữ khung cũ khi lỗi, GET lại khi nối lại socket.
3. **Hợp đồng** (`GET /matches/:id/overlay`, bọc trong định dạng chung, dưới đây là `data`):

```ts
interface OverlayPayload {
  h2hVisible: boolean; bracketVisible: boolean;           // = h2hOverlayVisible / bracketOverlayVisible
  h2h: { round: string; left: Side; right: Side } | null;      // round: "CHUNG KẾT"…; null khi chưa đủ 2 bên
  bracket: { title: string; sport: string; columns: Column[] } | null;
  bracketReason: string | null;                           // tiếng Việt, khi bracket = null
}
interface Side { name: string; note: string | null;
                 avatars: { url: string | null; initial: string }[] }   // 0-2 phần tử
interface Column { title: string; cards: Card[] }          // 1-4 cột, trái → phải
interface Card { id: string; final: boolean; live: boolean;
                 litNext: boolean; nextId: string | null; rows: [Row, Row] }   // không mã trận
interface Row { name: string | null; note: string | null; score: string | null; won: boolean }  // không seed
```

4. **Cửa sổ 4 cột**: `end = min(T, k+3)`, `start = end - min(4,T) + 1` (T số vòng, k vòng của trận đang xem; trận ngoài bracket k = T). Nhãn theo khoảng cách tới chung kết d = T - vòng: 0 CHUNG KẾT, 1 BÁN KẾT, 2 TỨ KẾT, 3 VÒNG 16, 4 VÒNG 32.
5. **Chỉ tiếng Việt** cho mọi nhãn cố định (CHUNG KẾT, BÁN KẾT, TỨ KẾT, VÒNG 16, ĐANG DIỄN RA, Chờ kết quả, BYE), kể cả khi app để tiếng Anh. Tiêu đề "HEAD TO HEAD" giữ như ảnh mẫu.
6. **Làm mới ở client** (áp dụng cho Web và Flutter, ghi ở đây để hai change sau dùng chung): chỉ GET khi overlay đang bật; GET ngay khi bật, khi nối lại socket, khi nhận `score:update` (debounce ~1 s) và mỗi 30 s cho các trận khác; bỏ phản hồi cũ hơn yêu cầu mới nhất; lỗi thì giữ khung đang hiện, thử lại có backoff, không hiện khung rỗng.
7. **Cache server** theo `:id` tối đa 3 s; không cache 404.
8. **Khung vẽ cố định co đều** (ngoại lệ có chủ đích của luật "không kích thước cứng", để hai nền tảng không reflow khác nhau): H2H 1320×225 trên khung 1568×523; Bracket 1568×882; co đều theo khung video (Web: `aspect-ratio` + `cqw`; Flutter: `LayoutBuilder` + `FittedBox`); chữ nhỏ nhất sau khi co ≥ 9 px thật; video quá nhỏ thì cả bracket thu nhỏ theo khung.
9. **Nổi bật**: thẻ `live` viền sáng + nhãn "ĐANG DIỄN RA"; thẻ khác mờ ~55%; đường nối `litNext` sáng; reduce-motion: không phóng to, chỉ đổi viền/độ mờ. Vào 200–260 ms, ra 160 ms, so le 40 ms giữa các thẻ.
10. **H2H**: thanh ngang — logo SPORTO | "HEAD TO HEAD" | nhãn vòng; hàng dưới: avatar tròn (bên 1 viền xanh, bên 2 viền đỏ) + khung tên hình bình hành, "VS" giữa. Đôi: mỗi bên hai avatar chồng nhau; chữ dài co tối đa 70% rồi cắt "…". Không seed/ELO/thành tích.
11. **Token (ước lượng bằng mắt từ ảnh, lấy mẫu pixel chính xác khi làm Web/Flutter)**: panel `#0B1F44` ~88% + blur; nhấn `#1E90FF` (gần `AppTheme.primary #1D8EF8`); bên 2 `#E5484D`; khung tên trắng→`#D5E2F6`, chữ `#0B1B3A`; Inter 800/900. Logo: dùng `assets/sporto-wordmark-mono.svg` (`currentColor`).
12. **Logo vector**: `sporto_v1_with_text.svg` hiện có là ảnh PNG 2060×615 nhúng base64 (534 KB, 0 đường vẽ). Đã dò lại thành đa giác vector từ chính PNG: `assets/sporto-logo.svg` (2 màu + "CHƠI CÙNG NHAU", 5,4 KB), `assets/sporto-wordmark.svg` (2 màu, chữ, 3,7 KB), `assets/sporto-wordmark-mono.svg` (`currentColor`, 3,7 KB). Độ khớp hình dạng với bản gốc IoU 0,989 (đo bằng ImageMagick); màu lấy từ điểm ảnh: navy `#022B6D`, cyan `#00B3FC`. Đã xem trực quan bản màu trên nền trắng và bản đơn sắc trên nền navy; **bạn cần xem kỹ chữ S và chữ O** trước khi dùng chính thức. Flutter hiện dùng PNG `assets/images/sporto_v1_with_text.png`; dùng SVG cần `flutter_svg` (chưa kiểm `pubspec.yaml`), nếu không có thì sinh PNG từ vector ở 3 cỡ.

## Risks / Trade-offs

- Mỗi người xem GET lại khi đổi điểm → nhân tải. Giảm bằng chỉ GET khi overlay bật, debounce, cache server 3 s.
- Truy vấn bracket có nguy cơ N+1 → một truy vấn knockout + roster + profiles cho cả division.
- `GET /matches/:id` công khai chưa được kiểm toàn bộ trường nhạy cảm → endpoint mới chọn trường theo danh sách cho phép, test khoá cấm đệ quy.
- Phát hành app Flutter chậm: chỉ thêm trường, client bỏ qua trường lạ; không đổi nghĩa trường cũ (cần đổi nghĩa thì endpoint mới).
- Đổi hành vi ở Web (ở change Web): bật overlay ảnh hưởng mọi người xem.

## Chưa xác minh — phải đối chiếu mã ở task 1.1 trước khi viết mapper

- Giá trị thật của `matches.status`, `matches.bracketBranch`, `tournament_rosters.role` và `.status`; cách nhận biết trận tranh hạng ba; cấu trúc `scoreDetails` (dùng `p1SetsWon/p2SetsWon` trước); cách suy "nội dung là đôi" từ division; thứ tự thành viên trong cặp; phản hồi `findById` có trường nhạy cảm nào.

## Migration / Rollback

- Không migration. Endpoint mới chỉ thêm. Hoàn tác: revert commit; Web/Flutter hiện tại không phụ thuộc endpoint này.

## Follow-up (change riêng, sau khi hợp đồng được duyệt)

1. Web: `redesign-live-overlays` — vẽ lại hai overlay theo khung cố định, nối cờ + socket, nút gọi `PATCH`, logo vector.
2. Flutter: tách overlay khỏi `live_score_screen.dart` ra `widgets/live_overlay/`, vẽ theo mẫu, đọc cờ khi vào/nối lại.
3. Fixture JSON sinh từ Jest của Backend được chép sang Web/Flutter làm đầu vào test hiển thị (ghi commit nguồn ở đầu file).
