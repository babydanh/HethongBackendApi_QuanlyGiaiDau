## Why

Quản lý CLB sở hữu giải (OWNER/MODERATOR đang `JOINED`/`ACTIVE`) không sửa được logo/banner của giải cha. `PATCH /api/v1/tournaments/parent/:id` chỉ cho `ORGANIZER`/`ADMIN` (`tournaments.controller.ts`, decorator `@Roles` trên `updateParent`), trong khi trang manage của Web gọi endpoint này (`BasicInfoTab.tsx`, `manage/page.tsx`).

Đồng thời, quyền quản lý theo CLB còn ba đường cấp quyền cho người đã rời, bị cấm, chờ duyệt hoặc bị hạ quyền:

- `TournamentAccessService.isManager` cho người tạo CLB đi qua `community.creatorId` mà không cần dòng thành viên còn hiệu lực.
- Các nhánh fallback `member.role === 'OWNER' || member.role === 'MODERATOR'` trong lite, bracket, lifecycle và registration không kiểm `status`. `banMember` cho phép cấm cả MODERATOR, nên bản ghi `BANNED`/`MODERATOR` tồn tại thật.
- Khi mở `PLAYER` cho các route manage, các nhánh trên trở thành đường vào mới cho người đã bị cấm.

## What Changes

- Thêm một điều kiện duy nhất `isActiveCommunityManager(member)` trong `tournament-access.service.ts`: status `JOINED` hoặc `ACTIVE` và role `OWNER` hoặc `MODERATOR` (không phân biệt hoa thường). `isManager`, `assertCommunityTournamentCreator` và mọi nhánh fallback quyền CLB trong module `tournaments` đều dùng điều kiện này.
- Bỏ shortcut `community.creatorId` khỏi `TournamentAccessService.isManager` và khỏi nhánh xóa giải của `TournamentLifecycleService`.
- `PATCH /api/v1/tournaments/parent/:id`: đổi `@Roles(ORGANIZER, ADMIN)` thành `@Roles(...TOURNAMENT_MANAGER_ROLES)`. `TournamentLifecycleService.updateParent` cho phép khi `isManager` đúng với giải cha, hoặc đúng với một giải con chưa xóa có `communityId` của giải cha đó.
- `POST` và `DELETE /api/v1/tournaments/parent/:id` giữ `ORGANIZER`/`ADMIN`.
- Không đổi path, method, DTO, mã lỗi hay định dạng phản hồi.

## Impact

- API: không đổi contract. Đổi hành vi: người đã rời, bị cấm hoặc đang chờ duyệt mất quyền quản lý trên mọi route manage theo CLB; người tạo CLB đã rời CLB mất quyền theo CLB; quản lý CLB sở hữu một giải con sửa được logo/banner giải cha.
- Mã: `tournament-access.service.ts`, `tournament-lifecycle.service.ts`, `tournament-lite.service.ts`, `tournament-bracket.service.ts`, `tournament-registration.service.ts`, `tournaments.controller.ts`, và spec tương ứng.
- Tài liệu: `openspec/specs/tournament-manager-access/spec.md` được cập nhật qua archive.
- Web: không đổi code trong change này. Nới layout cho PLAYER do agent WebClubAccess xử lý.
- DB: không có migration.

## Out of scope

- Module `communities` (`checkPermissions` trong `communities.service.ts`), `club-match-sessions` (`MANAGER_ROLES`) và `chat` có kiểm vai trò CLB riêng. Không thuộc route giải; chưa kiểm chứng trong change này.
- Quyền theo `createdBy` và đồng BTC (`isCoOrganizer`) của giải không đổi, theo quyết định D4. Hệ quả còn lại được nêu trong `design.md`.
- `tournament-lite.service.ts` (tạo Lite, danh sách role `['OWNER', 'ADMIN', 'MODERATOR']`) đã yêu cầu `status === 'JOINED'`; không đổi.
- Trang Web và Flutter.
