## Context

Sơ đồ được tạo ở 4 generator (`bracket-generator.service.ts`: SE `:65`, DE `:298`, RR `:728`, GSK `:1142`) và một service điều phối (`services/tournament-bracket.service.ts:321 generateBracket`). Mỗi generator tự có predicate đội hợp lệ riêng:

- SE/DE/RR: `teamStatus = COMPLETE` (+ mock COMPLETE), không xét phí, trừ bóng đá (`getEligibleParticipantStatus` `:46-63`).
- GSK: có xét phí, nhưng viết inline ở `:1170-1188`, và `findParticipantsForSeeding` (`repositories/tournament-bracket.repository.ts:697-735`) lại viết một predicate thứ ba để service đếm `actualTeams < 4`.

Ba predicate cho cùng khái niệm "đội hợp lệ" là gốc của B5/F-05.

## Goals / Non-Goals

Goals: một định nghĩa đội hợp lệ, một nơi có số tối thiểu, khoá cạnh tranh đúng chỗ, lỗi không bị nuốt, response nói rõ ai đã tự ghép và ai lẻ.

Non-Goals: không đổi schema; không đổi route; không viết generator vòng bảng + loại trực tiếp mới (`GROUP_STAGE_THEN_KNOCKOUT`); không đổi thuật toán ghép (thuộc BePairing).

## Decisions

### 1. Đội hợp lệ: một hàm dùng chung

Thêm `utils/bracket-team-eligibility.ts`:

- `eligibleTeamCondition()`: SQL condition `teamStatus = 'COMPLETE' AND (isMock OR isPaid OR organizerWaivedFee)`. Dùng ở SE, DE, RR, GSK và `findParticipantsForSeeding`. Thay thế `getEligibleParticipantStatus` và các predicate inline.
- Đôi (`DOUBLES`/`MIXED_DOUBLES`): sau khi nạp VĐV (roster + slot khách trong `customResponses`), đội phải có đúng 2 VĐV, đếm bằng `countParticipantMembers` (`utils/doubles-pair-member.ts`). Không đủ 2 → không vào sơ đồ. Đây là lớp phòng thủ: đường ghép và Excel hiện đã chỉ tạo `COMPLETE` với 2 người (đã xác minh ở `flow-pairing.md` §3).
- `BRACKET_MIN_TEAMS`: `{ SINGLE_ELIMINATION: 2, DOUBLE_ELIMINATION: MIN_DOUBLE_ELIMINATION_PARTICIPANTS, ROUND_ROBIN: 2, GROUP_STAGE_KNOCKOUT: 4 }`. Service kiểm số này một lần trước khi gọi generator. Các kiểm tra `< 2` trong generator cho vòng bảng con (`:1196`, `:1274`) giữ nguyên vì là điều kiện nội bộ.
- Thông báo: `unitLabel = 'cặp'` khi nội dung là đôi, `'đội'` khi đơn: "Cần ít nhất N {cặp|đội} để tạo sơ đồ …".

**Hệ quả có ý thức:** SE/DE/RR ở giải không phải bóng đá sẽ loại đội COMPLETE chưa đóng phí. Đăng ký miễn phí không ảnh hưởng (`isPaid=true` khi phí 0).

### 2. Chọn nội dung

Service giữ nhánh `divisionId` truyền vào hoặc tự chọn khi chỉ có một nội dung. Khi có nhiều nội dung và thiếu `divisionId`: `BadRequestException('Vui lòng chọn nội dung để tạo sơ đồ.')`, kể cả lite (bỏ nhánh `divisions[0]`). Generator luôn lọc `tournamentDivisionId` khi có division và chỉ soft-delete stage của division đó.

### 3. Tự ghép (D2) — hợp đồng với BePairing

Khi tạo sơ đồ đôi lite (`isLite && isDoublesFormat`), service gọi, trong `try`:

```
generateLitePairsTx(id, userId, 'RANDOM', divisionId)
```

- `catch`: chỉ bỏ qua khi `err instanceof BadRequestException && err.message === LITE_NO_PAIRABLE_MESSAGE`. Mọi lỗi khác `throw`.
- Kết quả thành công: `autoPaired = paired.map(p => ({ participantId: p.participantId, memberNames: p.memberNames }))`, `unpairedNames` từ kết quả.
- Gắn `autoPaired` và `unpairedNames` vào response (tuỳ chọn; không có khi không tự ghép).
- Chữ ký BePairing đã chốt (agent://BePairing, 17/10): `divisionId?` ở `generateLitePairsTx`; `paired[i].participantId`, `memberNames: string[]`; `unpairedNames: string[]`; export `LITE_NO_PAIRABLE_MESSAGE`. Gộp BePairing trước; lane này rebase.

Lý do không gộp vào transaction sơ đồ: `generateLitePairsTx` có transaction riêng và đã khoá giải (`assertLitePairableInTx`). Hai transaction nối tiếp, không lồng.

### 4. Tạo lại và khoá cạnh tranh (B6)

- Controller: `allowReset ?? false`. Web chỉ gửi `true` khi BTC xác nhận tạo lại (lane Web).
- Service (kiểm nhanh, đọc dữ liệu đã commit): giữ kiểm `REGISTRATION_CLOSED`/`UPCOMING` + sơ đồ tồn tại + `!allowReset` → "đã được chốt".
- Generator, trong transaction, dòng đầu tiên sau khi tìm giải: `SELECT ... FROM tournaments WHERE id = ? FOR UPDATE`. Sau khoá: `assertNoStartedMatches(tx, tournamentId, divisionId)` đọc các trận của stage chưa xoá thuộc division; có trận có status không thuộc `{SCHEDULED, PENDING, NOT_STARTED, UPCOMING}` → `BadRequestException('Không thể tạo lại sơ đồ sau khi đã bắt đầu ít nhất một trận.')`. Chạy trước soft-delete. Khoá bằng hàng giải (không bằng division) để đơn giản; các nội dung của cùng giải tạo tuần tự, chấp nhận được vì tạo sơ đồ là thao tác hiếm.
- Logic "đã bắt đầu" ở `tournament-lite.service.ts:1332-1355` được chuyển vào generator; lite không kiểm lại.
- `generateLiteBracket(…, reset)` truyền `reset` (route create `false`, route reset `true`) thay vì ép `true`.

Khoá đảm bảo: hai request cùng nội dung chạy tuần tự; request thứ hai soft-delete stage của request thứ nhất rồi tạo stage mới, nên luôn còn đúng một stage chưa xoá cho division.

### 5. Hai lượt (B7)

Bản đồ node: với `twoLegged`, mỗi tie là hai node liên tiếp (`leg 1`, `leg 2`) — `bracket-generator.service.ts:153-170`. Sửa vòng xếp đội vòng 1 theo tie, không theo node:

- Tie `t` lấy `slots[2t]`, `slots[2t+1]`.
- Node `2t` (leg 1): `participant1 = slots[2t]`, `participant2 = slots[2t+1]`.
- Node `2t+1` (leg 2): đảo vai, `participant1 = slots[2t+1]`, `participant2 = slots[2t]`.
- Nếu tie có một đội trống (BYE), cả hai node là BYE với cùng `winnerId`, và `advanceWinner` chỉ gọi một lần (đúng như hiện tại ở `:274-278`).
- Nếu tie có hai đội: cả hai node là `SCHEDULED`, không tự COMPLETED. Khác hiện trạng, nơi lượt về bị gán lại từ lượt đi và bị tự hoàn thành.

Đưa phần đảo vai lượt về vào cùng vòng lặp theo tie, bỏ vòng lặp `:266-280` cũ.

### 6. Thể thức lạ

Service chỉ có các nhánh: `DOUBLE_ELIMINATION`, `ROUND_ROBIN`, `GROUP_STAGE_KNOCKOUT`, `SINGLE_ELIMINATION`. Mọi giá trị khác (kể cả `GROUP_STAGE_THEN_KNOCKOUT`, không có generator và không có caller trong repo) → `BadRequestException('Thể thức "<bracketType>" chưa được hỗ trợ để tạo sơ đồ.')`. Không còn rơi về SE.

Lý do không map `GROUP_STAGE_THEN_KNOCKOUT` sang GSK: hai enum có thể khác cấu hình nhóm; chưa có căn cứ nghiệp vụ. Chọn 400 rõ ràng theo quy tắc của lane.

### 7. Chốt giải (lock)

`tournaments.service.ts:1750` truyền closure `generateBracket(id, userId, systemRoles)` không `divisionId`. Sau thay đổi, giải nhiều nội dung sẽ 400. Closure đổi thành: lấy danh sách nội dung; nếu nhiều hơn một, gọi `generateBracket` cho từng nội dung (lỗi của bất kỳ nội dung nào được ném ra, giữ ngữ nghĩa lock hiện có); nếu một, gọi như cũ.

## Risks

- R1 (hành vi): SE/DE/RR đổi số đội (xem Decisions §1). Cần BTC/Main xác nhận trước khi gộp; test TC-BRK-06 khoá hành vi mới.
- R2: `GROUP_STAGE_THEN_KNOCKOUT` đã lưu trong dữ liệu sẽ 400 thay vì chạy SE. Dữ liệu thật cần kiểm trước deploy: `SELECT count(*) FROM tournament_divisions WHERE bracket_type = 'GROUP_STAGE_THEN_KNOCKOUT'` [INFERENCE: chưa chạy trên DB thật].
- R3: lite `reset=false` (create) ở trạng thái `REGISTRATION_CLOSED` với sơ đồ đã có sẽ bị chặn như giải thường. Trước đây lite luôn cho phép. Cần xác nhận luồng web lite (lane Web) không gọi create sau khi đóng đăng ký để sửa sơ đồ.
- R4: `SELECT ... FOR UPDATE` giữ khoá trong suốt generator (có thể chậm với giải lớn). Chấp nhận được; thao tác hiếm.

## Test

Test đỏ tái hiện: `src/modules/tournaments/tournament-bracket-doubles.spec.ts` (chuyển từ `local://flow-bracket-audit.spec.ts`, bỏ `console.log`, đặt TC-BRK-NN). Test cũ khẳng định hành vi sai (A1, A4, A5 theo "hiện trạng") được cập nhật, không xoá. Test E1 (`allowReset=true` xoá mềm được) giữ nguyên: đó là hành vi BTC chủ động.
