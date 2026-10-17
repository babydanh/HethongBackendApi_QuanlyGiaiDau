## Why

`GET /tournaments/:id` là route `@Public()`. `TournamentsController.getAuthInfoFromRequest` (`tournaments.controller.ts`, trước sửa `:658-688`, gọi từ `findOne`) tự tách và base64-decode phần payload của JWT mà KHÔNG kiểm chữ ký và KHÔNG kiểm `exp`, rồi `TournamentDiscoveryService.findOne` tin `roles` trong payload để bỏ qua kiểm giải riêng (`tournament-discovery.service.ts`: `isAdmin` ở `:235`, kiểm PRIVATE/CLB ở `:273-318`, lộ `inviteCode` ở `:321-323`).

Hệ quả đã kiểm bằng test tái hiện: JWT tự ký bằng secret bất kỳ với `roles: ["ADMIN"]` xem được giải `visibility=PRIVATE` (trả 200 thay vì 403), và giải PUBLIC lộ `inviteCode` (chỉ owner/ADMIN được thấy). Nguyên nhân gốc: `JwtAuthGuard` toàn cục bỏ qua xác thực ở route public (`src/common/guards/jwt-auth.guard.ts:16-24`), nên route này không có principal đã xác thực nào và handler tự đọc token thô.

## What Changes

- `findOne` đổi sang `@UseGuards(OptionalJwtAuthGuard)` (đã có trong repo) và lấy người gọi từ `@CurrentUser()`. Guard này dùng đúng strategy `jwt` của app: cùng nguồn token (`Authorization: Bearer` hoặc cookie `accessToken`), cùng `auth.jwtAccessSecret`, `ignoreExpiration: false`. Token sai chữ ký, hết hạn, thiếu `sub`/`email` hoặc không có token: người gọi là khách, KHÔNG trả 401 (route public).
- `systemRoles` truyền vào service = `roles` của principal đã xác thực (`request.user` do `JwtStrategy.validate` trả về), không còn đọc từ payload thô.
- Xoá `getAuthInfoFromRequest`, `extractAccessToken` và import `Request` không còn dùng.
- Rà toàn `src/`: không còn chỗ nào tự decode payload JWT để lấy danh tính hay vai trò. Đã đối chiếu hai chỗ khác có liên quan: `auth.service.ts` (Apple) chỉ decode header lấy `kid` rồi xác minh bằng `jwt.verify` (hợp lệ, không sửa); `TournamentsController.getLiteJoinStatus` dùng `jwtService.verifyAsync` (đã xác minh chữ ký, không sửa trong lane này).
- Test mới `src/modules/tournaments/tournaments.controller.public-auth.spec.ts` (TC-PUBJWT-01..08) dựng HTTP thật qua supertest với strategy thật.

Ghi chú nghiệp vụ: không có quyết định nghiệp vụ mới; đây là sửa lỗ xác thực, quy tắc hiển thị giải giữ nguyên.

## Out of scope

- Không đổi luồng đăng nhập, cấp/refresh token, `JwtStrategy.validate`, không thêm kiểm DB cho role.
- Không đổi quy tắc hiển thị trong `TournamentDiscoveryService.findOne` (PRIVATE, invite, CLB, trạng thái SUSPENDED/CANCELLED/DRAFT).
- Không đổi `getLiteJoinStatus` (đã verify) và không đổi các route khác.
- Không đổi hình dạng phản hồi; không cần `sync-api-clients`.
- Ghi nhận rủi ro đã có trước, không sửa trong lane này: `AccountBanGuard` toàn cục cũng bỏ qua route public, nên tài khoản bị khoá vẫn đọc được giải PRIVATE bằng token còn hạn (tối đa 15 phút theo cấu hình mặc định) như trước.

## Impact

- Endpoint: `GET /api/v1/tournaments/:id`. Chỉ đổi kết quả với token giả/sai chữ ký/hết hạn (từ "tin payload" sang "khách"). Token đúng: không đổi.
- Hình dạng phản hồi không đổi nên không cần đổi hợp đồng ở Web/App. [INFERENCE] Web/App gửi token qua cookie hoặc Bearer; chưa đối chiếu code Web/App trong lane này.
- Tệp: `src/modules/tournaments/tournaments.controller.ts`, test mới `src/modules/tournaments/tournaments.controller.public-auth.spec.ts`.
- Triển khai: push `main` Backend = deploy production.
