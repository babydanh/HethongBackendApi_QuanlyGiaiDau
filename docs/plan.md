# 📋 Kế Hoạch Phát Triển (Development Plan)

> Tài liệu này mô tả **từng bước cụ thể** để xây dựng nền tảng từ số 0.  
> Mỗi Phase được chia nhỏ thành các Task rõ ràng, có thể track tiến độ.

---

## Phase 0: Thiết lập Dự án & Tài liệu ✅
**Mục tiêu:** Xong nền móng, ai mới vào cũng hiểu ngay phải làm gì.

- [x] Khởi tạo NestJS project (`@nestjs/cli`).
- [x] Cài đặt dependencies cốt lõi: `drizzle-orm`, `drizzle-kit`, `pg`.
- [x] Thiết kế Database Schema SQL hoàn chỉnh (36 bảng, 9 tầng nghiệp vụ).
- [x] Viết tài liệu: `project_overview.md`, `architecture.md`, `plan.md`, `apicrud.md`.
- [x] Viết quy tắc: `rules.md`, `skills.md`, `spec.md`.

---

## Phase 1: Backend Foundation (Nền móng) ✅
**Mục tiêu:** Có một Backend chạy được, kết nối DB, có Auth, có Swagger.

### 1.1 Cấu hình dự án ✅
- [x] Tạo file `.env` + `.env.example` (DB_HOST, DB_PORT, JWT_SECRET...).
- [x] Cấu hình `drizzle.config.ts` kết nối PostgreSQL.
- [x] Tạo Drizzle Schema (`src/database/schema/`) cho toàn bộ 36 bảng.
- [ ] Chạy `drizzle-kit generate` + `drizzle-kit push` tạo bảng trong DB.

### 1.2 Common / Shared Layer ✅
- [x] Tạo `HttpExceptionFilter` (bắt lỗi chuẩn JSON).
- [x] Tạo `TransformInterceptor` (response format: `{ data, message, statusCode }`).
- [x] Tạo `ValidationPipe` global (auto validate DTO).
- [x] Tạo constants: Error messages, Status enums.

### 1.3 Auth Module (Xác thực) ✅
- [x] `POST /auth/register` — Đăng ký tài khoản (email + password hash bcrypt).
- [x] `POST /auth/login` — Đăng nhập → trả về Access Token (JWT) + Refresh Token.
- [x] `POST /auth/refresh` — Làm mới Access Token bằng Refresh Token.
- [x] `POST /auth/logout` — Thu hồi (revoke) session.
- [x] Tạo `JwtAuthGuard`, `RolesGuard`, `@CurrentUser()` decorator.

### 1.4 Users Module (Người dùng) ✅
- [x] CRUD User + Profile (theo `apicrud.md`).
- [x] API đổi mật khẩu.
- [x] Soft-delete user (cột `deleted_at`).

### 1.5 API Docs ✅
- [x] Cấu hình Scalar API Reference tại `/api/docs` (thay thế Swagger UI).
- [x] Mọi DTO đều có `@ApiProperty()` decorator.

### 1.6 OAuth 2.0 Multi-Provider ✅
- [x] Thêm bảng `auth_providers` vào Drizzle schema.
- [x] Sửa `passwordHash` cho phép NULL (user OAuth không cần password).
- [x] Tạo `google.strategy.ts` + routes callback.
- [x] Logic findOrCreate user + link/unlink provider.
- [x] Xem chi tiết: `docs/oauth2-plan.md`.

---

## Phase 2: Core Business Modules (Nghiệp vụ lõi) 🧠
**Mục tiêu:** Hoàn thành luồng chính: Tạo giải → Đăng ký → Thi đấu → Tính ELO.

### 2.1 Categories Module (Đa môn thể thao) ✅
- [x] CRUD Categories (Pickleball, Tennis, Badminton...).
- [x] Seed data mặc định khi khởi tạo DB.

### 2.2 Communities Module (Cộng đồng) ✅
- [x] CRUD Community + Members.
- [x] Luồng duyệt Community: `PENDING → APPROVED / REJECTED`.
- [x] Phân quyền: Owner, Moderator, Member.
- [x] Tích hợp PostGIS: Query "Tìm community gần tôi".

### 2.3 Tournaments Module (Giải đấu) ⭐
- [x] CRUD Tournament (gắn với Community + Category).
- [x] Cấu hình thể thức thi đấu (`sport_rules`, `tournament_config` JSONB).
- [x] Quản lý Stages (Round Robin, Elimination) và Groups.
- [x] Đăng ký đội (`tournament_participants` + `tournament_rosters`).
- [x] Thuật toán sinh Bracket tự động (Single/Double Elimination).

### 2.4 Matches Module (Trận đấu & Live Score) ⭐
- [x] CRUD Match (nằm trong 1 Group thuộc 1 Stage).
- [x] API cập nhật tỷ số ACID: Cột cứng `p1_sets_won`, `p2_sets_won` + JSONB `score_details`.
- [x] Ghi nhận ai thực sự ra sân (`match_players`).
- [x] Khi match `COMPLETED` → Trigger Event cập nhật `group_standings` + tính ELO.
- [x] (Giai đoạn sau) WebSocket Gateway: Broadcast live score real-time.

### 2.5 ELO & Ratings Module (Xếp hạng)
- [x] Bảng `elo_tiers`: Seed các Tier (Low D, High D, C, B, Low A, High A).
- [x] Logic tính ELO (K-factor algorithm) khi match hoàn thành.
- [x] Dùng Database Transaction (Pessimistic Lock) chống Race Condition.
- [x] Tự động cập nhật `tier_id` trong `user_ranks` khi ELO thay đổi.
- [x] API xem Leaderboard + Lịch sử ELO cá nhân.

---

## Phase 3: Monetization & Payments (Kinh doanh) 💰 ✅
**Mục tiêu:** Thu phí giải đấu, cắt hoa hồng, trả tiền cho BTC.

### 3.1 Payments Module ✅
- [x] API tạo đơn thanh toán khi user đăng ký giải có phí.
- [x] Tích hợp cổng thanh toán (VNPay hoặc MoMo Webhook).
- [x] Webhook callback → Transaction ACID: Update `payments.status` + `tournament_participants.is_paid`.
- [x] Xử lý idempotency (chống webhook gọi đúp).

### 3.2 Payouts Module (Rút tiền cho BTC) ✅
- [x] API BTC yêu cầu rút tiền (tự tính `amount_requested = total - platform_fee`).
- [x] Admin Dashboard: Xem danh sách lệnh rút, duyệt, upload ảnh bill chuyển khoản.
- [x] Audit Log cho mọi thay đổi trạng thái thanh toán.

### 3.3 Advertisements Module
- [ ] CRUD quảng cáo (banner image, target URL, placement slot).
- [ ] API đếm views/clicks.

---

## Phase 4: Social & Notifications (Mạng xã hội) 💬 ✅
**Mục tiêu:** Tăng tương tác, giữ chân người dùng.

### 4.1 Social Module ✅
- [x] Friendships: Gửi lời mời kết bạn, chấp nhận/từ chối.
- [ ] Match Comments: Bình luận lồng nhau (nested/threaded comments).
- [ ] Match Reactions: React trận đấu ("High five", Like...).

### 4.2 Chat Module (WebSocket) ✅
- [x] Chat 1-1 (Direct Message) và Chat nhóm (Group Chat).
- [x] Lưu tin nhắn vào DB, đánh dấu đã đọc (`is_read`).
- [x] WebSocket Gateway cho real-time messaging.

### 4.3 Notifications Module ✅
- [x] Tạo notification khi: Có kết quả trận đấu mới, bạn bè gửi tin nhắn, giải đấu sắp bắt đầu.
- [x] API đánh dấu đã đọc (single + read-all).
- [x] (Tương lai) Push Notification cho Mobile App (Firebase Cloud Messaging).

---

## Phase 5: Mobile App & Polish (Hoàn thiện) 📱
**Mục tiêu:** Ship ứng dụng di động, tối ưu hệ thống.

### 5.1 Mobile App
- [ ] Khởi tạo project (Flutter hoặc React Native).
- [ ] Tích hợp toàn bộ API Backend đã xây dựng.
- [ ] UI/UX tối ưu cho Player: Xem giải, đăng ký, xem live score, check ELO.

### 5.2 Performance & DevOps
- [ ] Redis caching cho Leaderboard, Live Score.
- [ ] Docker Compose (Postgres + Redis + NestJS).
- [ ] CI/CD Pipeline (GitHub Actions).
- [ ] Monitoring & Logging (PM2, hoặc tương đương).

---

> **Nguyên tắc:** Luôn hoàn thành Phase N trước khi bắt đầu Phase N+1. Mỗi Phase kết thúc phải có Test và Swagger docs đầy đủ.
