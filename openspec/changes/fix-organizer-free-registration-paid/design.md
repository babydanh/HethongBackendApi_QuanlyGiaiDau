## Context

Hai nơi trong Backend trả lời "hồ sơ này đã đóng phí chưa" theo hai quy tắc khác nhau: luồng thanh toán và màn người chơi dùng `isRegistrationFeePaid`; danh sách BTC dùng `is_paid || COMPLETED`. Cột `entry_fee_at_registration` là `NOT NULL DEFAULT 0.00` nên mọi hàng đều có phí snapshot.

## Decisions

**D1. Dùng lại `isRegistrationFeePaid`, không viết quy tắc thứ hai.** Một chỗ định nghĩa "đã đóng"; danh sách BTC hết lệch với thanh toán.

**D2. `isLiteRegistration: false`.** Quy tắc chuẩn trả false cho Lite khi không có payment (cờ pairing Lite cũ không đáng tin). Truyền cờ Lite thật có thể biến một hồ sơ Lite đang hiện "đã đóng" thành "chưa đóng" ở danh sách BTC, đổi hành vi ngoài phạm vi lỗi. Với `false` quy tắc chỉ thêm "đã đóng", không bớt (đơn điệu). Chưa kiểm Lite có dùng endpoint này hay không (Web Lite dùng `getLiteParticipants`).

**D3. Trường phí chỉ ra ở đường BTC.** Danh sách công khai (`findPublicParticipants`) trải `...safeParticipant` từ `findParticipants`; thêm cột vào truy vấn chung mà không lọc sẽ lộ `organizerWaivedFee` ra công khai. Nên repository chỉ gắn hai trường khi `includePaymentDetails=true`. Phương án thay thế: tính `isPaid` ngay trong repository và không lộ trường nào; bỏ vì `isPaid` thô của `findParticipants` còn được caller khác dùng và vì service là chỗ sở hữu quy tắc.

**D4. Thiếu trường phí không phải miễn phí.** `Number(undefined)` là `NaN`, không `<= 0`, nên hàng thiếu `entryFeeAtRegistration` rơi xuống `is_paid`/payment. (`Number(null)` sẽ là 0; cột NOT NULL nên không xảy ra, nhưng đó là lý do không dùng `?? 0`.)

**D5. Không sửa dữ liệu.** Không migration, không backfill. Hiển thị đúng ngay cả với hàng cũ vì suy ra khi đọc.

## Risks / Trade-offs

- Hồ sơ cũ có phí thật nhưng snapshot giữ mặc định `0.00` sẽ hiện "Đã đóng" ở danh sách BTC. Luồng thanh toán đã coi các hồ sơ đó miễn phí (không cho thanh toán), nên chỉ nhất quán hơn. Chưa đo số lượng trên production.
- **Khoảng trống đã biết (ngoài phạm vi):** bốc thăm và `onlyEligible` vẫn đọc `is_paid` thô. Hồ sơ miễn phí `is_paid=false` chưa miễn BTC không vào diện bốc thăm dù UI hiện "Đã đóng". Sửa gốc cần quyết định riêng: đặt `is_paid` đúng ở các đường tạo + backfill, hoặc đổi điều kiện lọc.
- Ô tick đóng phí ở Web: bỏ tick hồ sơ miễn phí ghi `is_paid=false` thô, UI hiện bỏ tick tới khi nạp lại rồi lại tick.
- Chưa xác minh hồ sơ trong ảnh có snapshot bao nhiêu và đi đường tạo nào. Nếu snapshot > 0 và chưa miễn, bản sửa không đổi dòng đó (đúng theo quy tắc chuẩn).
