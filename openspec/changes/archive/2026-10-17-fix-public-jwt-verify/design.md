## Context

`GET /tournaments/:id` là route `@Public()`. Toàn cục có `JwtAuthGuard` (APP_GUARD) và `AccountBanGuard`, cả hai bỏ qua route `@Public()` ngay đầu `canActivate`. Vì vậy trên route này `request.user` không bao giờ được set, và handler phải tự đọc token. Lỗi gốc là handler tự decode payload (`getAuthInfoFromRequest`) thay vì đi qua strategy đã xác minh.

Token cấp hiện nay (`auth.service.ts` generateTokens) có `sub`, `email`, `roles` (mảng), `jti`, `isEmailVerified`, `isMock`; access token ký bằng `auth.jwtAccessSecret`, hạn mặc định 15 phút. `JwtStrategy` (`auth/strategies/jwt.strategy.ts`) đọc token từ `Authorization: Bearer` hoặc cookie `accessToken`, `ignoreExpiration: false`, và `validate` trả `{ id, sub, email, roles, isEmailVerified, isMock }`. Strategy không truy vấn DB và không kiểm phiên bị thu hồi, nên không có gì để tái dùng ngoài chính chữ ký và hạn.

## Decisions

**D1. Dùng `OptionalJwtAuthGuard` thay vì tự gọi `jwtService.verifyAsync`.** Guard này đã được nhiều controller public dùng (`communities`, `social-sessions`, `matches`, `livestream`, `ai`, `club-match-sessions`). Dùng cùng strategy nghĩa là cùng extractor, cùng secret, cùng `ignoreExpiration`. Lỗi gốc chính là hai nơi xác minh theo hai cách khác nhau; tự verify ở controller sẽ tạo lại đúng loại lệch đó.

**D2. Token không hợp lệ = khách, không 401.** `OptionalJwtAuthGuard.handleRequest` bỏ qua `err` và trả `undefined` khi không có `user`. Mọi lỗi của passport (sai chữ ký, hết hạn, `validate` ném vì thiếu `sub`/`email`) đều thành khách. Route public không được phép 401 vì token hỏng, để không phá luồng xem giải của người chưa đăng nhập.

**D3. Principal = `request.user` từ strategy.** Handler nhận `@CurrentUser() user?` rồi truyền `user?.sub ?? null` và `user ? this.getSystemRoles(user) : []` (`getSystemRoles` đã có trong controller, đọc `user.roles`). Không đọc payload thô ở bất kỳ bước nào. Strategy không trả `role` (chuỗi đơn), nhưng token cấp hiện nay có `roles`, nên không mất thông tin.

**D4. Thứ tự guard.** Guard toàn cục chạy trước và bỏ qua vì `@Public()`; guard cấp method `OptionalJwtAuthGuard` chạy sau, nên `request.user` đã có trước khi handler chạy. Không đổi `JwtAuthGuard` hay `AccountBanGuard`.

**D5. Không đổi `TournamentDiscoveryService`.** Nó đã đúng khi nhận `systemRoles` tin cậy. Sửa ở controller là đủ, và không đổi quy tắc hiển thị.

## Test strategy

Test HTTP thật qua supertest trên `TournamentsController` với `JwtStrategy` thật, `ConfigService` giả chỉ trả secret, `TournamentsService` giả chuyển tiếp `findOne` sang `TournamentDiscoveryService` thật (repository và access giả). Cách này kiểm được chuỗi đầy đủ: guard → controller → quy tắc hiển thị giải. Ca "token giả với roles ADMIN" đỏ trước khi sửa (trả 200) và xanh sau khi sửa (403).

## Risks / Trade-offs

- **Cookie/token hết hạn ở client [INFERENCE, chưa đối chiếu code Web/App]:** cookie còn trong trình duyệt nhưng JWT đã hết hạn sẽ thành khách với giải PRIVATE của chính người dùng (trước đây được xem vì không kiểm `exp`). Route public không trả 401 nên client có thể không tự refresh; cần kiểm ở Web trước khi xem đây là hành vi đúng. Hành vi phía server là đúng theo spec: không tin token hết hạn.
- **Vai trò bị thu hồi / tài khoản bị khoá:** strategy không kiểm DB, và `AccountBanGuard` bỏ qua route public, nên quyền ADMIN trong token còn hạn vẫn hiệu lực tối đa theo `jwtAccessExpiresIn` (mặc định 15 phút). Đây là hành vi có sẵn, không do lane này tạo ra; sửa cần thiết kế riêng (kiểm DB như `RolesGuard` hoặc đưa `AccountBanGuard` vào route public).
- **Không đổi `getLiteJoinStatus`:** đã xác minh chữ ký bằng `jwtService.verifyAsync` nên không phải lỗ; khác cách với các route khác chỉ là nợ kỹ thuật.
