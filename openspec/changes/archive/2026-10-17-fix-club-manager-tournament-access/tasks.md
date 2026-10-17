## 1. Đối chiếu

- [x] 1.1 Xác định 34 route cấp giải mà trang manage gọi và đang ORGANIZER/ADMIN-only. Xong khi: có bảng route với `controller:dòng` và `service:dòng isManager` trong `design.md`.
- [x] 1.2 Truy vết handler → service → dòng `isManager` cho từng route, gồm helper `assertImportable`/`assertTournamentManager` (`tournament-import.service.ts:401`).
- [x] 1.3 Xác định tầng trận: `matches.service.ts` `isTournamentManager` chỉ tính createdBy + CO_ORGANIZER; quyết định D4 (chọn A) của Main.

## 2. Test viết trước (đỏ đúng lý do)

- [x] 2.1 `src/modules/tournaments/tournaments.controller-manager-access.spec.ts`: đọc `ROLES_KEY` của 34 handler, kỳ vọng có `PLAYER`, vẫn có `ORGANIZER` và `ADMIN`; các route ngoài phạm vi vẫn KHÔNG có `PLAYER`. Chạy trước khi sửa: đỏ ở 34 handler.
- [x] 2.2 `src/modules/tournaments/services/tournament-access.service.spec.ts`: thêm ma trận IDOR (mock `findCommunityMember` theo `communityId`): OWNER CLB sở hữu → true; OWNER CLB khác → false; PLAYER ngoài CLB → false; MODERATOR `ACTIVE` sở hữu → true; MEMBER → false; ADMIN → true. Đây là hồi quy cho logic có sẵn; ghi rõ trong báo cáo là hồi quy, không đỏ.
- [x] 2.3 `src/modules/matches/matches.service.authorization.spec.ts`: thêm ma trận schedule/score/score-access với `TournamentAccessService` thật (repository mock): OWNER CLB sở hữu → được; OWNER CLB khác → 403; PLAYER ngoài → 403. Chạy trước khi sửa: đỏ ở các ca CLB sở hữu.

## 3. Triển khai

- [x] 3.1 `tournaments.controller.ts`: thêm `TOURNAMENT_MANAGER_ROLES` và thay `@Roles(UserRole.ORGANIZER, UserRole.ADMIN)` ở 34 dòng trong `design.md` bằng `@Roles(...TOURNAMENT_MANAGER_ROLES)`. Không đổi dòng nào khác.
- [x] 3.2 `tournaments.module.ts`: export `TournamentAccessService`.
- [x] 3.3 `matches.module.ts`: import `forwardRef(() => TournamentsModule)`.
- [x] 3.4 `matches.service.ts`: inject `TournamentAccessService` (bắt buộc); `isTournamentManager` dùng `isManager` với `communityId`; `getAiSchedulePlannerContext` và `previewSchedulePlan` dùng `isManager`.
- [x] 3.5 `matches.repository.ts`: xoá `isTournamentManager`; thêm `communityId` vào `findScheduleTournament`.
- [x] 3.6 Cập nhật các spec matches đang dựng `new MatchesService(...)` và mock `isTournamentManager` để truyền `TournamentAccessService` và dùng `isCoOrganizer`/`findCommunityMember` mock.

## 4. Kiểm chứng

- [x] 4.1 Jest: `tournaments.controller-manager-access.spec.ts`, `tournament-access.service.spec.ts`, `matches.service.authorization.spec.ts`, và các spec matches đã cập nhật (`matches.service.*.spec.ts`) đều xanh.
- [x] 4.2 `roles.guard.spec.ts` và `tournaments.controller-rate-limit.spec.ts` xanh (không đổi hành vi guard).
- [x] 4.3 `tsc --noEmit`: số lỗi trong `*.spec.ts` không tăng so với origin/main (AGENTS.md ghi 12 lỗi sẵn).
- [x] 4.4 Đếm: không còn `@Roles(UserRole.ORGANIZER, UserRole.ADMIN)` ở 34 handler; còn đúng các route ngoài phạm vi.

## 5. Hoàn tất

- [x] 5.1 Archive change: chuyển sang `openspec/changes/archive/<date>-fix-club-manager-tournament-access/`.
- [x] 5.2 Commit trong worktree (34a7958), push branch, gộp qua `merge-lane.py` với `openspec-gate.py`, kiểm tra run deploy qua GitHub API.
