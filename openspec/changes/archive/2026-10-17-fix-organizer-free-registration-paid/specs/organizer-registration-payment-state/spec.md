## ADDED Requirements

### Requirement: Danh sách BTC dùng quy tắc đã đóng phí chuẩn
`GET /tournaments/:id/manage/participants` SHALL đặt `isPaid` của mỗi hồ sơ bằng quy tắc `isRegistrationFeePaid` với `isLiteRegistration=false`: true khi phí lúc đăng ký <= 0, hoặc `organizerWaivedFee` true, hoặc có payment REGISTRATION_FEE trạng thái COMPLETED, hoặc cột `is_paid` true; ngược lại false. Endpoint MUST NOT trả `isPaid=false` cho hồ sơ mà cột `is_paid` đang true.

#### Scenario: Giải miễn phí lưu is_paid=false
- **WHEN** hồ sơ có `entryFeeAtRegistration` "0.00", `is_paid` false, không miễn, không payment
- **THEN** phản hồi 200 có `isPaid` true

#### Scenario: BTC miễn phí cho hồ sơ của hạng mục có phí
- **WHEN** hồ sơ có phí "150000.00", `organizerWaivedFee` true, `is_paid` false
- **THEN** `isPaid` true

#### Scenario: Có phí và chưa đóng
- **WHEN** hồ sơ có phí "150000.00", `is_paid` false, không miễn, không payment hoặc payment PENDING
- **THEN** `isPaid` false

#### Scenario: Thanh toán hoàn tất
- **WHEN** hồ sơ có phí "150000.00" và payment COMPLETED
- **THEN** `isPaid` true

#### Scenario: Thiếu thông tin phí
- **WHEN** hàng dữ liệu không mang `entryFeeAtRegistration`
- **THEN** phí không được coi là 0; `isPaid` theo `is_paid` và payment

#### Scenario: Không có quyền quản lý giải
- **WHEN** người gọi không phải quản lý giải
- **THEN** phản hồi 403 và không có dữ liệu hồ sơ

### Requirement: Hình dạng phản hồi BTC không đổi
Phản hồi `GET /tournaments/:id/manage/participants` MUST NOT mang thêm trường nào so với trước thay đổi này: `entryFeeAtRegistration` và `organizerWaivedFee` chỉ là đầu vào của quy tắc và MUST NOT xuất hiện trong phản hồi BTC, trong danh sách mặc định của `findParticipants` hay trong danh sách công khai. Chỉ giá trị `isPaid` được phép đổi.

#### Scenario: Danh sách BTC
- **WHEN** BTC gọi `GET /tournaments/:id/manage/participants`
- **THEN** mỗi hồ sơ có các trường như trước, không có `entryFeeAtRegistration`, không có `organizerWaivedFee`, và `isPaid` theo quy tắc ở trên

#### Scenario: Danh sách công khai
- **WHEN** khách gọi danh sách công khai của giải
- **THEN** hồ sơ không có `entryFeeAtRegistration` và không có `organizerWaivedFee`

#### Scenario: Giải không có hồ sơ
- **WHEN** giải chưa có hồ sơ đăng ký nào
- **THEN** phản hồi 200 với mảng rỗng
