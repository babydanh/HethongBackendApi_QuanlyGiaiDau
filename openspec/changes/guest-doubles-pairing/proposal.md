# Proposal

## Why

BTC thêm VĐV khách (chỉ tên/email, không tài khoản) vào nội dung đôi trên giải `a79b197b-6a30-420b-808e-f2e6240d3500` (Lite, `registrationMode: APPROVAL`, `doublesPairingMode: ORGANIZER`): khách tự thành `COMPLETE` một người thay vì "Chờ ghép đôi".

- `addDirectAthlete` (`tournament-import.repository.ts:1018-1087`) không tạo roster (`tournament_rosters.user_id` NOT NULL), nên khi duyệt `rosterCount = 0`.
- `resolveDoublesParticipantStatus` APPROVE (`utils/tournament-participant-status.ts:50-55`) chỉ trả `PENDING_PARTNER` khi `rosterCount === 1` và chỉ ở `registrationMode: APPROVAL`; còn lại `COMPLETE`.
- Ghép tay, ghép ngẫu nhiên, hàng chờ ghép, tách cặp (`tournament-lite.repository.ts`) đều đòi mỗi bên đúng 1 roster, nên chỉ sửa trạng thái thì khách bị kẹt.

## What Changes

- Helper thuần `utils/doubles-pair-member.ts`: một bên chờ ghép có đúng một người = 1 roster, hoặc 0 roster + `customResponses.importedFrom = 'ORGANIZER_DIRECT'` (khách). Ghi/đọc "ô người" của cặp có khách vào `customResponses` theo quy ước Web đang đọc (`player1Name/Email/Phone`, `player2Name/Email/Phone`), thêm `player1UserId`/`player2UserId` (null = khách) để tách cặp biết ai là ai.
- Duyệt: nội dung đôi, đúng một người (tính cả khách) → `PENDING_PARTNER` ở mọi `registrationMode` (trước đây chế độ khác APPROVAL ra `COMPLETE` một người).
- Hàng chờ ghép (`findLitePendingPartnerParticipants`), ghép tay (`pairLiteParticipantsInTx`), ghép ngẫu nhiên (`generateLitePairsTx`) nhận khách. Khách ELO mặc định 1000 (như hiện tại khi thiếu user).
- Giới tính (người dùng chốt 2026-10-16): chỉ kiểm bên có tài khoản; bên khách coi như BTC đã xác nhận.
- Tách cặp (người dùng chốt 2026-10-16): cặp có khách tách được; khách trở lại thành hồ sơ khách `PENDING_PARTNER`.

## Capabilities

### New Capabilities

- `organizer-guest-doubles-pairing`: khách trong nội dung đôi chờ ghép, ghép và tách được.

## Impact

- Backend: `utils/tournament-participant-status.ts`, `utils/doubles-pair-member.ts` (mới), `services/tournament-participant-admin.service.ts`, `repositories/tournament-lite.repository.ts`, test jest liên quan. Không đổi schema/migration, không đổi hình dạng API.
- Web: `RegistrationTab.tsx` đếm và nạp hàng chờ ghép nhận khách (0 roster, `importedFrom: ORGANIZER_DIRECT`). Change Web riêng.
- App Flutter: không đổi.

## Out of Scope

- Cặp hai tài khoản giữ nguyên luồng ghép/tách cũ (không ghi ô người).
- Khách nhập từ Excel (`importedFrom` khác `ORGANIZER_DIRECT`).
