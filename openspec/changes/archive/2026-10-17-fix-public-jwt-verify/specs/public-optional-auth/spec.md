## ADDED Requirements

### Requirement: Route public chỉ tin danh tính từ JWT đã xác minh
`GET /tournaments/:id` (route `@Public()`) MUST xác định người gọi bằng strategy `jwt` của app, với cùng nguồn token (`Authorization: Bearer` hoặc cookie `accessToken`), cùng secret và kiểm chữ ký cùng hạn `exp`. Token không hợp lệ vì bất kỳ lý do nào (sai chữ ký, hết hạn, thiếu `sub` hoặc `email`) hoặc không có token MUST coi người gọi là khách và MUST NOT trả 401. Handler MUST NOT đọc `sub` hay `roles` từ payload JWT chưa xác minh.

#### Scenario: Giải PRIVATE, token ký sai secret mang roles ADMIN
- **WHEN** khách gọi `GET /tournaments/:id` của giải `visibility=PRIVATE` với JWT ký bằng secret khác, payload `roles: ["ADMIN"]`
- **THEN** phản hồi 403 và không có dữ liệu giải, kể cả `inviteCode`

#### Scenario: Giải PRIVATE, token ADMIN đã hết hạn
- **WHEN** JWT có chữ ký đúng nhưng `exp` đã qua, `roles: ["ADMIN"]`
- **THEN** phản hồi 403 và không có dữ liệu giải

#### Scenario: Giải PRIVATE, token ADMIN đúng qua Bearer hoặc cookie
- **WHEN** JWT ký đúng secret, còn hạn, `roles: ["ADMIN"]`, gửi qua `Authorization: Bearer` hoặc cookie `accessToken`
- **THEN** phản hồi 200 với dữ liệu giải

#### Scenario: Giải PRIVATE, không có token
- **WHEN** khách không gửi token
- **THEN** phản hồi 403 như trước thay đổi này

#### Scenario: Giải PUBLIC, không có token
- **WHEN** khách không gửi token gọi giải `visibility=PUBLIC`
- **THEN** phản hồi 200 với dữ liệu giải

#### Scenario: Giải PUBLIC, token sai chữ ký
- **WHEN** JWT sai chữ ký gọi giải `visibility=PUBLIC`
- **THEN** phản hồi 200 (coi như khách), MUST NOT là 401

### Requirement: Quyền xem giải theo vai trò lấy từ principal đã xác thực
`GET /tournaments/:id` MUST truyền `systemRoles` vào `TournamentDiscoveryService.findOne` lấy từ `roles` của principal do strategy xác thực, không từ payload thô. Quy tắc hiển thị giải (PRIVATE, mã mời, CLB, trạng thái SUSPENDED/CANCELLED/DRAFT) MUST NOT đổi.

#### Scenario: Owner xem giải PRIVATE của mình
- **WHEN** owner gọi với token đúng, còn hạn
- **THEN** phản hồi 200 và có `inviteCode`

#### Scenario: Người không liên quan với token đúng, không phải ADMIN
- **WHEN** người dùng có token đúng, roles `["PLAYER"]`, không phải owner/participant/thành viên CLB, không có mã mời, gọi giải PRIVATE
- **THEN** phản hồi 403

### Requirement: Hình dạng phản hồi chi tiết giải không đổi
Phản hồi `GET /tournaments/:id` MUST NOT thêm hoặc bớt trường nào so với trước thay đổi này; chỉ đổi kết quả allow/deny theo danh tính đã xác minh.

#### Scenario: Token đúng không đổi hình dạng
- **WHEN** token hợp lệ gọi giải PUBLIC
- **THEN** các trường phản hồi giống hệt trước thay đổi

### Requirement: Không còn decode JWT thủ công để lấy danh tính
Trong `src/`, MUST NOT có code tách payload JWT rồi base64-decode để lấy `sub`, `roles` hay `role` mà không xác minh chữ ký. Đọc header JWT để chọn khoá (`kid`) trước khi `jwt.verify` được phép.

#### Scenario: Quét mã nguồn
- **WHEN** tìm trong `src/` các đoạn tách token theo `.` rồi decode payload
- **THEN** không còn đoạn nào trong `tournaments.controller.ts`; đoạn Apple (`auth.service.ts`) chỉ đọc header rồi `jwt.verify`
