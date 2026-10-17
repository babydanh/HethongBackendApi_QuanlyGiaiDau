## Why

`GET /tournaments/:id` là route `@Public()`. `TournamentsController.getAuthInfoFromRequest` (`tournaments.controller.ts:658-688`) tự tách và base64-decode phần payload của JWT mà KHÔNG kiểm chữ ký và KHÔNG kiểm `exp`, rồi `TournamentDiscoveryService.findOne` tin `roles` trong payload để bỏ qua kiểm giải riêng (`tournament-discovery.service.ts:234-235`, `:273-318`, `:321-323`).

Hệ quả đã đọc mã: bất kỳ ai tự ký JWT bằng secret bất kỳ với `roles: ["ADMIN"]` đều xem được giải `visibility=PRIVATE` và giải CLB, và nhận được `inviteCode` (chỉ owner/ADMIN mới được thấy). Nguyên nhân gốc: `JwtAuthGuard` toàn cục bỏ qua xác thực ở route public (`src/common/guards/jwt-auth.guard.ts:16-24`), nên route này không có principal đã xác thực nào và handler tự đọc token thô.

## What Changes

- `findOne` đổi sang `@UseGuards(OptionalJwtAuthGuard)` (đã có trong repo) và lấy người gọi từ `@CurrentUser()`. Guard này dùng đúng strategy `jwt` của app: cùng nguồn token (`Authorization: Bearer` hoặc cookie `accessToken`), cùng `auth.jwtAccessSecret`, `ignoreExpiration: false`. Token sai chữ ký, hết hạn, thiếu `sub`/`email` hoặc không có token: người gọi là khách, KHÔNG trả 401 (route public).
- `systemRoles` truyền vào service = `roles` của principal đã xác thực (`request.user` do `JwtStrategy.validate` trả về), không còn đọc từ payload thô.
- Xoá `getAuthInfoFromRequest` và `extractAccessToken` cùng các import không còn dùng.
- Rà toàn `src/`: không còn chỗ nào tự decode payload JWT để lấy danh tính hay vai trò. Đã đối chiếu hai chỗ khác có liên quan: `auth.service.ts:579` chỉ decode header lấy `kid` rồi xác minh bằng `jwt.verify` ở `:603` (hợp lệ, không sửa); `TournamentsController.getLiteJoinStatus` dùng `jwtService.verifyAsync` (đã xác minh chữ ký, không sửa trong lane này).
- Test mới `src/modules/tournaments/tournaments.controller.public-auth.spec.ts` (TC-PUBJWT-NN) dựng HTTP thật qua supertest với strategy thật.

Ghi chú nghiệp vụ: không có quyết định nghiệp vụ mới; đây là sửa lỗ xác thực, quy tắc hiển thị giải giữ nguyên.

## Out of scope

- Không đổi luồng đăng nhập, cấp/refresh token, `JwtStrategy.validate`, không thêm kiểm DB cho role.
- Không đổi quy tắc hiển thị trong `TournamentDiscoveryService.findOne` (PRIVATE, invite, CLB, trạng thái SUSPENDED/CANCELLED).
- Không đổi `getLiteJoinStatus` (đã verify) và không đổi các route khác.
- Không đổi hình dạng phản hồi; không cần `sync-api-clients`.
- Ghi nhận rủi ro đã có trước, không sửa trong lane này: `AccountBanGuard` toàn cục cũng bỏ qua route public, nên tài khoản bị khoá vẫn đọc được giải PRIVATE bằng token còn hạn (tối đa 15 phút theo cấu hình mặc định) như trước.

## Impact

- Endpoint: `GET /api/v1/tournaments/:id`. Chỉ đổi hành vi với token giả/sai chữ ký/hết hạn (từ "tin payload" sang "khách"). Token đúng: không đổi.
- Web: vẫn gửi token qua cookie `accessToken`; `main.ts` đã có `cookieParser()` nên strategy đọc được cookie. Rủi ro UX: trình duyệt còn giữ cookie đã hết hạn sẽ thành khách với giải PRIVATE của chính mình (trước đây được xem vì không kiểm `exp`). Không có thay đổi hợp đồng ở Web.
- App Flutter: gửi Bearer; token còn hạn không đổi.
- Tệp: `src/modules/tournaments/tournaments.controller.ts`, test mới `src/modules/tournaments/tournaments.controller.public-auth.spec.ts`.
- Triển khai: push `main` Backend = deploy production.
