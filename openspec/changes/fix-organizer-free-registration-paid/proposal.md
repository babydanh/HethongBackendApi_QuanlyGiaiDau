## Why

Chủ dự án gửi ảnh: hộp "Chi tiết hồ sơ đăng ký" của BTC trên Web hiện huy hiệu đỏ **"Chưa thanh toán"** ở một giải **không có phí**.

Gốc lỗi (đã đọc mã): `GET /tournaments/:id/manage/participants` tính `isPaid` trong `TournamentDiscoveryService.findParticipantsForOrganizer` bằng `cột is_paid || có payment COMPLETED`. Quy tắc chuẩn `isRegistrationFeePaid` (`utils/registration-payment-eligibility.ts`), đang dùng ở luồng thanh toán và màn người chơi, còn coi **phí lúc đăng ký <= 0** và **phí BTC miễn (`organizer_waived_fee`)** là đã đóng. Danh sách BTC bỏ sót hai trường hợp này nên hai nơi nói hai điều khác nhau về cùng một hồ sơ.

Đường đăng ký chính đã đặt `is_paid = (phí === 0)`; các đường tạo hồ sơ khác để `is_paid = false` dù phí 0 hoặc đã miễn (import `tournament-import.repository.ts:849`, `:958`, `:1062`). Chưa xác minh được hồ sơ trong ảnh đi qua đường nào (không có quyền truy cập DB production).

## What Changes

- `findParticipantsForOrganizer` dùng `isRegistrationFeePaid` (`isLiteRegistration: false`) thay cho `is_paid || COMPLETED`. Chỉ thêm trường hợp "đã đóng" (phí <= 0, BTC miễn), không bao giờ biến "đã đóng" thành "chưa đóng".
- `findParticipants` đọc thêm `entryFeeAtRegistration`, `organizerWaivedFee` và **chỉ trả hai trường này khi `includePaymentDetails=true`** (nội bộ giữa repository và service). Danh sách mặc định và công khai không đổi, không lộ trường mới. Service tách hai trường ra khỏi kết quả sau khi tính `isPaid`.
- Phản hồi `GET /tournaments/:id/manage/participants`: **hình dạng không đổi**, chỉ **giá trị** `isPaid` đổi (thay đổi hành vi, không phải thay đổi hợp đồng). `node scripts/sync-api-clients.js` **chưa chạy** và không cần: diff so với `origin/main` có 0 dòng ở controller, DTO và decorator `@ApiProperty/@ApiResponse/@ApiOperation`, nên Swagger và client sinh ra từ nó không đổi. Script cũng không chạy an toàn lúc này: cần backend sống ở `localhost:3101` (Docker/DB đang tắt) và ghi đè `api-client.ts` / `api_service.dart` ở checkout chính của Web/App đang có việc dở của session khác.

## Out of scope

- Không sửa các đường tạo hồ sơ (import, lite) và không backfill cột `is_paid`.
- Không đổi bộ lọc `onlyEligible` và bốc thăm (`bracket-generator.service.ts`, `tournament-bracket.repository.ts`): chúng vẫn đọc cột `is_paid` thô, nên hồ sơ miễn phí lưu `is_paid=false` và chưa BTC miễn **vẫn không vào diện bốc thăm** dù UI nay hiện "Đã đóng". Cần quyết định riêng.
- Không đổi PATCH `.../participants/:participantId/fee-paid`: BTC bỏ tick một hồ sơ miễn phí vẫn ghi `is_paid=false` thô.
- Không đổi quy tắc Lite, route, quyền, schema, migration, danh sách công khai.
- Không thêm phân trang cho endpoint này (hiện chưa có; ngoài phạm vi sửa lỗi).

## Impact

- Repo khác: **Web** (`HethongFrontEndWeb_QLgiaidau`) đọc `isPaid` ở `RegistrationTab.tsx` (huy hiệu, ô tick, bộ lọc "Chưa thanh toán", đếm), `FootballRegistrationGroups.tsx`, `ops/components/OpsParticipants.tsx`: **không cần sửa Web**, giá trị hiển thị tự đúng sau khi Backend triển khai. Hình dạng phản hồi không đổi nên không cần cập nhật kiểu ở Web. **App Flutter**: chưa kiểm xem có dùng endpoint này không.
- Endpoint: `GET /tournaments/:id/manage/participants` (chỉ đổi giá trị `isPaid`; không thêm trường). Không endpoint nào khác đổi.
- Tệp: `src/modules/tournaments/repositories/tournament-participant.repository.ts`, `src/modules/tournaments/services/tournament-discovery.service.ts`, test `tournament-discovery.service.spec.ts`, `tournament-participant.fee-fields.spec.ts` (mới).
- Rủi ro: hồ sơ cũ có phí thật nhưng cột `entry_fee_at_registration` giữ mặc định `0.00` sẽ hiện "Đã đóng" ở danh sách BTC. Luồng thanh toán và màn người chơi đã coi các hồ sơ đó là miễn phí từ trước, nên danh sách BTC chỉ trở nên nhất quán với chúng; chưa đo số hồ sơ như vậy trên production.
- Triển khai: push `main` Backend = deploy production; chờ chủ dự án.
