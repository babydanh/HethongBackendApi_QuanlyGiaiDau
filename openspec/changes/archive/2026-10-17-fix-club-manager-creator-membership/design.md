## Context

Trước change này, mọi kiểm tra quyền quản lý giải đều chấp nhận `createdBy === userId` trước khi xét thành viên CLB. Chủ giải CLB đã rời hoặc bị cấm vẫn qua được các kiểm tra này. Điều kiện thành viên hiệu lực đã được định nghĩa ở `isActiveCommunityManager` (`tournament-access.service.ts`, status `JOINED`/`ACTIVE`, role `OWNER`/`MODERATOR`). Change này cần thêm điều kiện "thành viên hiệu lực, mọi role" cho người tạo.

## Decisions

### 1. Một hàm cho quyền theo người tạo

`isTournamentCreatorInForce(tournament, userId, membership)` (export, `tournament-access.service.ts`) là hàm thuần:

- `createdBy` rỗng hoặc khác `userId`: false.
- `communityId` null: true (giải không thuộc CLB, giữ nguyên).
- Ngược lại: true khi `membership.findCommunityMember(communityId, userId)` trả về dòng có status `JOINED` hoặc `ACTIVE` (bất kể role).

`TournamentAccessService.isCreatorInForce(tournament, userId)` gọi hàm này với `tournamentsRepository`. Các service inject `TournamentAccessService` gọi method này. Tất cả chỗ kiểm `createdBy` cho quyền quản lý giải đều gọi hàm này, không tự so sánh. `isActiveCommunityMember` được tách khỏi `isActiveCommunityManager` để hai hàm dùng chung một định nghĩa status.

### 2. Thứ tự trong `isManager`

ADMIN → người tạo còn hiệu lực → đồng BTC → quản lý CLB hiệu lực. Đồng BTC không đổi. Quản lý CLB không đổi.

### 3. Bracket: fallback theo giải cha chỉ cho giải không thuộc CLB

Ba chỗ `parent.createdBy === userId` trong `tournament-bracket.service.ts` mở bracket của giải con. Giải con thuộc CLB không được mở qua giải cha: người tạo giải cha không phải chủ giải CLB, và quy tắc người tạo đã rời CLB phải áp dụng. Giải con không thuộc CLB giữ nguyên.

### 4. Live room: người tạo phải là thành viên hiệu lực với giải CLB

`canAccessLiveTournament` đã truy vấn `communityMembers` cho giải CLB. Truy vấn này được gom lên trước để dùng cho cả `isOwner` và nhánh thành viên. Dùng `isActiveCommunityMember` để status khớp với `TournamentAccessService`.

### 5. Thanh toán, tài trợ, livestream

- `PaymentsService` và `SponsorsService` inject `TournamentAccessService` và gọi `isCreatorInForce`. `payments` và `sponsors` đã import `TournamentsModule`, nên không đổi cấu trúc module.
- `LivestreamService` và `LiveSessionService` KHÔNG inject `TournamentAccessService`, và `livestream.module.ts` KHÔNG thêm `TournamentsModule`. Lý do: `LivestreamModule` được `MatchesModule` và `VenuesModule` import; `VenuesModule` được `TournamentsModule` import. Thêm `TournamentsModule` vào `LivestreamModule` sẽ tạo vòng module cần `forwardRef` ở nhiều module, và không kiểm chứng được việc khởi động ứng dụng trong change này. Thay vào đó, hai service gọi hàm thuần `isTournamentCreatorInForce(tournament, userId, this.livestreamRepository)`; `LivestreamRepository.findCommunityMember` cung cấp membership.
- Repository trả `communityId` cho các giải này: `LivestreamRepository.findTournamentById` (thêm `communityId`) và `findMatchWithTournament` (thêm `tournamentCommunityId`). `SponsorsRepository.findTournamentForAccess` và `PaymentsRepository.findTournamentById` đã có sẵn.

### 6. Không đổi

- `payments.service.ts` (thông báo cho người nhận thanh toán) và `tournament-registration.service.ts` (thông báo cho `createdBy`): không phải kiểm quyền.
- Truy vấn danh sách trong `tournament-catalog.repository.ts`: không phải kiểm quyền; xem `proposal.md` phần Out of scope.
- Quyền `createdBy` của giải cha không thuộc CLB: không đổi.
- `isMatchOwnerOrAdmin` (`common/helpers/role.helper.ts`) bị xóa vì không còn caller. `isAdminUser` giữ nguyên.

## Risks

1. **Thêm một lần đọc membership** cho mỗi kiểm tra có `createdBy === userId` trên giải CLB. Chấp nhận được; chỉ phát sinh khi người gọi là người tạo giải CLB.
2. **Test mock thiếu `findCommunityMember` hoặc `isCreatorInForce`** ở các spec cũ dẫn đến kết quả sai. Đã cập nhật: fixture của `tournaments-lite-pairing.spec.ts` coi người tạo `user-1` là thành viên JOINED (các user khác không phải thành viên); `tournament-discovery.service.spec.ts` và `tournaments.controller.public-auth.spec.ts` dùng hàm thuần `isTournamentCreatorInForce` thay vì stub thiếu method.
3. **Vòng phụ thuộc module**: tránh bằng cách không thêm `TournamentsModule` vào `LivestreamModule` (xem quyết định 5). Cấu trúc module không đổi.
4. **Bracket**: người tạo giải cha không còn quản lý bracket giải con thuộc CLB. Đây là thu hẹp hành vi có chủ đích. Nếu cần khôi phục, phải có quyết định riêng.
5. **Thành viên `ACTIVE`**: `community_members.status` không có CHECK constraint và code không ghi `ACTIVE`. Nhánh CLB của matches trước đây chỉ chấp nhận `JOINED`; nay dùng cùng định nghĩa với `TournamentAccessService` (`JOINED`/`ACTIVE`), tức nới lỏng nhỏ ở matches. Ghi nhận để review.
