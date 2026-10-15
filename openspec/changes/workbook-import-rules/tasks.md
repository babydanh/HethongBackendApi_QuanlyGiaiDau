## 0. Đọc nguồn (đã làm, chỉ đọc)

- [x] 0.1 `updateDivisionConfig` (`tournament-division.service.ts:313-460`): các chặn sơ đồ, trận đã bắt đầu, đổi hình thức, `validateSportRuleConfig`.
- [x] 0.2 `importRosterBatch` (`tournament-import.repository.ts:1749`): transaction + claim idempotency + `persistImportRows`.
- [x] 0.3 `ROSTER_LAYOUT_SHEET_KINDS` (`ai/dto/roster-layout.dto.ts:30-34`) và `ROSTER_LAYOUT_JSON_SCHEMA` (`ai/ai.service.ts`).

## 1. Tách hàm, giữ hành vi cũ (làm sau khi người dùng gõ "apply")

- [ ] 1.1 Tách `assertDivisionRulesUpdatable` ra khỏi `updateDivisionConfig`; `updateDivisionConfig` gọi lại. Done: `npx jest src/modules/tournaments/services/tournament-division` pass, không sửa test cũ.
- [ ] 1.2 Tách `importRosterBatchInTx(tx, ...)`; `importRosterBatch` giữ claim + transaction. Done: `npx jest src/modules/tournaments/repositories/tournament-import` pass, không sửa test cũ.

## 2. Endpoint mới

- [ ] 2.1 `dto/workbook-import.dto.ts` với class-validator (tối đa 20 nội dung, `divisionId` UUID không trùng, `maxParticipants` >= 2). Done: unit test DTO thiếu/sai field trả lỗi.
- [ ] 2.2 `TournamentWorkbookImportService.preview` không ghi: lỗi luật theo nội dung + `previewRosterImportBatch`. Done: spec "preview writes nothing" (đếm bảng trước/sau bằng mock repo).
- [ ] 2.3 `TournamentWorkbookImportService.commit`: claim → luật → `importRosterBatchInTx` trong 1 transaction. Done: spec "rules and roster", "roster failure rolls back", "capacity uses imported limit", "replay".
- [ ] 2.4 2 route trong `tournaments.controller.ts`, guard quản lý giải giống `roster-import-batches`, `Idempotency-Key` bắt buộc ở commit. Done: spec controller 403 / 400 thiếu key.

## 3. AI

- [ ] 3.1 Thêm `RULES` vào `ROSTER_LAYOUT_SHEET_KINDS` và mô tả trong prompt/schema. Done: spec layout chấp nhận `RULES` với `blocks: []`, vẫn từ chối loại lạ.

## 4. Kiểm tra

- [ ] 4.1 `npx jest src/modules/tournaments src/modules/ai --maxWorkers=2` pass.
- [ ] 4.2 `NODE_OPTIONS=--max-old-space-size=4096 pnpm exec tsc --noEmit`: không vượt baseline 12 lỗi sẵn trong `*.spec.ts`.
- [ ] 4.3 `openspec validate workbook-import-rules --strict` exit 0.
