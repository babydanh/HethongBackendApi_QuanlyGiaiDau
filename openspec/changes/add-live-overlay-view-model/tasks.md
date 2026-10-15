## 1. Đối chiếu dữ liệu thật (làm trước khi viết mapper)

- [ ] 1.1 Đọc mã và ghi vào `design.md` mục "Đã đối chiếu": giá trị thật của `matches.status`, `bracketBranch`, `tournament_rosters.role/status`; cách nhận trận tranh hạng ba; cấu trúc `scoreDetails`; cách suy nội dung đôi; phản hồi `findById` có trường nhạy cảm nào. Xong khi: mỗi mục có `file:dòng` thật và mục "Chưa xác minh" không còn dòng nào chưa trả lời.

## 2. Hợp đồng và dữ liệu mẫu

- [ ] 2.1 Tạo `src/modules/matches/overlay/overlay.types.ts` đúng interface trong `design.md`. Xong khi: `NODE_OPTIONS=--max-old-space-size=4096 pnpm exec tsc --noEmit` không thêm lỗi so với baseline 12.
- [ ] 2.2 Tạo fixture JSON trong `test/fixtures/overlay/`: `singles-8`, `doubles-8`, `bye`, `tbd`, `long-names`, `pair-one-member`, `team-3`, `bracket-16`, `bracket-32-round-1`, `group-stage`, `unrelated-match`. Xong khi: mọi file tồn tại và được test đọc (không còn file mồ côi).

## 3. Mapper thuần (không chạm DB)

- [ ] 3.1 `overlay-name.ts`: NFC, trim, NBSP, tên gọi, trùng → 2 từ cuối, ≥3 hoặc 0 thành viên → `teamName`, `note`. Xong khi: `pnpm exec jest src/modules/matches/overlay/overlay-name.spec.ts` exit 0, test phủ đủ các scenario "Tên hiển thị một bên".
- [ ] 3.2 `overlay-bracket.ts`: nhãn vòng theo khoảng cách tới chung kết, cửa sổ 4 cột, `live`/`litNext`/`nextId`/`final`, dòng thẻ (`name` null, "BYE", `score`, `won`), `bracket` null + `bracketReason` cho vòng bảng/loại kép. Xong khi: `pnpm exec jest .../overlay-bracket.spec.ts` exit 0, gồm bảng T=1..6 × mọi k (độ dài cửa sổ = min(4,T) và chứa vòng k).
- [ ] 3.3 `overlay-h2h.ts`: nhãn vòng, hai bên, avatar + chữ cái đầu. Xong khi: `pnpm exec jest .../overlay-h2h.spec.ts` exit 0.

## 4. Truy vấn, endpoint, cache

- [ ] 4.1 Repository: một truy vấn lấy các trận loại trực tiếp của division cùng roster và `profiles` (họ tên, avatar), không N+1. Xong khi: test spy đếm truy vấn ≤ 3 cho giải 16 cặp.
- [ ] 4.2 Controller `GET /matches/:id/overlay`: công khai, `OptionalJwtAuthGuard`, cùng kiểm quyền xem trận với `GET /matches/:id`; cache theo `:id` ≤ 3 s, không cache 404. Xong khi: Jest controller/service pass: 200, 404, cache hit (truy vấn chạy 1 lần cho 2 yêu cầu), cache hết hạn trả điểm mới.
- [ ] 4.3 Test riêng tư: duyệt đệ quy phản hồi mẫu, không có khoá `email`, `phone`, `userId`, `elo`, `seed`. Xong khi: Jest pass; sửa thử mapper cho lộ một khoá thì test này đỏ (ghi lại trong log, rồi hoàn lại).

## 5. Thuật ngữ và tài liệu

- [ ] 5.1 Thêm thuật ngữ "H2H = màn giới thiệu đối đầu, không phải lịch sử đối đầu" vào GLOSSARY với mục `_Avoid_`; ghi endpoint mới vào chỗ liệt kê API của repo (nếu có). Xong khi: `grep` thấy mục mới và không có chỗ nào khác gọi H2H là lịch sử.

## 6. Kiểm chứng cuối

- [ ] 6.1 Đính kèm 3 file logo vào kho tài sản của hai app là việc của change Web/Flutter; ở đây chỉ giữ `assets/` làm nguồn. Xong khi: 3 file SVG có trong `openspec/changes/add-live-overlay-view-model/assets/` và mỗi file mở được bằng ImageMagick (`magick <file> out.png` exit 0).
- [ ] 6.2 `openspec validate add-live-overlay-view-model --strict` exit 0.
- [ ] 6.3 Task cuối: `NODE_OPTIONS=--max-old-space-size=4096 pnpm exec tsc --noEmit` so với baseline 12 lỗi trong `*.spec.ts` (không được tăng), cộng `pnpm exec jest src/modules/matches` và `pnpm exec eslint` trên các file nguồn mới. Xong khi: số lỗi tsc không tăng, jest exit 0, eslint 0 lỗi.
