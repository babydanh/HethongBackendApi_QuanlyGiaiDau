## Why

Ghép ngẫu nhiên đôi (`POST /tournaments/:id/pairing/generate`, strategy `RANDOM`) hiện nhận `divisionId` tùy chọn. Khi bỏ trống, backend ghép trên toàn giải, nên VĐV của nội dung này có thể bị ghép chéo sang nội dung khác (ví dụ Đôi Nam với Đôi Nữ). Web đã được sửa để luôn gửi nội dung đang xem (change `fix-random-pairing-division-web`). Backend cần chặn trường hợp còn lại: giải có nhiều nội dung mà request không nêu nội dung, để lỗi không bị nuốt thành ghép chéo.

## What Changes

- `tournament-lite.service.ts` `generateLitePairs`: khi `dto.divisionId` trống và giải có từ 2 nội dung trở lên, ném `BadRequestException('Vui lòng chọn nội dung để ghép đôi.')` trước khi gọi `generateLitePairsTx`.
- Giải có đúng 1 nội dung: giữ hành vi cũ, không bắt buộc `divisionId`.
- `dto/generate-lite-pairs.dto.ts`: sửa mô tả `divisionId` từ "bỏ trống = toàn giải" thành "bắt buộc khi giải có nhiều nội dung".
- Test jest cho cả hai nhánh trong `tournament-lite.service.btc-pairing.spec.ts`.

## Capabilities

### New Capabilities

- `random-pairing-division-scope`: ghép ngẫu nhiên đôi bắt buộc chỉ định nội dung khi giải có nhiều nội dung.

### Modified Capabilities

- Không có. Thư mục `openspec/specs/` chưa có spec chung cho mục này.

## Impact

- Code: `src/modules/tournaments/services/tournament-lite.service.ts`, `src/modules/tournaments/dto/generate-lite-pairs.dto.ts`.
- Test: `src/modules/tournaments/services/tournament-lite.service.btc-pairing.spec.ts`.
- Không đổi schema, migration, contract response, hay thuật toán ghép.
- Tương thích: Web đã gửi `divisionId`; App Flutter chưa xác minh có gọi endpoint này hay không. Nếu App gọi khi giải nhiều nội dung mà không gửi `divisionId`, App sẽ nhận 400 với thông điệp trên.
- Không đụng xác thực liên kết tài khoản hay consent của Backend.
- Không kiểm tra `divisionId` có thuộc giải hay không (ngoài phạm vi).
