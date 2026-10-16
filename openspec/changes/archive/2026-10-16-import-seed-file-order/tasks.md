## 0. Đọc nguồn (đã làm)

- [x] 0.1 `persistImportRows` (`tournament-import.repository.ts:2296-2395`) ghi `seed: row.elo`; 3 lối gọi ở dòng 1944, 2100, 2261. `assignNextAvailableSeed` (`tournament-participant.repository.ts:1235-1292`) dùng `pg_advisory_xact_lock(hashtext('tournament-seeding:<id>'))` + `max(seed)` theo nội dung. `updateSeeds` không chặn trùng số.

## 1. Thay đổi

- [x] 1.1 `persistImportRows`: khóa advisory `tournament-seeding:<tournamentId>`, đọc `max(seed)` của nội dung (hoặc nhóm không nội dung), gán `seed = max + i + 1` theo thứ tự `rows`. Bỏ `seed = elo`. Ghi `importedElo` vào metadata khi có. Đã làm trong `tournament-import.repository.ts`: `importedElo` đặt trong `customResponses`. Kết quả: `pnpm exec jest src/modules/tournaments/repositories` → 17/17 suite pass, 138 test pass, 0 fail, 20 skipped (integration).
- [x] 1.2 Unit test (`tournament-import-capacity.spec.ts` hoặc spec cùng thư mục): nội dung trống 1..N theo thứ tự; nội dung có sẵn seed thì nối tiếp; `elo` không thành seed và nằm ở `importedElo`. Ca mới fail trước khi sửa. Kết quả: 4 ca mới trong `tournament-import-capacity.spec.ts`; trước khi sửa 4 failed / 49 passed, sau khi sửa tất cả pass. Thêm `execute` no-op vào mock `tx` của `tournament-import-legacy-contract.spec.ts` và `tournament-import-email-link.spec.ts`, vì lời gọi khóa mới làm 13 ca cũ lỗi `tx.execute is not a function`.

## 2. Kiểm tra

- [x] 2.1 `pnpm build` (tsc) exit 0 (`nest build`). Lưu ý: `pnpm exec tsc --noEmit -p tsconfig.json` (gồm cả spec) exit 2 với 12 lỗi có sẵn ở các spec không đổi; lỗi `tournament-import-capacity.spec.ts` (`result.participant` unknown) cũng có ở bản HEAD. `tsconfig.build.json` exit 0.
- [x] 2.2 `pnpm test -- tournament-import` local: 5 suite pass, 124 test pass, 0 fail. Cả bộ Jest trên cloud target `backend`, run 38865228347, commit `e0dcbab`: 187 suite pass (5 skipped), 1856 test pass, 25 skipped, 0 fail.
- [x] 2.3 `openspec validate import-seed-file-order --strict` exit 0: "Change 'import-seed-file-order' is valid".
