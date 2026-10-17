# Tasks

## 1. Đối chiếu

- [x] 1.1 Đọc mã sơ đồ và xác định các predicate đội hợp lệ, điểm chọn nội dung, khoá, twoLegged, route và caller (`bracket-generator.service.ts`, `tournament-bracket.service.ts`, `tournaments.controller.ts`, `tournaments.service.ts:1750`, `tournament-lite.service.ts:1292`). Xong khi: design.md ghi được `file:dòng` cho từng quyết định.
- [x] 1.2 Thống nhất hợp đồng `generateLitePairsTx` với BePairing (`divisionId?`, `memberNames`, `unpairedNames`, `LITE_NO_PAIRABLE_MESSAGE`). Xong khi: BePairing xác nhận bằng tin nhắn.

## 2. Test viết trước (đỏ đúng lý do)

- [x] 2.1 `src/modules/tournaments/tournament-bracket-doubles.spec.ts` (chuyển từ audit, đặt TC-BRK-NN) với các ca: TC-BRK-01 nhiều nội dung không `divisionId` → 400 đúng câu, không ghi stage; TC-BRK-02 lite nhiều nội dung không `divisionId` → cùng 400, không gọi ghép; TC-BRK-03 một nội dung không `divisionId` → dùng nội dung đó; TC-BRK-04 `divisionId` chỉ lấy VĐV bảng đó và chỉ soft-delete stage bảng đó. Xong khi: đỏ đúng lý do lúc đầu (thực tế: 01, 02 đỏ; 03, 04 là đặc tả hồi quy, xanh từ đầu).
- [x] 2.2 TC-BRK-05 cùng bốn cặp COMPLETE đã đóng phí: SE và GSK cùng seat, không bị từ chối đếm đội (A2). TC-BRK-06 cặp COMPLETE chưa đóng, không waive, không mock → không vào sơ đồ mọi thể thức. TC-BRK-07 thông báo đôi nói "cặp". Xanh.
- [x] 2.3 TC-BRK-08 lite đôi gọi `generateLitePairsTx(id, userId, 'RANDOM', divisionId)` và response có `autoPaired` với `memberNames`. TC-BRK-09 lỗi "không còn ai để ghép" bị bỏ qua; lỗi khác bị ném ra và không ghi stage (C1 cũ đổi). TC-BRK-10 người lẻ nằm trong `unpairedNames`. Xanh sau khi BePairing gộp main (`a4f6fc2`).
- [x] 2.4 TC-BRK-11 controller: `generate-bracket` không truyền `allowReset` → service nhận `false`. TC-BRK-12 `REGISTRATION_CLOSED` + sơ đồ có sẵn + không `allowReset` → "đã được chốt" (E2 giữ); TC-BRK-13 `allowReset=true` nhưng có trận đã bắt đầu → bị chặn, stage còn nguyên. TC-BRK-14 generator khoá hàng giải `FOR UPDATE` trong transaction và kiểm trận bắt đầu trước khi soft-delete (fake DB ghi nhận). E1 (`allowReset=true` xoá mềm được khi chưa có trận) giữ nguyên. Xanh.
- [x] 2.5 TC-BRK-15 twoLegged 4 đội: cả 4 đội ở vòng 1, mỗi tie 2 trận `SCHEDULED` (D1). TC-BRK-16 twoLegged 3 đội: tie có một đội là BYE hai lượt, tie còn lại có hai trận. Xanh.
- [x] 2.6 TC-BRK-17 `GROUP_STAGE_THEN_KNOCKOUT` và bracket type lạ → 400 đúng tên, không ghi stage. TC-BRK-18 chốt giải hai nội dung → sinh sơ đồ cho từng nội dung (lock closure). Xanh.

## 3. Cài đặt

- [x] 3.1 `utils/bracket-team-eligibility.ts`: `eligibleTeamCondition()`, `BRACKET_MIN_TEAMS`, thông báo "cặp"/"đội". Thay predicate ở SE, DE, RR, GSK và `findParticipantsForSeeding`. Xong khi: TC-BRK-05..07 xanh. Kiểm đôi đủ 2 VĐV ĐÃ BỎ khỏi phạm vi (xem proposal/spec: chưa có invariant, ghi trong báo cáo).
- [x] 3.2 `tournament-bracket.service.ts`: chọn nội dung (400 khi nhiều nội dung không `divisionId`, bỏ nhánh `divisions[0]`); bỏ `catch` rỗng, gọi tự ghép với `divisionId`, chỉ bỏ qua `LITE_NO_PAIRABLE_MESSAGE`; đưa `autoPaired`/`unpairedNames` vào response; dispatch thể thức tường minh, thể thức lạ → 400. Xong khi: TC-BRK-01..03, 08..10, 17 xanh.
- [x] 3.3 `bracket-generator.service.ts`: `FOR UPDATE` trên hàng giải ở đầu mỗi transaction (SE, DE, RR, GSK); `assertNoStartedMatches` trước soft-delete; xoá `getEligibleParticipantStatus` sau khi thay bằng hàm dùng chung. Xong khi: TC-BRK-14 xanh.
- [x] 3.4 Sửa xếp đội vòng 1 twoLegged theo tie (design.md §5), bỏ vòng lặp đảo cũ. Xong khi: TC-BRK-15..16 xanh.
- [x] 3.5 `tournaments.controller.ts`: `allowReset ?? false` (một dòng). `tournament-lite.service.ts`: `generateLiteBracket` truyền `reset`, bỏ kiểm trận bắt đầu trùng. Xong khi: TC-BRK-11..13 xanh.
- [x] 3.6 `tournaments.service.ts` closure lock: theo từng nội dung khi nhiều hơn một (`generateBracketForEachDivision`). Xong khi: TC-BRK-18 xanh.
- [x] 3.7 Cập nhật spec cũ có chủ đích: `tournaments-lite-pairing.spec.ts` (3 test: thêm mock `findParticipantsForSeeding`; bỏ kỳ vọng `findBracket` ở lite vì kiểm nằm trong generator; test "chặn trận đã bắt đầu" đổi thành test lỗi generator lan truyền, guard thật do TC-BRK-13). `tournament-bracket.service.spec.ts` không đổi (vẫn xanh). Test đã bỏ: TC-BRK-06c (đôi một roster), vì chưa có invariant đủ 2 VĐV. Ghi trong báo cáo.

## 4. Kiểm chứng

- [x] 4.1 `openspec validate fix-bracket-doubles-generation --strict` exit 0.
- [x] 4.2 `node node_modules/jest/bin/jest.js src/modules/tournaments` (pnpm không dùng ở repo này): 69 suite pass, 710 test pass, 0 fail, 3 suite skip có sẵn.
- [x] 4.3 `NODE_OPTIONS=--max-old-space-size=4096 node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`: 0 lỗi (tsconfig loại `*.spec.ts`, không có lỗi trong src).
- [x] 4.4 Rebase lên main đã có BePairing (`a4f6fc2`), chạy lại 4.2–4.3 trên cây đã rebase: xanh. Gộp main và kiểm deploy nằm ngoài danh sách task (merge-lane).
