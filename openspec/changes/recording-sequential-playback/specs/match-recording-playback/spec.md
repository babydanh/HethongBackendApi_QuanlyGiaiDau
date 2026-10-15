# Spec Delta

## Purpose

BTC và trọng tài được phân công xem lại bản ghi MP4 của một trận ngay trong trang quản lý giải, với các đoạn ghi phát nối tiếp đúng thứ tự thời gian.

## ADDED Requirements

### Requirement: Danh sách đoạn ghi theo thứ tự thời gian

Hệ thống SHALL hiển thị các file MP4 của một ngày ghi theo giờ bắt đầu tăng dần, suy ra từ tên file dạng `YYYY-MM-DD-HH-MM-SS-<n>.mp4`.

#### Scenario: Đoạn ghi được xếp đúng giờ
- **WHEN** AQP trả các file `23-04-29-1`, `23-11-02-0`, `23-02-30-0` cho ngày 2026-10-15
- **THEN** danh sách hiển thị theo thứ tự 23:02:30, 23:04:29, 23:11:02

#### Scenario: Ngày không có đoạn ghi
- **WHEN** ngày ghi được chọn không có file MP4 nào
- **THEN** modal hiện thông báo chưa có bản ghi cho ngày đó và không hiện trình phát

### Requirement: Phát nối tiếp các đoạn

Hệ thống SHALL phát các đoạn của ngày ghi đã chọn liền nhau theo thứ tự thời gian, với một thanh thời gian chung bằng tổng thời lượng các đoạn.

#### Scenario: Hết đoạn tự chuyển đoạn sau
- **WHEN** đoạn đang phát kết thúc và còn đoạn sau
- **THEN** trình phát tự phát đoạn kế tiếp mà người dùng không phải bấm gì, và thanh thời gian chung tiếp tục chạy

#### Scenario: Nhảy tới một đoạn
- **WHEN** người dùng bấm một đoạn trong danh sách
- **THEN** trình phát chuyển tới đầu đoạn đó và đánh dấu đoạn đang phát

#### Scenario: Một đoạn không phát được
- **WHEN** một đoạn lỗi tải hoặc lỗi giải mã
- **THEN** trình phát báo đoạn đó lỗi, bỏ qua và phát đoạn kế tiếp; nếu mọi đoạn đều lỗi thì hiện thông báo không phát được và giữ danh sách file

### Requirement: Chỉ BTC và trọng tài được phân công được xem

Hệ thống SHALL chỉ cấp nội dung phát bản ghi của một trận cho người đã đăng nhập có quyền điều khiển trận đó; URL phát MUST hết hạn sau thời gian ngắn và MUST NOT dùng được cho trận khác.

#### Scenario: BTC mở bản ghi
- **WHEN** BTC của giải mở modal bản ghi của một trận thuộc giải
- **THEN** hệ thống trả danh sách đoạn kèm URL phát và trình phát hoạt động

#### Scenario: Người không có quyền
- **WHEN** người dùng đã đăng nhập nhưng không phải BTC hay trọng tài được phân công gọi danh sách phát
- **THEN** hệ thống từ chối (403) và không trả URL phát nào

#### Scenario: URL phát hết hạn
- **WHEN** một URL phát được dùng sau khi đã hết hạn
- **THEN** hệ thống từ chối và trình phát xin lại danh sách phát mới thay vì dừng hẳn

### Requirement: Lỗi máy media hiển thị rõ ràng

Hệ thống SHALL báo lỗi khi không lấy được danh sách phát từ máy media, không lộ đường dẫn nội bộ, khoá hay thông báo gốc của nhà cung cấp.

#### Scenario: Máy media không phản hồi
- **WHEN** máy media không trả được danh sách đoạn
- **THEN** modal hiện thông báo tạm thời không tải được bản ghi kèm nút thử lại, chữ hiển thị có ở cả tiếng Việt và tiếng Anh
