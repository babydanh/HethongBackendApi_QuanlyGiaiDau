## 1. Test tái hiện

- [x] 1.1 Bộ parse SQL giả trong `tournament-bracket-doubles.spec.ts` hỗ trợ `<=`
- [x] 1.2 TC-BRK-FREE-01: cặp `isPaid=false`, phí lúc đăng ký 0 hoặc rỗng vào sơ đồ (đỏ trước khi sửa)
- [x] 1.3 TC-BRK-06 dùng phí lúc đăng ký > 0 cho cặp "chưa đóng phí" để giữ đúng ý nghĩa

## 2. Sửa

- [x] 2.1 `eligibleTeamCondition()` thêm nhánh `entryFeeAtRegistration IS NULL OR entryFeeAtRegistration <= 0`

## 3. Kiểm chứng

- [x] 3.1 Jest `src/modules/tournaments` xanh, `tsc --noEmit` 0 lỗi
