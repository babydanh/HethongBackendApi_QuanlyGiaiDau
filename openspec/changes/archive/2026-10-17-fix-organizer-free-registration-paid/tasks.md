## 1. Đối chiếu

- [x] 1.1 Đọc mã xác định nguồn `isPaid` của danh sách BTC, quy tắc chuẩn và các đường tạo hồ sơ. Xong khi: ghi được `file:dòng` (đã ghi ở proposal). Kết quả: `tournament-discovery.service.ts` tính `is_paid || COMPLETED`; `isRegistrationFeePaid` coi phí <= 0 và BTC miễn là đã đóng.

## 2. Test viết trước (đỏ đúng lý do)

- [x] 2.1 Bảng 7 trường hợp `isPaid` + 1 test hình dạng payload cho `findParticipantsForOrganizer` ở `tournament-discovery.service.spec.ts`, và 3 test trường phí ở `tournament-participant.fee-fields.spec.ts`. Xong khi: trước khi sửa mã, test đỏ đúng lý do. Kết quả: lần 1 đỏ 3 (miễn phí→true, BTC miễn→true, repository chưa trả trường phí), 9 xanh; lần 2 (sau khi thêm test hình dạng payload) đỏ đúng 1 (payload còn mang hai trường phí), 9 xanh.

## 3. Cài đặt

- [x] 3.1 `findParticipants` đọc thêm hai cột và chỉ trả khi `includePaymentDetails=true`. Xong khi: test "danh sách mặc định" và "danh sách công khai" không có hai trường và test BTC có.
- [x] 3.2 `findParticipantsForOrganizer` dùng `isRegistrationFeePaid` và tách `entryFeeAtRegistration`, `organizerWaivedFee` khỏi payload (hình dạng không đổi, không cần `sync-api-clients`). Xong khi: bảng 7 trường hợp và test hình dạng payload xanh. Kết quả: 2 spec (discovery + fee-fields) 13/13 pass.

## 4. Kiểm chứng

- [x] 4.1 `openspec validate fix-organizer-free-registration-paid --strict` exit 0 và `openspec-gate.py`. Kết quả: validate "is valid"; gate chạy ở bước gộp (xem báo cáo).
- [x] 4.2 (task cuối) `NODE_OPTIONS=--max-old-space-size=4096 pnpm exec tsc --noEmit` không tăng so với baseline 12 lỗi trong `*.spec.ts`, cộng jest các spec liên quan. Kết quả (chạy lại sau khi đổi service): tsc 12 lỗi = baseline, toàn bộ trong `*.spec.ts` có sẵn, 0 lỗi trong file đã sửa; jest module `tournaments` bỏ integration 61 suite / 601 test pass; ESLint không thêm lỗi so với `origin/main` (repository 11, discovery service 1, discovery spec 2, fee-fields spec 0).
