# Tasks

Test ID: `TC-BTCPAIR-NN` (plus suffix `b` for a related case). Test đỏ viết trước code (TDD). Chỉ tick khi việc đã làm và test chạy thật.

## 1. Đề xuất và test đỏ

- [x] 1.1 Proposal, design, tasks, spec delta (commit `36b9eb0`, đầu lane)
- [x] 1.2 Test đỏ tái hiện luồng TC-BTCPAIR-01..17 trước khi sửa code (kết quả đỏ ghi trong báo cáo lane). TC-BTCPAIR-05 và TC-BTCPAIR-13 là test khoá hành vi, đã xanh trước sửa, không phải test đỏ.

## 2. Phí và trạng thái khi BTC thêm

- [x] 2.1 `addDirectAthlete` và `addAthleteCandidate`: đôi + 1 VĐV → PENDING_PARTNER, đơn → COMPLETE; `isPaid`/`organizerWaivedFee` = true; khách có `customResponses.player1Name` (TC-BTCPAIR-01)
- [x] 2.2 `persistImportRows`: hàng BTC fee-settled, không PENDING_APPROVAL vì phí (TC-BTCPAIR-02)
- [x] 2.3 `addAthletePairs`: `isPaid = true` (TC-BTCPAIR-03)
- [x] 2.4 `updateParticipantStatus`: duyệt hàng BTC trước khi giải bắt đầu, cổng REGISTRATION_OPEN giữ cho tự đăng ký (TC-BTCPAIR-04, TC-BTCPAIR-05)

## 3. Ghép cặp do BTC

- [x] 3.1 `pairLiteParticipantsInTx`: survivor `isPaid`/`organizerWaivedFee` = true (TC-BTCPAIR-06; đổi kỳ vọng characterization của audit test C)
- [x] 3.2 `unpairParticipantInTx`: đội trưởng là roster có `registeredBy`, nếu không thì roster đầu theo `id` (TC-BTCPAIR-07, audit test A)
- [x] 3.3 `writePairSlots`: cặp có khách ghi `importedFrom = ORGANIZER_DIRECT`, capacity đếm đủ đội (TC-BTCPAIR-08, audit test B). Đánh đổi: ghi đè nhãn nguồn cũ (`UNKNOWN_CONTACT_EMAIL`, `CALLER_VALUE`, `ROSTER_IMPORT`).
- [x] 3.4 `generateLitePairsTx(…, divisionId?)`, `memberNames`, `unpairedNames`, `LITE_NO_PAIRABLE_MESSAGE`, `divisionId` ở `GenerateLitePairsDto` (TC-BTCPAIR-09, 10, 11)

## 4. Giới tính và phí do BTC thêm

- [x] 4.1 Cờ `organizerAdded` qua chuỗi club add; hàng CLB BTC thêm: `isPaid`/`organizerWaivedFee` = true, PENDING_PARTNER/COMPLETE (TC-BTCPAIR-12, 01b). TC-BTCPAIR-13: tự đăng ký nữ vào nội dung Nam vẫn bị chặn.

## 5. Tạo giải nhanh và đồng bộ tầng giải

- [x] 5.1 `resolveLiteFormat` (thiếu format → doubles, football giữ singles) và `resolveLiteDefaultDivision`: "Đôi linh hoạt" / "Đơn linh hoạt", không MALE mặc định (TC-BTCPAIR-14, 15)
- [x] 5.2 `mixed_doubles` → MIXED_DOUBLES + genderRestriction MIXED, qua validator (TC-BTCPAIR-16)
- [x] 5.3 Đồng bộ `tournaments.matchType`/`genderRestriction` khi tạo/sửa nội dung lite, bỏ cổng `divisionCount === 1` (TC-BTCPAIR-17)

## 6. Kiểm tra và hồ sơ

- [x] 6.1 `tsc --noEmit -p tsconfig.json`: exit 0, 0 lỗi. Jest `src/modules/tournaments`: 672 passed, 0 failed, 20 skipped (3 suite DB, skipped sẵn)
- [x] 6.2 `openspec validate fix-btc-pairing-guest-fee --strict`: hợp lệ, không INFO/ERROR; archive sau commit code
- [x] 6.3 Báo hợp đồng API cho WebFlow, AppFlow, BeBracket, Main (chữ ký generateLitePairsTx, `autoPaired`/`unpairedNames`, `format` thiếu = doubles, `organizerWaivedFee`)
