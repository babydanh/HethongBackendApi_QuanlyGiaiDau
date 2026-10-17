# Sửa luồng BTC ghép đôi: khách, phí, tách cặp, giới tính, tạo giải nhanh

## Why

BTC báo (17/10): tạo giải nhanh rồi thêm VĐV có tài khoản và khách vẫn không ghép được; giải tạo nhanh ra "Đôi Nam" giới hạn nam; ghép ngẫu nhiên lỗi; không tách được cặp do BTC tạo; giải có phí ghép xong không vào sơ đồ đôi; BTC bị chặn giới tính khi thêm thành viên CLB.

Nguyên nhân đã đọc trong code (Backend `d4fe03f`):

- **Khách và VĐV BTC thêm không vào được hàng ghép.** `addDirectAthlete` luôn ghi `teamStatus: 'PENDING_APPROVAL'` (`repositories/tournament-import.repository.ts:1041`). Duyệt chỉ được khi giải `REGISTRATION_OPEN` (`services/tournament-participant-admin.service.ts:246`). `PENDING_APPROVAL` không đủ điều kiện ghép (`utils/tournament-participant-status.ts:79-84`). Trang Lite không có nút duyệt, nên khách kẹt mãi.
- **Excel BTC cùng lỗi khi có phí.** Dòng import có `isPaid` mặc định `false` ở UI có phí, và `persistImportRows` đặt `PENDING_APPROVAL` (`tournament-import.repository.ts:2374-2378`).
- **Cặp do BTC ghép không được đánh dấu đã đóng phí.** `pairLiteParticipantsInTx` gán `isPaid` từ `isRegistrationFeePaid` của p1 (`repositories/tournament-lite.repository.ts:344-357`) mà không có `organizerWaivedFee`. Giải có phí nên cặp bị loại khỏi sơ đồ (`repositories/tournament-bracket.repository.ts:709-714`). Giải miễn phí không bị ảnh hưởng vì `feeSnapshot <= 0` được coi là đã đóng.
- **Không tách được cặp do BTC tạo.** `unpairParticipantInTx` tìm đội trưởng theo `registeredBy` (`tournament-lite.repository.ts:446-458`), mà cặp BTC tạo có `registeredBy` là BTC.
- **Cặp "VĐV tự đăng ký + khách" đếm 0.5 đội.** `writePairSlots` không ghi `importedFrom` (`utils/doubles-pair-member.ts:97-107`), nên `importedPairMemberCount` trả 0 (`services/tournament-capacity.service.ts:545-564`).
- **BTC thêm thành viên CLB bị chặn giới tính.** Đường club đi qua `register` và gọi `validateGenderRestriction` (`services/tournament-registration.service.ts:463`).
- **Tạo giải nhanh.** Có `format` nhưng không có nội dung thì tên mặc định là "Đôi Nam"/"Đơn Nam" dù không có ràng buộc (`utils/lite-default-division.ts:54-76`). Tầng giải không đồng bộ với nội dung (`repositories/tournament-division.repository.ts:383-393`).
- **Ghép ngẫu nhiên.** `generateLitePairsTx` ghép toàn giải, không nhận `divisionId`, không trả tên người lẻ. Bracket nuốt mọi lỗi (`services/tournament-bracket.service.ts:419-429`).

## What Changes

Chỉ phạm vi Backend. Quyết định nghiệp vụ D1-D6 do chủ dự án chốt 17/10 (xem `design.md`).

- Người do BTC thêm (khách, cặp tài khoản, Excel, thành viên CLB) được ghi đã đóng phí: `isPaid = true`, `organizerWaivedFee = true`, không vào `PENDING_APPROVAL` vì phí.
- Cặp do BTC ghép (tay, hàng loạt, ngẫu nhiên) được ghi đã đóng phí và hiện trong sơ đồ như giải miễn phí.
- Duyệt được người do BTC thêm trước khi giải bắt đầu, kể cả sau khi đóng đăng ký. VĐV tự đăng ký giữ nguyên cổng hiện tại.
- Tách cặp do BTC tạo: đội trưởng là roster đầu tiên theo thứ tự ổn định khi không có roster nào khớp `registeredBy`.
- Cặp có khách đếm đủ một đội: `writePairSlots` gắn marker nhập từ BTC.
- Thêm thành viên CLB do BTC thực hiện không kiểm giới tính. Cờ tường minh chạy qua chuỗi `register`. VĐV tự đăng ký và nhận lời mời giữ kiểm tra.
- Tạo giải nhanh: thiếu `format` thì là `doubles` (không football); tên nội dung không giới tính là "Đôi linh hoạt" / "Đơn linh hoạt"; "Đôi Nam" chỉ khi client gửi giới tính tường minh; `mixed_doubles` lưu `genderRestriction = MIXED` và chạy policy.
- Đồng bộ `tournaments.matchType` và `genderRestriction` của giải lite theo nội dung mỗi khi tạo hoặc sửa nội dung.
- Ghép ngẫu nhiên: nhận `divisionId` tùy chọn, chỉ ghép trong đúng nội dung, không nuốt lỗi (chỉ bỏ qua lỗi "dưới 2 người" có message hằng số), trả `memberNames` cho từng cặp và `unpairedNames` cho người lẻ.

## Impact

- Backend: `src/modules/tournaments/repositories/tournament-lite.repository.ts`, `repositories/tournament-import.repository.ts`, `repositories/tournament-division.repository.ts`, `repositories/tournaments.repository.ts` (chữ ký pass-through), `services/tournament-registration.service.ts` (chỉ nhánh BTC), `services/tournament-capacity.service.ts`, `services/tournament-lite.service.ts`, `services/tournament-participant-admin.service.ts`, `services/tournaments.service.ts` (callback club add), `utils/lite-default-division.ts`, `utils/doubles-pair-member.ts`, `dto/create-lite-tournament.dto.ts`, `tournaments.controller.ts` (không đổi route).
- Hợp đồng API (tuỳ chọn, client phải chịu được thiếu trường): response ghép ngẫu nhiên thêm `paired[].memberNames`, `paired[].participantId`, `unpairedNames`. `format` thiếu có nghĩa `doubles` cho nội dung không football.
- Không migration, không backfill dữ liệu cũ. Hàng `PENDING_APPROVAL` cũ được duyệt bằng luồng mới.
- Phối hợp lane khác: BeBracket sửa `tournament-bracket.service.ts` (gọi auto-ghép với `divisionId`, chỉ bỏ qua `LITE_NO_PAIRABLE_MESSAGE`, route generate-bracket). WebFlow sửa 404 route, redirect Club, form nội dung mặc định, tên nội dung. AppFlow sửa mặc định MALE và format MIXED/football.

## Out of scope

- Không đổi `fix-organizer-free-registration-paid` (change khác đang dùng `isRegistrationFeePaid` cho danh sách BTC). Không đụng file của change đó.
- Không đổi quy tắc đăng ký của VĐV tự đăng ký.
- Không đổi quy tắc đổi nội dung đã có VĐV (`tournament-division.service.ts`).
