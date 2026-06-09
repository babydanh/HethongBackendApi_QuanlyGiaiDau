# 🌐 Danh sách Endpoint URLs (API)

Dưới đây là tổng hợp toàn bộ các API Endpoint của hệ thống Backend (đã kiểm tra kỹ lại dựa trên code thực tế trong Controllers). Những endpoint nào đã được triển khai xong sẽ được đánh dấu tích `[x]`, chưa làm sẽ đánh dấu `[ ]`.

*Base URL mặc định:* `http://localhost:3000/api/v1`

---

## 1. Authentication (`/auth`)
- [x] `POST /auth/register` - Đăng ký tài khoản mới
- [x] `POST /auth/login` - Đăng nhập
- [x] `POST /auth/refresh` - Cấp lại Access Token mới
- [x] `POST /auth/logout` - Đăng xuất
- [x] `GET /auth/google` - Đăng nhập Google
- [x] `GET /auth/google/callback` - URL Callback Google OAuth

## 2. Users (`/users`)
- [x] `GET /users` - Lấy danh sách users
- [x] `GET /users/profile` - Lấy thông tin cá nhân của user đang đăng nhập
- [x] `GET /users/:id` - Xem profile của user cụ thể
- [x] `PATCH /users/profile` - Cập nhật thông tin cá nhân (Profile)
- [x] `PATCH /users/change-password` - Đổi mật khẩu
- [x] `DELETE /users/:id` - Xóa tài khoản (Soft delete)

## 3. Categories (`/categories`)
- [x] `GET /categories` - Lấy danh sách môn thể thao
- [x] `GET /categories/:id` - Xem chi tiết một môn thể thao
- [x] `POST /categories` - Tạo môn thể thao mới
- [x] `PATCH /categories/:id` - Cập nhật môn thể thao
- [x] `DELETE /categories/:id` - Xóa môn thể thao
- [x] `GET /categories/:id/elo-tiers` - Lấy danh sách hạng ELO của môn
- [x] `POST /categories/:id/elo-tiers` - Tạo hạng ELO mới
- [x] `PATCH /categories/:categoryId/elo-tiers/:tierId` - Cập nhật hạng ELO
- [x] `DELETE /categories/:categoryId/elo-tiers/:tierId` - Xóa hạng ELO

## 4. Communities (`/communities`)
- [x] `GET /communities` - Lấy danh sách cộng đồng
- [x] `GET /communities/pending` - Lấy danh sách cộng đồng đang chờ duyệt
- [x] `GET /communities/:id` - Xem chi tiết cộng đồng
- [x] `POST /communities` - Tạo cộng đồng mới
- [x] `PATCH /communities/:id` - Cập nhật cộng đồng
- [x] `PATCH /communities/:id/review` - Duyệt / Từ chối cộng đồng
- [x] `DELETE /communities/:id` - Xóa cộng đồng
- [x] `GET /communities/:id/members` - Lấy danh sách thành viên cộng đồng
- [x] `POST /communities/:id/members` - Xin tham gia cộng đồng
- [x] `PATCH /communities/:id/members/:userId` - Cập nhật role thành viên
- [x] `DELETE /communities/:id/members/:userId` - Đuổi / Xóa thành viên

## 5. Venues (`/venues`)
- [x] `GET /venues` - Lấy danh sách địa điểm
- [x] `GET /venues/:id` - Xem chi tiết địa điểm
- [x] `POST /venues` - Tạo địa điểm mới
- [x] `PATCH /venues/:id` - Cập nhật địa điểm
- [x] `DELETE /venues/:id` - Xóa địa điểm
- [x] `POST /venues/:id/courts` - Thêm sân vào địa điểm
- [x] `DELETE /venues/:id/courts/:courtId` - Xóa sân khỏi địa điểm

## 6. Tournaments (`/tournaments`)
- [x] `GET /tournaments` - Lấy danh sách giải đấu
- [x] `GET /tournaments/:id` - Xem chi tiết giải đấu
- [x] `POST /tournaments` - Tạo giải đấu mới
- [x] `PATCH /tournaments/:id` - Cập nhật cấu hình giải đấu
- [x] `DELETE /tournaments/:id` - Xóa giải đấu
- [ ] `POST /tournaments/:id/participants` - Đăng ký đội tham gia (Chưa làm)
- [ ] `POST /tournaments/:id/generate-bracket` - Sinh nhánh đấu tự động (Chưa làm)

## 7. Matches (`/matches`)
- [x] `GET /matches` - Lấy danh sách trận đấu
- [x] `GET /matches/:id` - Lấy chi tiết trận đấu
- [x] `PATCH /matches/:id/score` - Cập nhật tỷ số trận đấu
- [x] `PATCH /matches/:id/status` - Cập nhật trạng thái (SCHEDULED, ONGOING, COMPLETED)

## 8. Rankings (`/rankings`)
- [x] `GET /rankings` - Lấy bảng xếp hạng theo điểm ELO
- [x] `POST /rankings/update-elo` - Kích hoạt tính lại điểm ELO thủ công

## 9. Payments & Payouts (Chưa làm - Phase 3)
- [ ] `POST /payments/create`
- [ ] `POST /payments/webhook`
- [ ] `POST /payouts/request`

## 10. Social, Chat & Notifications (Chưa làm - Phase 4)
- [ ] `POST /friendships/request`
- [ ] `POST /matches/:id/comments`
- [ ] `GET /notifications`
