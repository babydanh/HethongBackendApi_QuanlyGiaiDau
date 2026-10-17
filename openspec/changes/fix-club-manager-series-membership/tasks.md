## 1. Đối chiếu

- [x] 1.1 Đọc `openspec/specs/tournament-manager-access/spec.md` và `openspec/changes/archive/2026-10-17-fix-club-manager-tournament-access/design.md`.
- [x] 1.2 Xác định các chỗ kiểm vai trò CLB không kèm `status` trong `src/modules/tournaments/services/` (access, lite, bracket, lifecycle, registration).
- [x] 1.3 Xác định shortcut `community.creatorId` trong `TournamentAccessService.isManager` và nhánh xóa giải của `TournamentLifecycleService`.

## 2. Test viết trước (đỏ)

- [x] 2.1 `tournament-access.service.spec.ts`: người tạo CLB đã rời, người tạo bị hạ xuống MEMBER, MODERATOR với PENDING/INVITED/REJECTED/BANNED.
- [x] 2.2 `tournament-lite.service.authorization.spec.ts` (mới): MODERATOR bị cấm và OWNER đang PENDING bị 403 ở `getLiteParticipants`.
- [x] 2.3 `tournament-lifecycle.service.spec.ts`: `updateParent` cho OWNER của giải con CLB; từ chối cựu quản lý và giải con không có CLB; `update` từ chối MODERATOR bị cấm.
- [x] 2.4 `tournaments.controller-manager-access.spec.ts`: `updateParent` cho PLAYER; `createParent` và `removeParent` vẫn ORGANIZER/ADMIN; `findReferees` có PLAYER; `findDivisions` không có role gate.

## 3. Triển khai

- [x] 3.1 `tournament-access.service.ts`: thêm `isActiveCommunityManager`, dùng trong `isManager` và `assertCommunityTournamentCreator`; bỏ shortcut `creatorId`.
- [x] 3.2 `tournament-lite.service.ts`, `tournament-bracket.service.ts`, `tournament-registration.service.ts`, `tournament-lifecycle.service.ts`: thay mọi kiểm role CLB không kèm `status` bằng `isActiveCommunityManager`.
- [x] 3.3 `tournament-lifecycle.service.ts`: bỏ nhánh `creatorId` trong `remove`; `updateParent` gọi `canManageSeries` (giải cha hoặc giải con có `communityId`).
- [x] 3.4 `tournaments.controller.ts`: `PATCH parent/:id` dùng `@Roles(...TOURNAMENT_MANAGER_ROLES)`; POST và DELETE parent giữ ORGANIZER/ADMIN.

## 4. Kiểm chứng

- [x] 4.1 `node node_modules/jest/bin/jest.js src/modules/tournaments`: 71 suite pass, 3 suite skip (integration cần `DB_URL`), 774 test pass, 0 fail.
- [x] 4.2 `node node_modules/jest/bin/jest.js src/modules/matches`: 26 suite pass, 1 suite skip, 228 test pass, 0 fail.
- [x] 4.3 `tsc --noEmit -p tsconfig.json`: exit 0, 0 lỗi.
- [x] 4.4 `docs/`: không có tài liệu nào mô tả role của `PATCH parent`; không cần sửa `docs/README.md`.
