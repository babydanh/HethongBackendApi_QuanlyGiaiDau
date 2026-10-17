## Why

Quyết định của Main (người dùng chốt "không" với phương án giữ quyền cho người tạo): người tạo giải thuộc CLB (`communityId` có giá trị) đã rời CLB, bị cấm, hoặc có status ngoài `JOINED`/`ACTIVE` không còn quyền quản lý giải đó.

Hiện tại quyền `createdBy` được cấp vô điều kiện ở nhiều chỗ, nên người đã rời CLB vẫn quản lý được giải CLB:

- `TournamentAccessService.isManager`: `createdBy === userId` đi trước kiểm tra membership.
- `TournamentLifecycleService.remove`: fallback `existing.createdBy === userId` sau `isManager`.
- `TournamentBracketService`: fallback `parent.createdBy === userId` áp dụng cho cả giải con thuộc CLB.
- `TournamentDiscoveryService`: `isOwner` mở bản nháp và giải bị đình chỉ cho người tạo.
- `MatchesRepository.canAccessLiveTournament`: `isOwner` mở phòng live kể cả giải riêng tư của CLB.
- `MatchesService`: mute, unmute và xem danh sách bị cấm chỉ kiểm `tournament.createdBy`.
- `PaymentsService`: yêu cầu giải ngân (`requestPayout`) và thanh toán phí cấp giải chỉ kiểm `createdBy`.
- `SponsorsService`, `LivestreamService`, `LiveSessionService`: kiểm `createdBy` để cho quản lý tài trợ và livestream.

## What Changes

- Thêm `TournamentAccessService.isCreatorInForce(tournament, userId)`: giải không thuộc CLB thì `createdBy === userId` là đủ; giải thuộc CLB thì người tạo phải còn là thành viên hiệu lực (status `JOINED` hoặc `ACTIVE`, mọi role).
- `isManager` dùng `isCreatorInForce` thay cho `createdBy === userId` trực tiếp. Thứ tự còn lại giữ nguyên: ADMIN, đồng BTC, quản lý CLB.
- Mọi chỗ kiểm `createdBy` cho quyền quản lý giải dùng `isCreatorInForce` (danh sách ở Why). Các chỗ thông báo (ví dụ người nhận thông báo đăng ký, thanh toán) không đổi.
- Bỏ fallback `createdBy` trong `TournamentLifecycleService.remove` (đã do `isManager` đảm nhiệm).
- Bracket: fallback `parent.createdBy` chỉ áp dụng cho giải con không thuộc CLB.
- `isMatchOwnerOrAdmin` (`src/common/helpers/role.helper.ts`) không còn được dùng: xóa hàm và khối test tương ứng.
- Không đổi path, method, DTO, mã lỗi hay định dạng phản hồi.

## Impact

- Hành vi: người tạo giải CLB đã rời hoặc bị cấm nhận 403 trên mọi thao tác quản lý giải đó (gồm payout và tài trợ); người tạo còn là thành viên hiệu lực vẫn quản lý.
- Giải không thuộc CLB, ADMIN, đồng BTC: không đổi.
- Mã: `tournament-access.service.ts`, `tournament-lifecycle.service.ts`, `tournament-bracket.service.ts`, `tournament-discovery.service.ts`, `matches.repository.ts`, `matches.service.ts`, `payments.service.ts`, `sponsors.service.ts`, `livestream.service.ts`, `live-session.service.ts`, `common/helpers/role.helper.ts` và các spec liên quan.
- DB: không migration.
- Web và Flutter: không đổi code.

## Out of scope

- Danh sách quản lý (`tournament-catalog.repository.ts`, các truy vấn lọc theo `createdBy` cho dashboard): không phải kiểm quyền. Người tạo đã rời CLB vẫn thấy giải CLB trong danh sách của mình nhưng sẽ nhận 403 khi mở quản lý. Cần quyết định riêng.
- Quyền trên giải cha (`parent_tournaments.createdBy`) không thuộc CLB: không đổi theo quy tắc "giải không thuộc CLB".
- `communities`, `club-match-sessions`: không thuộc phạm vi change này.
