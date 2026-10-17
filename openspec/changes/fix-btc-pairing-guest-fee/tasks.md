# Tasks

Test ID: `TC-BTCPAIR-NN`. Test đỏ viết trước khi sửa code (TDD). Chỉ tick khi việc đã làm và test xanh.

## 1. Đề xuất và test đỏ

- [ ] 1.1 Proposal, design, tasks, spec delta (commit đầu lane)
- [ ] 1.2 Test đỏ tái hiện luồng: TC-BTCPAIR-01..17 (ghi kết quả đỏ)

## 2. Phí và trạng thái khi BTC thêm

- [ ] 2.1 `addDirectAthlete`: trạng thái theo đôi/đơn, `organizerWaivedFee`, `isPaid` (TC-BTCPAIR-01)
- [ ] 2.2 `persistImportRows`: hàng BTC luôn đã đóng phí, không `PENDING_APPROVAL` vì phí (TC-BTCPAIR-02)
- [ ] 2.3 `addAthletePairs`: giữ hành vi, thêm `isPaid = true` (TC-BTCPAIR-03)
- [ ] 2.4 `updateParticipantStatus`: duyệt hàng BTC trước khi giải bắt đầu (TC-BTCPAIR-04, TC-BTCPAIR-05)

## 3. Ghép cặp do BTC

- [ ] 3.1 `pairLiteParticipantsInTx`: hàng sống sót `isPaid`/`organizerWaivedFee` (TC-BTCPAIR-06; cập nhật test C của audit)
- [ ] 3.2 `unpairParticipantInTx`: đội trưởng là roster đầu tiên khi `registeredBy` không khớp (TC-BTCPAIR-07, test A của audit)
- [ ] 3.3 `writePairSlots`: marker nhập từ BTC cho cặp có khách (TC-BTCPAIR-08, test B của audit)
- [ ] 3.4 `generateLitePairsTx(divisionId?)` và kết quả `memberNames`/`unpairedNames`/`LITE_NO_PAIRABLE_MESSAGE` (TC-BTCPAIR-09..11)

## 4. Giới tính do BTC thêm

- [ ] 4.1 Cờ `organizerAdded` qua chuỗi club add, bỏ kiểm giới tính có cờ (TC-BTCPAIR-12; TC-BTCPAIR-13 giữ chặn cho tự đăng ký)

## 5. Tạo giải nhanh và đồng bộ tầng giải

- [ ] 5.1 `resolveLiteFormat` và `resolveLiteDefaultDivision`: "Đôi linh hoạt" / "Đơn linh hoạt", không MALE mặc định (TC-BTCPAIR-14, TC-BTCPAIR-15; cập nhật `lite-default-division.spec.ts`)
- [ ] 5.2 Lite create `mixed_doubles` gán `MIXED` và chạy policy (TC-BTCPAIR-16)
- [ ] 5.3 Đồng bộ `tournaments.matchType`/`genderRestriction` khi sửa nội dung lite (TC-BTCPAIR-17)

## 6. Kiểm tra và hồ sơ

- [ ] 6.1 Jest các spec liên quan xanh; `tsc --noEmit` không tăng lỗi (baseline 12 lỗi trong `*.spec.ts`)
- [ ] 6.2 `openspec validate fix-btc-pairing-guest-fee --strict`; archive sau khi rebase main
- [ ] 6.3 Báo hợp đồng API cho lane Web/App/BeBracket (trường `memberNames`, `unpairedNames`, `format` thiếu = doubles)
