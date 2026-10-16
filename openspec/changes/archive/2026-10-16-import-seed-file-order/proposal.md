# Proposal

## Why

Người dùng nhập file Excel 16 đôi (cột `Điểm ELO (nếu có)` = 1200, 1150, …) thì VĐV nhận hạt giống 1200, 1150, … (2026-10-16, sporto.asia). Nguyên nhân trong code (lane `import-seed-file-order` từ `origin/main`):

- `src/modules/tournaments/repositories/tournament-import.repository.ts:2361` trong `persistImportRows`: `seed: row.elo ? Math.round(row.elo) : null`. Điểm ELO của file bị ghi thẳng vào cột hạt giống.
- `persistImportRows` là đường ghi chung của cả 3 lối nhập: batch Excel (`importRosterBatch`, dòng 1944), `importParticipants` (dòng 2100), Google Form (dòng 2261).
- Điểm trong file có thể là DUPR hay thang điểm khác, không phải ELO SportO. `autoSeedFromElo` (`tournament-bracket.service.ts:634`) dùng ELO SportO của tài khoản, không dùng số này.

Người dùng chốt: hạt giống = **thứ tự dòng trong file** trong từng nội dung; điểm trong file chỉ là ghi chú.

## What Changes

- `persistImportRows`: bỏ `seed = elo`. Hạt giống của dòng thứ `i` (theo thứ tự gửi lên, tức thứ tự trong file) trong một nội dung = `max(seed hiện có của nội dung đó) + i + 1`. Nội dung mới thì 1, 2, 3, … Nhập thêm vào nội dung đã có hạt giống thì nối tiếp, không trùng số cũ.
- Tính `max(seed)` trong cùng transaction, sau `pg_advisory_xact_lock(hashtext('tournament-seeding:<tournamentId>'))`, đúng khóa mà `assignNextAvailableSeed` (`tournament-participant.repository.ts:1237`) đang dùng. Hai lượt nhập/xếp hạt giống song song vào cùng giải không ra số trùng.
- `elo` trong DTO vẫn được nhận (client cũ còn gửi; `forbidNonWhitelisted` sẽ trả 400 nếu xoá field). Giá trị được giữ trong `customResponses.importedElo`, không ghi vào `seed`.

## Không làm trong change này

- Không đổi `autoSeedFromElo`, `PATCH /seeds`, luồng đăng ký online.
- Không thêm cột/migration. Không đổi DTO.
- Không sửa hạt giống sai đã ghi trong DB của các lượt nhập cũ: người dùng xếp lại bằng chức năng hạt giống có sẵn.

## Capabilities

### New Capabilities

- `participant-import-seeding`: cách hạt giống được gán khi nhập danh sách VĐV.

### Modified Capabilities

- Không có.

## Impact

- Code: `tournament-import.repository.ts` (`persistImportRows`, `ImportPersistRow`).
- Test: `tournament-import-capacity.spec.ts` (thêm ca hạt giống theo thứ tự, nối tiếp, không lấy ELO).
- Repo khác: Web ngừng gửi `elo` và đưa điểm vào ghi chú (change Web `roster-import-seed-notes`), không phụ thuộc thứ tự deploy.
