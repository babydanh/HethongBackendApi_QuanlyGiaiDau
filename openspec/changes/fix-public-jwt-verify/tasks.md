## 1. Đối chiếu

- [x] 1.1 Xác định đường decode không kiểm chữ ký và các chỗ liên quan. Xong khi: ghi được `file:dòng` trong proposal. Kết quả: `tournaments.controller.ts:658-688` (dùng ở `:636`) decode payload không verify; `auth.service.ts:579-603` đọc header lấy `kid` rồi `jwt.verify` (hợp lệ); `getLiteJoinStatus` dùng `jwtService.verifyAsync` (đã verify).
- [x] 1.2 Xác nhận token cấp hiện nay có `roles` và strategy trả `roles`. Xong khi: ghi được `file:dòng`. Kết quả: `auth.service.ts:462-500` payload có `roles` mảng; `jwt.strategy.ts` `validate` trả `roles`.

## 2. Test viết trước (đỏ đúng lý do)

- [x] 2.1 Viết `src/modules/tournaments/tournaments.controller.public-auth.spec.ts` (TC-PUBJWT-01..07) dựng HTTP thật bằng supertest, `JwtStrategy` thật, `TournamentDiscoveryService` thật với repository giả. Xong khi: trước khi sửa mã, ca token giả/hết hạn trên giải PRIVATE đỏ đúng lý do (trả 200 thay vì 403); ca token đúng, không token, giải PUBLIC xanh.

## 3. Cài đặt

- [x] 3.1 `findOne`: `@UseGuards(OptionalJwtAuthGuard)` + `@CurrentUser()`; `userId`/`roles` lấy từ principal. Xong khi: test mục 2.1 xanh.
- [x] 3.2 Xoá `getAuthInfoFromRequest`, `extractAccessToken` và import không dùng; rà lại `src/` không còn decode payload không verify. Xong khi: grep không còn đoạn tách token rồi decode trong controller.

## 4. Kiểm chứng

- [x] 4.1 Spec mới xanh; spec `tournament-discovery.service.spec.ts` vẫn xanh. Kết quả: xem báo cáo cuối.
- [x] 4.2 `NODE_OPTIONS=--max-old-space-size=4096 node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` không tăng so với baseline 12 lỗi trong `*.spec.ts`. Kết quả: xem báo cáo cuối.
- [x] 4.3 `openspec validate fix-public-jwt-verify --strict` exit 0. Kết quả: xem báo cáo cuối.
- [ ] 4.4 Archive sau khi rebase lên `origin/main` mới nhất (không archive trước rebase).
