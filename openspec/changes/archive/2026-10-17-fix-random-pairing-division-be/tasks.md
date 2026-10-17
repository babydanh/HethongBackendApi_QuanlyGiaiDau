## 1. Test trước (đỏ)

- [x] 1.1 Thêm test trong `tournament-lite.service.btc-pairing.spec.ts`: giải nhiều nội dung không có `divisionId` bị từ chối và không gọi `generateLitePairsTx`.
- [x] 1.2 Thêm test: giải một nội dung không có `divisionId` vẫn ghép và truyền `undefined`.
- [x] 1.3 Chạy `node node_modules/jest/bin/jest.js` trên spec và xác nhận test 1.1 đỏ trước khi sửa source (1 failed, 4 passed).

## 2. Triển khai

- [x] 2.1 `tournament-lite.service.ts` `generateLitePairs`: thêm kiểm tra `!dto.divisionId && divisions.length > 1` → `BadRequestException('Vui lòng chọn nội dung để ghép đôi.')`.
- [x] 2.2 `dto/generate-lite-pairs.dto.ts`: sửa mô tả `divisionId`.

## 3. Kiểm tra

- [x] 3.1 Chạy lại 4 spec liên quan `generateLitePairs` (`btc-pairing`, `tournament-bracket-doubles`, `tournaments-lite-pairing`, `tournament-lite.repository.pairing-source`): 4 suites, 109 tests xanh.
- [x] 3.2 `NODE_OPTIONS=--max-old-space-size=4096 node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`: exit 0, 0 lỗi.
- [x] 3.3 `openspec validate fix-random-pairing-division-be --strict`: valid.
