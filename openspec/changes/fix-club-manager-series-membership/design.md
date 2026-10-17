## Context

Dữ liệu thành viên CLB nằm ở `community_members` (`communities.schema.ts`). `role` là varchar (`OWNER`, `MODERATOR`, `MEMBER`). `status` là varchar mặc định `JOINED`, không phải enum của Postgres. Code ghi các giá trị `JOINED`, `PENDING`, `INVITED`, `REJECTED`, `BANNED`. Rời CLB là xóa hẳn dòng (`removeMember`). `ACTIVE` không được code nào ghi vào `community_members`, nhưng spec `tournament-manager-access` đã liệt kê, nên giữ trong danh sách cho dữ liệu cũ.

Điểm kiểm tra quyền theo CLB trước change này:

- `TournamentAccessService.isManager`: shortcut `findCommunityById(...).creatorId === userId` đi trước kiểm tra membership.
- `TournamentAccessService.assertCommunityTournamentCreator`: đã kiểm `status === 'JOINED'`.
- Nhánh fallback `member.role` không kiểm `status` sau `isManager` trong `tournament-lite.service.ts` (`checkLiteAuthorization`), `tournament-bracket.service.ts` (9 chỗ), `tournament-lifecycle.service.ts` (update, publish, lock và các thao tác khác), `tournament-registration.service.ts`.
- Nhánh xóa giải trong `TournamentLifecycleService.remove` có shortcut `creatorId` thứ hai.

## Decisions

### 1. Một điều kiện cho mọi quyền CLB

`isActiveCommunityManager(member)` là hàm duy nhất quyết định một thành viên CLB có quyền quản lý giải của CLB đó. Điều kiện: `member` tồn tại, status thuộc `JOINED`/`ACTIVE`, role (không phân biệt hoa thường) thuộc `OWNER`/`MODERATOR`. Mọi chỗ kiểm `member.role` theo CLB trong module `tournaments` dùng hàm này. Các chỗ kiểm role không kèm status được thay bằng hàm này; cấu trúc `if (!isAuthorized && communityId)` giữ nguyên để diff nhỏ.

Lý do chọn hàm chung thay vì sửa từng nhánh: cùng một lỗ hổng xuất hiện ở ít nhất 15 chỗ. Khi sửa riêng lẻ, chỗ nào bỏ sót sẽ vẫn cho người đã bị cấm vào.

### 2. Bỏ shortcut `creatorId`

Khi tạo CLB, người tạo luôn có một dòng `OWNER` `JOINED` (`communities.repository.ts`). Vì vậy shortcut `creatorId` không cần cho người đang hoạt động. Nó chỉ còn tác dụng khi người tạo đã rời, bị cấm hoặc bị hạ quyền, tức là đúng trường hợp phải chặn. Shortcut được bỏ khỏi `isManager` và khỏi nhánh xóa giải.

### 3. Giải cha: quyền CLB đi qua giải con

Giải cha (`parent_tournaments`) không có `communityId`, nên `isManager(parent)` không bao giờ đi qua nhánh CLB. `TournamentLifecycleService.canManageSeries` cho phép khi:

1. `isManager` đúng với giải cha (ADMIN, người tạo giải cha, đồng BTC giải cha), hoặc
2. `isManager` đúng với một giải con chưa xóa (`findByParentId`, lọc `deletedAt IS NULL`) có `communityId`.

Giải con không có `communityId` không mở quyền cho giải cha. Vòng lặp dừng ở giải con đầu tiên khớp.

Lưu ý: `isManager(child)` đúng với đồng BTC và người tạo của giải con. Nghĩa là họ cũng sửa được giải cha (tên, mô tả). Xem phần rủi ro.

### 4. Không đổi những gì không thuộc phạm vi

- POST và DELETE giải cha giữ `ORGANIZER`/`ADMIN` (`removeParent` không đổi).
- 34 route trong `CLUB_MANAGEABLE_HANDLERS` không đổi.
- `GET :id/referees` đã có `PLAYER` và `findReferees` đã dùng `isManager`. `GET :id/divisions` không có `@Roles` (chỉ cần đăng nhập), giữ nguyên.
- `tournament-lite.service.ts` (tạo Lite, `['OWNER','ADMIN','MODERATOR']` + `status === 'JOINED'`): đã kiểm status, không đổi.

## Risks and open questions

1. **Đồng BTC và người tạo giải con thuộc CLB sửa được giải cha.** Theo Decision 3, `isManager(child)` đúng với đồng BTC/người tạo của giải con, nên họ được cập nhật toàn bộ giải cha, gồm tên và mô tả. Cần quyết định: (a) giữ nguyên, hoặc (b) giới hạn đường CLB của giải cha chỉ cho `logoUrl`/`bannerUrl`.
2. **Người tạo giải CLB đã bị cấm hoặc rời CLB vẫn giữ quyền trên giải do họ tạo.** Quyền `createdBy` của giải là quyết định D4 và không nằm trong change này. Nếu muốn chặn, cần một điều kiện riêng cho giải CLB (membership còn hiệu lực hoặc không).
3. **`ACTIVE` vẫn được chấp nhận.** Không có đường code nào ghi `ACTIVE` vào `community_members`. Giữ để không làm mất quyền của dữ liệu cũ, nếu có.
4. **Fallback vẫn còn.** Các nhánh `if (!isAuthorized && communityId)` trùng với `isManager` sau khi sửa. Có thể xóa để gọn code ở change sau, không cần thiết cho bảo mật.
5. **Test tích hợp DB không chạy** trong change này: 3 suite `describeIfDb` bị skip vì không có `DB_URL`.
