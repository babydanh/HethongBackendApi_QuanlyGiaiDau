# tournament-manager-access Specification

## Purpose
Quy định quyền quản lý giải cho quản lý CLB sở hữu giải (OWNER/MODERATOR đang `JOINED`/`ACTIVE`) trên các route cấp giải và trận của trang manage. Cổng role chỉ mở thêm `PLAYER` cho các route trong danh sách; quyền thật luôn do `TournamentAccessService.isManager` quyết định theo giải của chính object.

## Requirements

### Requirement: Quản lý CLB sở hữu giải được dùng các route cấp giải của trang manage
Các route cấp giải trong danh sách `design.md` (34 route) MUST cho phép người có system role `PLAYER` đi qua cổng role, nhưng quyền thật MUST được quyết định bởi `TournamentAccessService.isManager` trên giải của chính object: ADMIN, người tạo giải, đồng BTC, hoặc OWNER/MODERATOR với status `JOINED`/`ACTIVE` của `tournament.communityId`. Người không thuộc các nhóm này MUST nhận 403 và MUST NOT thay đổi dữ liệu.

#### Scenario: Chủ CLB sở hữu giải sửa thông tin giải
- **WHEN** người có `PLAYER` là OWNER (status `JOINED`) của CLB sở hữu giải gọi `PATCH /api/v1/tournaments/:id`
- **THEN** phản hồi 200 và giải được cập nhật

#### Scenario: Moderator CLB sở hữu giải thêm VĐV trực tiếp
- **WHEN** người có `PLAYER` là MODERATOR (status `ACTIVE`) của CLB sở hữu giải gọi `POST /api/v1/tournaments/:id/add-athletes/direct`
- **THEN** phản hồi 2xx và VĐV được thêm vào giải đó

#### Scenario: PLAYER ngoài CLB sở hữu giải bị chặn
- **WHEN** người có `PLAYER` không thuộc CLB sở hữu giải gọi `POST /api/v1/tournaments/:id/divisions`
- **THEN** phản hồi 403 và không có nội dung giải thay đổi

#### Scenario: Quản lý CLB khác không sửa được giải của CLB mình không sở hữu
- **WHEN** người là OWNER của CLB A gọi `PATCH /api/v1/tournaments/divisions/:divisionId` với division thuộc giải của CLB B
- **THEN** phản hồi 403 và division không đổi

#### Scenario: Thành viên thường của CLB sở hữu không được quản lý
- **WHEN** người có `PLAYER`, status `JOINED`, role `MEMBER` của CLB sở hữu giải gọi `POST /api/v1/tournaments/:id/publish`
- **THEN** phản hồi 403 và giải không đổi trạng thái

#### Scenario: Giải không tồn tại
- **WHEN** quản lý CLB gọi `PATCH /api/v1/tournaments/:id` với id không tồn tại
- **THEN** phản hồi 404

### Requirement: Quyền lịch, tỷ số và trạng thái trận theo giải CLB
Các thao tác trên trận (`PATCH /api/v1/matches/:id/schedule`, `GET /api/v1/matches/:id/score-access`, `PATCH /api/v1/matches/:id/score`, `PATCH /api/v1/matches/:id/status`, `PATCH /api/v1/matches/:id/operation`, `PATCH /api/v1/matches/:id/court-state`) và lập lịch giải (`POST /api/v1/tournaments/:tournamentId/schedule-plans`) MUST dùng `TournamentAccessService.isManager` với `communityId` của giải. Quản lý CLB sở hữu giải được quyền; quản lý CLB khác hoặc PLAYER thường MUST nhận 403.

#### Scenario: Quản lý CLB sở hữu giải đặt lịch trận
- **WHEN** OWNER của CLB sở hữu giải gọi `PATCH /api/v1/matches/:id/schedule` với `courtId` hợp lệ của giải
- **THEN** phản hồi 200 và lịch trận được lưu

#### Scenario: Quản lý CLB sở hữu giải nhập tỷ số
- **WHEN** MODERATOR (status `ACTIVE`) của CLB sở hữu giải gọi `GET /api/v1/matches/:id/score-access`
- **THEN** phản hồi 200 với `canScore: true`, và `PATCH /api/v1/matches/:id/score` được chấp nhận

#### Scenario: Quản lý CLB khác không đặt lịch được trận
- **WHEN** OWNER của CLB A gọi `PATCH /api/v1/matches/:id/schedule` với trận thuộc giải của CLB B
- **THEN** phản hồi 403 với thông điệp `Bạn không có quyền chỉnh lịch thi đấu của giải này` và lịch trận không đổi

#### Scenario: Quản lý CLB khác không nhập được tỷ số
- **WHEN** OWNER của CLB A gọi `PATCH /api/v1/matches/:id/score` với trận thuộc giải của CLB B
- **THEN** phản hồi 403 và tỷ số không đổi

#### Scenario: PLAYER ngoài CLB không đặt lịch được trận
- **WHEN** PLAYER không thuộc CLB sở hữu giải gọi `PATCH /api/v1/matches/:id/schedule`
- **THEN** phản hồi 403 và lịch trận không đổi

#### Scenario: Trận không tồn tại
- **WHEN** gọi `GET /api/v1/matches/:id/score-access` với id trận không tồn tại
- **THEN** phản hồi 404

### Requirement: Route ngoài phạm vi trang manage giữ nguyên quyền ORGANIZER/ADMIN
Các route trong danh sách ngoài phạm vi của `design.md` (series, playoff, finalize, cancel, groups, import-participants, roster-import một bước, confirm-roster, assign-referee, overlay-visibility, scoreboard-visibility) MUST giữ `@Roles(ORGANIZER, ADMIN)`. Người chỉ có `PLAYER` MUST nhận 403 từ `RolesGuard` dù là quản lý CLB sở hữu giải.

#### Scenario: Quản lý CLB sở hữu giải không tạo được giải series
- **WHEN** người có `PLAYER` là OWNER của CLB gọi `POST /api/v1/tournaments/parent`
- **THEN** phản hồi 403 và không tạo series

#### Scenario: Quản lý CLB không gọi được playoff
- **WHEN** người có `PLAYER` là OWNER của CLB sở hữu giải gọi `POST /api/v1/tournaments/:id/playoff`
- **THEN** phản hồi 403

#### Scenario: ORGANIZER vẫn gọi được route ngoài phạm vi
- **WHEN** người có `ORGANIZER` gọi `POST /api/v1/tournaments/:id/cancel` cho giải của mình
- **THEN** phản hồi theo hành vi hiện có (không đổi bởi change này)

### Requirement: Không đổi hợp đồng HTTP
Thay đổi MUST NOT đổi path, method, DTO, mã lỗi hay định dạng phản hồi của bất kỳ endpoint nào. Phản hồi thành công MUST giữ `data`, `message`, `statusCode`, `meta` như hiện tại.

#### Scenario: Phản hồi thành công giữ nguyên định dạng
- **WHEN** quản lý CLB sở hữu giải gọi `PATCH /api/v1/tournaments/:id` thành công
- **THEN** phản hồi có `data`, `message`, `statusCode` và `meta` như trước change này
