# Kế hoạch API CRUD (API CRUD Plan)

Tài liệu này liệt kê kế hoạch xây dựng các RESTful API endpoints cơ bản (CRUD: Create, Read, Update, Delete) cho các Modules chính trong hệ thống Quản Lý Giải Đấu (dựa trên kiến trúc NestJS Modular).

> **Quy chuẩn chung:**
> - Tất cả các API sẽ có prefix là `/api/v1/...` (có thể cấu hình Global Prefix trong NestJS).
> - Trả về dữ liệu chuẩn theo định dạng (được xử lý bởi Interceptor): `{ data, message, statusCode, ... }`
> - Đa số các thao tác POST, PATCH, DELETE yêu cầu người dùng phải đăng nhập (Authentication Guard).

---

## 1. Module `Users` (Người dùng & Người chơi)
*Quản lý thông tin đăng nhập, hồ sơ cá nhân và chỉ số cơ bản của người chơi.*
- `GET    /users`      : Lấy danh sách người dùng (hỗ trợ phân trang `?page=1&limit=10`, tìm kiếm `?search=Tuan`).
- `GET    /users/:id`  : Lấy chi tiết thông tin một người dùng cụ thể.
- `POST   /users`      : Tạo người dùng mới (Dùng cho luồng Đăng ký/Admin tạo thủ công).
- `PATCH  /users/:id`  : Cập nhật thông tin (Đổi avatar, cập nhật tên hiển thị, chiều cao, cân nặng...).
- `DELETE /users/:id`  : Xóa hoặc vô hiệu hóa (Soft-delete) tài khoản người dùng.

## 2. Module `Communities` (Cộng đồng / Câu lạc bộ)
*Quản lý thông tin cộng đồng, hội nhóm Pickleball/Tennis.*
- `GET    /communities`      : Xem danh sách các Cộng đồng.
- `GET    /communities/:id`  : Xem chi tiết Community (thông tin giới thiệu, danh sách thành viên trực thuộc).
- `POST   /communities`      : Tạo Community mới (Người tạo sẽ thành Owner).
- `PATCH  /communities/:id`  : Chỉnh sửa thông tin Community.
- `DELETE /communities/:id`  : Xóa Community (Chỉ Owner hoặc Admin mới có quyền).
- **Sub-routes:**
  - `POST /communities/:id/members` : Thêm thành viên vào Community.
  - `DELETE /communities/:id/members/:userId` : Xóa thành viên khỏi Community.

## 3. Module `Tournaments` (Giải đấu)
*Phần trung tâm của hệ thống, quản lý thông tin giải đấu.*
- `GET    /tournaments`      : Xem danh sách các giải đấu (Lọc theo trạng thái: Sắp diễn ra, Đang diễn ra, Đã kết thúc).
- `GET    /tournaments/:id`  : Xem chi tiết giải (Điều lệ, cơ cấu giải thưởng, thể thức thi đấu).
- `POST   /tournaments`      : (Admin/Ban tổ chức) Tạo một giải đấu mới.
- `PATCH  /tournaments/:id`  : Cập nhật thông tin, thay đổi trạng thái giải đấu.
- `DELETE /tournaments/:id`  : Hủy bỏ giải đấu.

## 4. Module `Matches` (Trận đấu & Live Score)
*Quản lý các trận thi đấu cụ thể nằm trong một Giải đấu.*
- `GET    /matches`      : Lấy danh sách trận đấu (có thể filter theo `?tournamentId=123`).
- `GET    /matches/:id`  : Lấy chi tiết thông tin trận đấu (Ai đá với ai, tỷ số hiện tại).
- `POST   /matches`      : Hệ thống/Admin tự động tạo trận đấu dựa trên Bracket (nhánh đấu).
- `PATCH  /matches/:id`  : **(Quan trọng)** API cập nhật điểm số (Live score). Được dùng liên tục khi trận đấu đang diễn ra.
- `DELETE /matches/:id`  : Hủy hoặc reset một trận đấu.

## 5. Module `Ratings` (Xếp hạng)
*Quản lý điểm số xếp hạng trình độ của người chơi (Tương tự hệ thống DUPR).*
- `GET    /ratings`      : Lấy bảng xếp hạng tổng (Leaderboard).
- `GET    /ratings/:userId`: Xem lịch sử biến động điểm xếp hạng của một cá nhân.
- *(Lưu ý: Thường không có API POST/PATCH cho điểm số từ Client. Điểm số sẽ được **hệ thống tự động tính toán và cập nhật** bằng Event-Driven/Subscriber sau khi một Match chuyển sang trạng thái `COMPLETED`).*

## 6. Module `Notifications` (Thông báo)
*Hỗ trợ tương tác với người dùng qua Web App hoặc Mobile App.*
- `GET    /notifications`      : Lấy danh sách thông báo của User đang đăng nhập.
- `PATCH  /notifications/:id/read` : Đánh dấu một thông báo là đã đọc.
- `PATCH  /notifications/read-all` : Đánh dấu tất cả là đã đọc.
