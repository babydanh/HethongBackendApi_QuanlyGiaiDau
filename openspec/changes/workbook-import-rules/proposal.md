# Proposal

## Why

Ban tổ chức (BTC) muốn nhập một file Excel gồm luật thi đấu và danh sách VĐV, thay vì nhập danh sách VĐV rồi sửa luật từng nội dung bằng tay. Đây là đợt 1 trong 3 đợt (đợt 2: bảng đấu, đợt 3: lịch), đã được người dùng duyệt ngày 16/10 qua kế hoạch Lavish.

Hiện trạng đã xác minh trên `origin/main` `5b62223`:
- Luật nội dung chỉ sửa được qua `PATCH /tournaments/:id/divisions/:divisionId/config` → `TournamentDivisionService.updateDivisionConfig` (`tournament-division.service.ts:313`). Hàm này đã chặn khi nội dung có sơ đồ (`findBracket(...).stages`) hoặc giải có trận đã bắt đầu (`hasStartedMatch`), và chặn đổi `matchType`/`genderRestriction` khi nội dung đã có VĐV hoặc giải đã qua `REGISTRATION_OPEN`. Luật set/điểm kiểm bằng `validateSportRuleConfig`.
- Danh sách VĐV nhập qua `POST /tournaments/:id/roster-import-batches` → `TournamentImportRepository.importRosterBatch` (`tournament-import.repository.ts:1749`), tự mở transaction và tự giữ idempotency (`tournament_roster_import_batches.idempotencyKey`).
- AI đọc bố cục đã phân loại sheet `ROSTER | BRACKET | SCHEDULE | OTHER` (`ai/dto/roster-layout.dto.ts:30-34`), chưa có loại luật.

Gọi 2 API cũ nối tiếp từ trình duyệt không đủ: luật đổi xong mà nhập VĐV lỗi thì giải bị lệch nửa chừng. Cần một lần ghi duy nhất.

## What Changes

- Thêm `POST /api/v1/tournaments/:id/workbook-import/preview`: nhận luật theo nội dung + lô VĐV (đúng định dạng `RosterImportBatchRequest` hiện có), kiểm mà không ghi, trả lỗi theo nội dung và kết quả xem trước của lô VĐV (giữ nguyên định dạng `RosterImportBatchPreview`).
- Thêm `POST /api/v1/tournaments/:id/workbook-import` (header `Idempotency-Key` bắt buộc): trong **một** transaction, áp luật từng nội dung rồi nhập lô VĐV. Bất kỳ bước nào lỗi thì không ghi gì. Gửi lại cùng key trả kết quả cũ, không ghi thêm.
- Luật được phép: `matchType`, `genderRestriction`, `bracketType`, `maxParticipants`, `roundConfig` (các field luật hiện có: `bestOf`, `setsToWin`, `pointsPerSet`, `mustWinByTwo`, `deuceEnabled`, `maxPoints`, `tiebreakAt`, `tiebreakPoints`). Mọi chặn của `updateDivisionConfig` áp nguyên vẹn; không thêm đường nào nới lỏng.
- Tách phần kiểm luật của `updateDivisionConfig` thành hàm dùng chung (không đổi hành vi endpoint cũ). Tách thân `importRosterBatch` thành hàm nhận `tx` từ ngoài; endpoint cũ giữ nguyên hành vi.
- AI bố cục: thêm loại sheet `RULES` vào `ROSTER_LAYOUT_SHEET_KINDS` và mô tả trong `ROSTER_LAYOUT_JSON_SCHEMA`. AI chỉ phân loại; cột luật do trình duyệt đọc theo tiêu đề.

## Không làm trong change này

- Không nhập bảng đấu (đợt 2) hay lịch thi đấu (đợt 3).
- Không tạo nội dung mới từ file trong endpoint này: nội dung chưa có vẫn được tạo bằng `POST` division hiện có từ trình duyệt trước khi preview (luồng `RosterImportModal` đang làm).
- Không đổi `PATCH .../divisions/:divisionId/config` hay `POST .../roster-import-batches`.
- Không đổi phí nội dung (`entryFee`) qua file.
- Không đổi schema DB, không migration.

## Capabilities

### New Capabilities

- `tournament-workbook-import`: nhập luật nội dung + danh sách VĐV từ một file trong một lần ghi.

### Modified Capabilities

- Không có. `openspec/specs/` chưa có spec chung.

## Impact

- Web Next.js (`HethongFrontEndWeb_QLgiaidau`): gọi 2 endpoint mới; change FE `workbook-import-rules` cùng ngày. Kiểu `RosterLayoutSheetKind` phía Web thêm `RULES`.
- App Flutter: không ảnh hưởng.
- Endpoint cũ `roster-import-batches` và `divisions/:divisionId/config`: hành vi giữ nguyên, có test hồi quy.
- Code: `tournaments.controller.ts`, `services/tournament-workbook-import.service.ts` (mới), `dto/workbook-import.dto.ts` (mới), `services/tournament-division.service.ts`, `repositories/tournament-import.repository.ts`, `ai/dto/roster-layout.dto.ts`, `ai/ai.service.ts`.
