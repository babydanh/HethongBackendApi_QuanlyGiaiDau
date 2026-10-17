## 1. Đối chiếu

- [x] 1.1 Xác định đường decode không kiểm chữ ký và các chỗ liên quan. Xong khi: ghi được `file:dòng` trong proposal. Kết quả: `tournaments.controller.ts` (getAuthInfoFromRequest, decode payload không verify) dùng ở `findOne`; `auth.service.ts` đọc header lấy `kid` rồi `jwt.verify` (hợp lệ); `getLiteJoinStatus` dùng `jwtService.verifyAsync` (đã verify).
- [x] 1.2 Xác nhận token cấp hiện nay có `roles` và strategy trả `roles`. Xong khi: ghi được `file:dòng`. Kết quả: `auth.service.ts` (generateTokens, payload có `roles` mảng); `jwt.strategy.ts` `validate` trả `roles`.

## 2. Test viết trước (đỏ đúng lý do)

- [x] 2.1 Viết `src/modules/tournaments/tournaments.controller.public-auth.spec.ts` (TC-PUBJWT-01..08, 11 ca gồm bearer và cookie) dựng HTTP thật bằng supertest, `JwtStrategy` thật, `TournamentDiscoveryService` thật với repository giả. Xong khi: trước khi sửa mã, ca token giả/hết hạn đỏ đúng lý do. Kết quả: 5 đỏ (TC-01 bearer+cookie: 200 thay vì 403; TC-02 bearer+cookie: 200 thay vì 403; TC-08: lộ `inviteCode` "invite-secret" ở giải PUBLIC), 6 xanh (token đúng, không token, giải PUBLIC không token).

## 3. Cài đặt

- [x] 3.1 `findOne`: `@UseGuards(OptionalJwtAuthGuard)` + `@CurrentUser()`; `userId`/`roles` lấy từ principal. Xong khi: test mục 2.1 xanh. Kết quả: 11/11 xanh.
- [x] 3.2 Xoá `getAuthInfoFromRequest`, `extractAccessToken`, import `Request` không dùng; rà `src/` không còn decode payload không verify. Xong khi: grep không còn đoạn tách token rồi decode trong controller. Kết quả: grep `getAuthInfoFromRequest|extractAccessToken|express'` trong controller trống.

## 4. Kiểm chứng

- [x] 4.1 Spec mới và `tournament-discovery.service.spec.ts` xanh. Kết quả: 2 suite, 21/21 test pass.
- [x] 4.2 `tsc --noEmit -p tsconfig.json` không tăng lỗi. Kết quả: exit 0, 0 lỗi.
- [x] 4.3 `openspec validate fix-public-jwt-verify --strict` exit 0. Kết quả: "is valid".
