## 1. Đối chiếu

- [x] 1.1 Liệt kê mọi kiểm tra quyền theo `createdBy` trong `src/modules/{tournaments,matches,payments,sponsors,livestream}` (không tính spec).
- [x] 1.2 Phân loại: kiểm quyền (đổi) và thông báo/danh sách (giữ nguyên).
- [x] 1.3 Kiểm vòng phụ thuộc module: không thêm `TournamentsModule` vào `LivestreamModule` (xem design quyết định 5); livestream dùng hàm thuần với repository.

## 2. Test viết trước (đỏ)

- [x] 2.1 `tournament-access.service.spec.ts`: người tạo giải CLB đã rời → `isManager` false; bị cấm → false; còn JOINED role MEMBER → true; giải không thuộc CLB → true; `isCreatorInForce` tương ứng.
- [x] 2.2 `tournament-lifecycle.service.spec.ts`: người tạo giải CLB đã rời → `remove` ForbiddenException.
- [x] 2.3 `tournament-lite.service.authorization.spec.ts`: người tạo giải CLB đã rời → `getLiteParticipants` ForbiddenException.
- [x] 2.4 Spec payments, sponsors, livestream: `sponsors.service.spec.ts` viết và thấy đỏ trước khi sửa code. `payments.creator-membership.spec.ts` và `livestream.creator-membership.spec.ts` là file mới, viết sau khi sửa code và đã xanh (không ghi nhận đỏ riêng).

## 3. Triển khai

- [x] 3.1 `tournament-access.service.ts`: thêm `isActiveCommunityMember`, hàm thuần `isTournamentCreatorInForce`, method `isCreatorInForce` gọi hàm này; `isManager` dùng `isCreatorInForce`.
- [x] 3.2 `tournament-lifecycle.service.ts`: bỏ fallback `createdBy` trong `remove`; `remove` gọi `isManager`.
- [x] 3.3 `tournament-bracket.service.ts`: fallback `parent.createdBy` chỉ khi giải con không có `communityId` (3 chỗ).
- [x] 3.4 `tournament-discovery.service.ts`: `isOwner` dùng `isCreatorInForce`.
- [x] 3.5 `matches.repository.ts` `canAccessLiveTournament`: `isOwner` theo `isActiveCommunityMember`; truy vấn membership chạy một lần cho cả `isOwner` và nhánh thành viên.
- [x] 3.6 `matches.service.ts`: mute, unmute, getMutedUsers dùng `isCreatorInForce`; xóa import `isMatchOwnerOrAdmin`.
- [x] 3.7 `common/helpers/role.helper.ts`: xóa `isMatchOwnerOrAdmin` và khối test trong `role.helper.spec.ts`; `isAdminUser` giữ nguyên.
- [x] 3.8 `payments.service.ts`: inject `TournamentAccessService`; `requestPayout` và thanh toán phí cấp giải (nhánh `TOURNAMENT_PUBLISH_FEE` trong `calculatePayment`) dùng `isCreatorInForce`; cập nhật 4 `new PaymentsService(...)` trong `payment-eligibility.spec.ts`.
- [x] 3.9 `sponsors.service.ts`: inject `TournamentAccessService`; `assertManager` dùng `isCreatorInForce`; cập nhật `sponsors.service.spec.ts`.
- [x] 3.10 `livestream.service.ts`, `live-session.service.ts`: `assertTournamentOperator` và nhánh tương ứng dùng `isTournamentCreatorInForce(tournament, userId, this.livestreamRepository)`; không inject `TournamentAccessService` và không thêm `TournamentsModule` (xem design quyết định 5); constructor không đổi nên các spec `new LivestreamService(...)` giữ nguyên.
- [x] 3.11 Repository: `LivestreamRepository.findTournamentById` và `findMatchWithTournament` trả `communityId`/`tournamentCommunityId`; thêm `LivestreamRepository.findCommunityMember`. Payments và sponsors đã có sẵn cột `communityId`.

## 4. Kiểm chứng

- [x] 4.1 `node node_modules/jest/bin/jest.js src/modules/tournaments src/modules/matches src/modules/payments src/modules/sponsors src/modules/livestream src/common/helpers`: 0 fail (129 suites passed, 4 skipped có sẵn; 1541 passed, 23 skipped).
- [x] 4.2 `tsc --noEmit -p tsconfig.json`: exit 0.
- [x] 4.3 `openspec validate fix-club-manager-creator-membership --strict`: valid.
