# Design

## Hợp đồng

```ts
// dto/workbook-import.dto.ts
class WorkbookDivisionRulesDto {
  divisionId: string;                 // UUID nội dung đã tồn tại trong giải
  matchType?: MatchType;
  genderRestriction?: GenderRestriction | null;
  bracketType?: 'SINGLE_ELIMINATION' | 'DOUBLE_ELIMINATION' | 'ROUND_ROBIN' | 'GROUP_STAGE_KNOCKOUT';
  maxParticipants?: number;           // >= 2
  roundConfig?: Record<string, unknown>; // kiểm bằng validateSportRuleConfig như endpoint config
}
class WorkbookImportRequestDto {
  rules: WorkbookDivisionRulesDto[];  // 0..20 phần tử, divisionId không trùng
  roster: RosterImportBatchRequest;   // đúng DTO hiện có của roster-import-batches
}
```

Preview trả `data = { rules: Array<{ divisionId, errors: string[] }>, roster: RosterImportBatchPreview }`. Commit trả `data = { rulesApplied: number, importedCount: number, replayed: boolean }`.

## Thứ tự ghi

```
transaction
  1. claim idempotency key (bảng tournament_roster_import_batches, như hiện tại)
     - đã có → trả replay, không ghi gì
  2. với mỗi rules[i]: assertDivisionRulesUpdatable(...) rồi update tournament_divisions
  3. importRosterBatchInTx(tx, ...)  ← kiểm sức chứa dùng maxParticipants MỚI của bước 2
commit
```

Luật áp trước VĐV để giới hạn số đội mới được dùng khi kiểm sức chứa. Đổi `matchType` vẫn bị chặn nếu nội dung **đã có** VĐV trước lần nhập này (giữ nguyên quy tắc cũ); VĐV của chính lần nhập chỉ được ghi sau bước 2 nên không làm chặn bước 2.

## Tách hàm (không đổi hành vi cũ)

- `TournamentDivisionService.assertDivisionRulesUpdatable(tournament, division, dto, category, tx?)`: phần kiểm hiện nằm trong `updateDivisionConfig` (sơ đồ đã có, trận đã bắt đầu, đổi hình thức khi có VĐV / sai trạng thái giải, `validateMatchTypeAgainstCategory`, `validateMatchTypeGenderRestriction`, `validateSportRuleConfig`). `updateDivisionConfig` gọi lại hàm này.
- `TournamentImportRepository.importRosterBatchInTx(tx, ...)`: thân hiện tại của `importRosterBatch` sau bước claim. `importRosterBatch` giữ transaction + claim như cũ và gọi hàm này.
- Đọc trong hàm kiểm dùng `tx` khi có, để bước 2 thấy cùng trạng thái với bước 3.

## Quyền

Cùng điều kiện với `updateDivisionConfig` và `roster-import-batches`: người quản lý giải (`tournamentAccessService.isManager`). Không có quyền → 403, không ghi.

## Lỗi

| Trường hợp | HTTP |
|---|---|
| Thiếu `Idempotency-Key` hoặc sai định dạng | 400 |
| `divisionId` không thuộc giải / trùng trong `rules` | 400 (preview trả lỗi theo nội dung, không ném) |
| Nội dung đã có sơ đồ hoặc giải có trận đã bắt đầu | 400, không ghi gì |
| Lô VĐV không hợp lệ (như endpoint cũ) | 400, luật đã áp ở bước 2 bị rollback |
| Không phải quản lý giải | 403 |

## AI bố cục

`ROSTER_LAYOUT_SHEET_KINDS` thêm `RULES`. Prompt thêm một dòng: sheet mô tả thể thức/luật theo từng nội dung (số set, điểm, số đội) là `RULES`, không có `blocks`. Không thêm slot cột luật; trình duyệt đọc cột theo tiêu đề.
