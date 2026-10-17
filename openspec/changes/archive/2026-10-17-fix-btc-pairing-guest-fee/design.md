## Context

Lane `fix-btc-pairing-guest-fee`, Backend `origin/main` `d4fe03f`. Các quyết định nghiệp vụ D1-D6 đã được chủ dự án chốt (17/10). Kiểm tra tĩnh code; test đỏ tái hiện viết trong `test/` sau commit proposal.

Điểm sửa so với audit 17/10: `isRegistrationFeePaid` (`utils/registration-payment-eligibility.ts`) đã trả `true` khi `feeSnapshot <= 0`, nên giải miễn phí không bị lỗi sơ đồ. Lỗi isPaid chỉ xảy ra với giải có phí. Test C của audit ghi nhận `isPaid=false` là hành vi cần đổi.

## Decisions

**D1. Phí của người BTC thêm.** Mọi hàng do BTC tạo (`addDirectAthlete`, `addAthletePairs`, Excel `persistImportRows` với nguồn BTC, club add qua `register` có cờ BTC) ghi `isPaid = true`, `organizerWaivedFee = true`. Giá trị `isPaid` gửi lên từ client bị bỏ qua với hàng BTC. Không dùng `entryFeeAtRegistration` để suy ra đã đóng cho hàng này.

**D2. Trạng thái khi BTC thêm.** `addDirectAthlete` không còn ghi `PENDING_APPROVAL`. Trạng thái là `resolveDoublesParticipantStatus({ event: 'APPROVE', isDoubles, rosterCount: 1 })` cho nội dung đôi (`PENDING_PARTNER`) và `COMPLETE` cho đơn. Excel dùng cùng logic khi `autoApprove`; khi không `autoApprove` giữ `PENDING_APPROVAL` vì đó là lựa chọn của BTC, không vì phí.

**D3. Duyệt hàng BTC sau khi đóng đăng ký.** `updateParticipantStatus` cho phép duyệt khi giải chưa bắt đầu (trạng thái không thuộc `IN_PROGRESS`, `COMPLETED`, `CANCELLED`) và hàng là do BTC tạo (`organizerWaivedFee = true` hoặc `customResponses.importedFrom` thuộc nguồn BTC). Cổng `REGISTRATION_OPEN` vẫn giữ cho VĐV tự đăng ký. Không đổi `assertRegularAddOpen`: sau khi đóng đăng ký vẫn không thêm mới được.

**D4. Ghép cặp do BTC.** Hàng sống sót của `pairLiteParticipantsInTx` ghi `isPaid = true`, `organizerWaivedFee = true`. Áp dụng cho mọi nguồn gọi (tay, hàng loạt, ngẫu nhiên), vì cả ba đều do BTC thực hiện. Thay đổi trong `isRegistrationFeePaid` không cần.

**D5. Tách cặp.** Đội trưởng: roster có `userId === registeredBy`; nếu không có, lấy roster đầu tiên theo `id` (ổn định). Người còn lại là tài khoản thì `registeredBy = partner.userId`; khách thì giữ `registeredBy` của hàng gốc.

**D6. Sức chứa cặp có khách.** `writePairSlots` gắn `importedFrom: 'ORGANIZER_DIRECT'` khi một bên là `GUEST` và chưa có marker. `singleMemberResponses` đã xoá marker khi trả VĐV tài khoản về, nên tách cặp vẫn đúng. Khi trả khách về thành hàng riêng, marker vẫn là nguồn BTC.

**D7. Giới tính do BTC thêm.** Cờ tường minh `organizerAdded: true` đi qua chuỗi: `addLiteClubMember` → callback club (`tournaments.service.ts:1531`) → `TournamentsService.register` → `TournamentRegistrationService.register`. Khi có cờ, bỏ `validateGenderRestriction` tại `tournament-registration.service.ts:463`, các kiểm tra khác giữ nguyên. `acceptPartnerInvite` (`:1217`) không đổi.

**D8. Tạo giải nhanh.** `resolveLiteFormat`: thiếu `format` thì `doubles` cho mọi môn không football (kể cả có `divisions`), football là `singles`. Tên nội dung: không giới tính thì `Đôi linh hoạt` / `Đơn linh hoạt` (kể cả Club/Super Lite); có giới tính thì `Đôi Nam` / `Đôi Nữ` / `Đôi Nam Nữ` / `Đơn Nam` / `Đơn Nữ`. `mixed_doubles` đặt `genderRestriction = MIXED` khi thiếu và chạy `validateMatchTypeGenderRestriction` trước khi tạo. Football không đổi.

**D9. Đồng bộ tầng giải.** Sau mỗi tạo hoặc sửa nội dung của giải lite: nếu mọi nội dung cùng `matchType` thì giải lấy `matchType` đó; nếu không, giải là `DOUBLES` khi có nội dung đôi (`DOUBLES` hoặc `MIXED_DOUBLES`), còn lại `SINGLES`. `genderRestriction` của giải lấy theo nội dung khi chỉ có một nội dung, nếu không là `null`. Bỏ điều kiện `hideAdvancedSettings` và `divisionCount === 1` trong `tournament-division.repository.ts:383-393`.

**D10. Ghép ngẫu nhiên.** `generateLitePairsTx(tournamentId, userId, strategy, divisionId?)`. Khi có `divisionId` chỉ ghép `tournamentDivisionId === divisionId`; khi không có giữ nhóm theo nội dung như cũ. Trả `paired[]` với `participantId` (hàng sống sót, p1), `participant1Id`, `participant2Id`, `teamName`, `memberNames` (đúng 2 tên, p1 trước), `unpairedParticipantIds`, `unpairedNames` (fullName của roster, hoặc `teamName` của khách), `message`, `strategy`. Hằng `export const LITE_NO_PAIRABLE_MESSAGE = 'Cần ít nhất 2 người chơi đang chờ ghép cặp.'` dùng khi dưới 2 người. Repo không nuốt lỗi nào; bracket chỉ bỏ qua đúng message này (BeBracket).

## Risks / Trade-offs

- D3 mở duyệt hàng BTC cũ sau khi đóng đăng ký. Rủi ro: lượng hàng kẹt chưa đo trên production. Không backfill, không đổi dữ liệu.
- D9 đổi `tournaments.matchType` của giải có nhiều nội dung. Kiểm tra sức chứa và ghép cặp đọc tầng giải; cần test cho giải hai nội dung.
- D8 đổi tên Club "Đánh Đôi" thành "Đôi linh hoạt". Theo chỉ đạo "LUÔN ra Đôi linh hoạt", không gửi giới tính thì tên này.
