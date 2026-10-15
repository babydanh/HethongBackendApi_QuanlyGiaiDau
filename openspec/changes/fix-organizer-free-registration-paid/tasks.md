## 1. Đối chiếu

- [x] 1.1 Đọc mã xác định nguồn `isPaid` của danh sách BTC, quy tắc chuẩn và các đường tạo hồ sơ. Xong khi: ghi được `file:dòng` (đã ghi ở proposal). Kết quả: `tournament-discovery.service.ts` tính `is_paid || COMPLETED`; `isRegistrationFeePaid` coi phí <= 0 và BTC miễn là đã đóng.

## 2. Test viết trước (đỏ đúng lý do)

- [x] 2.1 Bảng 7 trường hợp `isPaid` cho `findParticipantsForOrganizer` ở `tournament-discovery.service.spec.ts` và 3 test trường phí ở `tournament-participant.fee-fields.spec.ts`. Xong khi: trước khi sửa mã đúng 3 test đỏ (miễn phí→true, BTC miễn→true, repository chưa trả trường phí), 9 test còn lại xanh. Kết quả: đúng như vậy (3 failed, 9 passed).

## 3. Cài đặt

- [x] 3.1 `findParticipants` đọc thêm hai cột và chỉ trả khi `includePaymentDetails=true`. Xong khi: test "danh sách mặc định" và "danh sách công khai" không có hai trường và test BTC có.
- [x] 3.2 `findParticipantsForOrganizer` dùng `isRegistrationFeePaid`. Xong khi: bảng 7 trường hợp xanh. Kết quả: 2 spec mới 12/12 pass.

## 4. Kiểm chứng

- [x] 4.1 `openspec validate fix-organizer-free-registration-paid --strict` exit 0 và `openspec-gate.py`. Kết quả: validate "is valid"; gate chạy ở bước gộp (xem báo cáo).
- [x] 4.2 (task cuối) `NODE_OPTIONS=--max-old-space-size=4096 pnpm exec tsc --noEmit` không tăng so với baseline 12 lỗi trong `*.spec.ts`, cộng jest các spec liên quan. Kết quả: tsc 12 lỗi = baseline, toàn bộ trong `*.spec.ts` có sẵn (community-blackbox 4, lite pairing-source 2, lite race integration 2, social-sessions 2, import-capacity 1, roster-import-batch.dto 1), 0 lỗi trong file đã sửa; jest module `tournaments` bỏ integration 61 suite / 600 test pass; ESLint không thêm lỗi so với `origin/main`.
