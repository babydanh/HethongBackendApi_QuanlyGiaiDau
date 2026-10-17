## 1. Đối chiếu dữ liệu thật (làm trước khi viết mapper)

- [x] 1.1 Đọc mã và ghi vào `design.md` mục "Đã đối chiếu mã thật": giá trị `matches.status`, `bracketBranch`, `tournament_rosters.role/status`; cách nhận trận tranh hạng ba; nội dung đôi; truy vấn bracket/`findById` không lọc roster. Xong khi: mỗi mục có `file:dòng` thật. Kết quả: có; `scoreDetails` không dùng (điểm lấy từ `p1SetsWon/p2SetsWon`); còn một điều chưa xác minh được (kiểu stage loại trực tiếp trong giải vòng bảng + loại trực tiếp) đã ghi rõ ở `design.md`.

## 2. Hợp đồng và dữ liệu mẫu

- [x] 2.1 Tạo `src/modules/matches/overlay/overlay.types.ts` đúng interface trong `design.md`. Xong khi: `NODE_OPTIONS=--max-old-space-size=4096 pnpm exec tsc --noEmit` không thêm lỗi so với baseline 12. Kết quả: 12 lỗi (đúng baseline), 0 lỗi trong file mới.
- [x] 2.2 Fixture vàng JSON trong `test/fixtures/overlay/`: `doubles-16-current-qf2`, `singles-8-final`, `bye-tbd-waiting-team3` (sinh bằng `UPDATE_OVERLAY_FIXTURES=1`, so sánh trong `overlay-view.spec.ts`). Các ca còn lại (tên dài, đội 3 người, cặp 1 người, 32/64 cặp, vòng bảng, trận ngoài sơ đồ) được phủ bằng test dựng dữ liệu trong code. Xong khi: 3 file tồn tại và được test đọc. Kết quả: có.

## 3. Mapper thuần (không chạm DB)

- [x] 3.1 `overlay-name.ts`: NFC, NBSP, tên gọi, trùng → 2 từ cuối, ≥3 hoặc 0 thành viên → `teamName`, `note`. Xong khi: `pnpm exec jest src/modules/matches/overlay/overlay-name.spec.ts` exit 0. Kết quả: 12 test pass; viết test trước, đỏ vì sai hành vi rồi mới cài.
- [x] 3.2 `overlay-bracket.ts`: nhãn vòng, cửa sổ 4 cột, `live`/`litNext`/`nextId`/`final`, dòng thẻ. Xong khi: jest pass, gồm bảng T=1..6 × mọi k. Kết quả: pass.
- [x] 3.3 `overlay-view.ts`: H2H (`title` "ĐỐI ĐẦU", `round`), bracket null + lý do cho thể thức chưa hỗ trợ, tiêu đề/môn viết hoa. Xong khi: `overlay-view.spec.ts` pass. Kết quả: pass.

## 4. Truy vấn, endpoint, cache

- [x] 4.1 `overlay.repository.ts`: bốn truy vấn cố định (ngữ cảnh trận, trận nhánh chính, bên tham gia, roster ACTIVE MAIN), không N+1. Xong khi: test đếm lần gọi repository ≤ 1 mỗi loại cho giải 2 vòng và SQL được in ra soi bằng `toSQL()`. Kết quả: pass; **SQL chưa chạy trên Postgres thật** (Docker không chạy).
- [x] 4.2 Route `GET /matches/:id/overlay` (`@Public`, `OptionalJwtAuthGuard`, `Cache-Control: private, no-store`), `OverlayService` kiểm quyền bằng `canAccessLiveMatch`, cache nội dung 3 s, hai cờ luôn mới, không cache 404, điểm live từ Redis. Xong khi: `overlay.service.spec.ts` pass cho 200, 404 (không tồn tại và không có quyền cùng thông báo), cache hit, cờ mới, Redis lỗi, cache hỏng. Kết quả: pass; module `matches` 23 suite/185 test pass (bỏ test integration cần DB).
- [x] 4.3 Test riêng tư: duyệt đệ quy phản hồi, không có khoá `email`, `phone`, `phoneNumber`, `userId`, `elo`, `eloPoints`, `seed`, `code`. Xong khi: pass, và cố ý làm mapper lộ khoá thì test đỏ. Kết quả: đã làm thử, cả hai test riêng tư đỏ, đã hoàn lại, test xanh.

## 5. Thuật ngữ và tài liệu

- [x] 5.1 Định nghĩa "H2H = màn giới thiệu hai bên, không phải lịch sử đối đầu". Backend chưa có `GLOSSARY.md` và `docs/README.md` yêu cầu mọi file `.md` mới phải có nhãn, nên không tạo file mới: định nghĩa nằm ở JSDoc của `OverlayH2h` (`overlay.types.ts`) và `design.md`. Endpoint có `@ApiOperation` (Swagger). Xong khi: JSDoc và `design.md` có định nghĩa. Kết quả: có.

## 6. Kiểm chứng cuối

- [x] 6.1 3 file logo SVG nằm trong `openspec/changes/add-live-overlay-view-model/assets/` và mở được bằng ImageMagick (đã vẽ lại ra ảnh để xem). Xong khi: `magick <file> out.png` exit 0. Kết quả: có (bản đơn sắc cần thay `currentColor` bằng màu cụ thể khi vẽ bằng ImageMagick).
- [x] 6.2 `openspec validate add-live-overlay-view-model --strict` exit 0. Kết quả: exit 0.
- [x] 6.3 Task cuối: `NODE_OPTIONS=--max-old-space-size=4096 pnpm exec tsc --noEmit` so với baseline 12 lỗi (không tăng), `pnpm exec jest src/modules/matches/overlay` và `pnpm exec jest src/modules/matches --testPathIgnorePatterns integration`, `pnpm exec eslint` trên file nguồn và spec mới. Kết quả: tsc 12 lỗi (đúng baseline, 0 trong file mới); jest overlay 5 suite/71 test, module matches 23 suite/185 test; eslint nguồn và spec exit 0.
