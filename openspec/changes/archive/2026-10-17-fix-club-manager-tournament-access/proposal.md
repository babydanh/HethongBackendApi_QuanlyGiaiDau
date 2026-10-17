## Why

Giải thuộc CLB (`tournament.communityId`) được quản lý bằng trang quản lý đầy đủ `/organizer/tournaments/:id/manage` (Web `a1fb427e` bỏ chuyển hướng sang trang lite). Quản lý CLB sở hữu giải (`community_members.role` = `OWNER` hoặc `MODERATOR`, status `JOINED`/`ACTIVE`) thường chỉ có system role `PLAYER`. Hiện tại 34 endpoint cấp giải mà trang manage gọi bị `@Roles(ORGANIZER, ADMIN)` chặn ở `RolesGuard` (`src/common/guards/roles.guard.ts`) trước khi service kiểm quyền, nên quản lý CLB nhận 403 dù đúng là người quản lý giải đó. Ngoài ra tầng trận (`matches.service.ts` `isTournamentManager`) chỉ tính người tạo giải và CO_ORGANIZER, nên lịch thi đấu, tỷ số và trạng thái trận cũng bị 403 cho quản lý CLB.

## What Changes

- Cho `PLAYER` đi qua cổng role ở 34 handler cấp giải của `TournamentsController` mà trang manage thực gọi (danh sách và dòng kiểm quyền trong `design.md`). Các handler này dùng chung hằng số `TOURNAMENT_MANAGER_ROLES = [ORGANIZER, ADMIN, PLAYER]`.
- Quyền thật vẫn do service: mỗi handler đã gọi `TournamentAccessService.isManager(tournament, userId, systemRoles)` trên giải của chính object (đã truy vết từng route, xem `design.md`). `isManager` cho phép ADMIN, người tạo giải, đồng BTC, và OWNER/MODERATOR (status `JOINED`/`ACTIVE`) của `tournament.communityId`. Quản lý CLB khác hoặc PLAYER ngoài CLB nhận 403.
- `matches.service.ts` `isTournamentManager` chuyển từ `matchesRepository.isTournamentManager` (chỉ createdBy + CO_ORGANIZER) sang `TournamentAccessService.isManager` với `communityId` của giải. Áp dụng cho schedule, score, score-access, status, operation, court-state và các kiểm tra lập lịch giải (`schedule-plans`).
- `TournamentsModule` export `TournamentAccessService`; `MatchesModule` import `forwardRef(() => TournamentsModule)`.
- Xoá `MatchesRepository.isTournamentManager` (không còn caller) và thêm `communityId` vào `findScheduleTournament`.
- Test: ma trận quyền (quản lý CLB sở hữu → được; PLAYER ngoài CLB → 403; quản lý CLB khác → 403) cho route ghi (sửa giải, xoá bảng, thêm/xoá VĐV, ghép cặp, tạo sơ đồ, nội dung) và cho schedule/score.

## Impact

- API: không đổi path, method, DTO hay định dạng response. Thay đổi duy nhất là các request từ quản lý CLB sở hữu giải chuyển từ 403 sang 200; người không có quyền vẫn 403.
- Web Next.js (`HethongFrontEndWeb_QLgiaidau`): trang manage/ops bị `hasOrganizerRole` trong `src/app/organizer/layout.tsx` chặn cho PLAYER. Việc nới cổng layout do agent WebClubAccess xử lý, không thuộc change này. Endpoint đã đủ cho Web.
- App Flutter: không đổi endpoint hay DTO; không kiểm tra thêm.
- Không migration DB.

## Out of scope

- Các route series (`POST /api/v1/tournaments/parent`, `PATCH /api/v1/tournaments/parent/:id`, `DELETE /api/v1/tournaments/parent/:id`): `parent` không có `communityId`, không có quyền CLB để nới.
- Route trang manage không gọi (`POST /api/v1/tournaments/:id/playoff`, `POST /api/v1/tournaments/:id/stages/:stageId/finalize`, `PATCH /api/v1/tournaments/groups/:id`, `POST /api/v1/tournaments/:id/cancel`, `POST /api/v1/tournaments/:id/confirm-roster`, `POST /api/v1/tournaments/:id/import-participants/preview`, `POST /api/v1/tournaments/:id/import-participants`, `POST /api/v1/tournaments/:id/roster-import`): giữ ORGANIZER/ADMIN.
- `PATCH /api/v1/matches/:id/assign-referee`, `PATCH /api/v1/matches/:id/overlay-visibility`, `PATCH /api/v1/matches/:id/scoreboard-visibility`, mute/ban trận: trang manage/ops không gọi, giữ nguyên role.
- Sửa lớp `checkLiteAuthorization` (lite) và ràng buộc `status` JOINED/ACTIVE cho quản lý lite: ghi nhận như rủi ro, không đổi trong change này.
- Trang Web, App Flutter, và cổng layout Web.
