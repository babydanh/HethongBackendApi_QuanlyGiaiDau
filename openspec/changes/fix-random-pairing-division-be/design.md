## Context

`generateLitePairs` đã tải `divisions` bằng `getDivisionsByTournament(id)` để kiểm tra giải đánh đôi. `dto.divisionId` là tùy chọn và được chuyển thẳng vào `generateLitePairsTx`. Khi trống, transaction ghép trên toàn giải.

## Decisions

- **Kiểm tra trong service, sau kiểm tra đánh đôi.** Cần số nội dung của giải, mà DTO không biết được. Dùng lại danh sách `divisions` đã tải, không thêm truy vấn.
- **Điều kiện là `divisions.length > 1`.** Giải một nội dung vẫn ghép toàn giải, nên hành vi đó không đổi và không ảnh hưởng luồng đơn giản. Điều kiện này không đếm nội dung đánh đôi riêng, vì transaction đã lọc theo nội dung.
- **Thông điệp 400 bằng tiếng Việt** theo kiểu sẵn có của service ("Ghép cặp chỉ hỗ trợ giải đấu đánh đôi."), để Web hiển thị qua `getErrorMessage`.
- **Không đổi DTO thành bắt buộc.** `divisionId` vẫn tùy chọn vì giải một nội dung không cần; chỉ sửa mô tả.

## Alternatives considered

- Bắt buộc `divisionId` ở DTO cho mọi giải: làm hỏng giải một nội dung và App nếu App gọi không gửi trường này.
- Tự chọn nội dung đầu tiên khi trống: ghép âm thầm sai nội dung, trái yêu cầu không nuốt lỗi.

## Risks

- App Flutter chưa xác minh có gọi endpoint này khi giải nhiều nội dung hay không. Rủi ro này được ghi trong báo cáo, không tự xử lý.
- Thứ tự gộp: Web gửi `divisionId` trước; Backend bật rule sau. Nếu Backend gộp trước, Web cũ (đang chạy) sẽ nhận 400 khi ghép ngẫu nhiên trên giải nhiều nội dung. Web mới đã gửi `divisionId`, nên gộp Web trước là an toàn.

## Rollback

Revert commit này. Không có migration, không đổi dữ liệu.
