# Bản Đặc tả Kỹ thuật API (API Technical Specification & UI Mapping)

Tài liệu này cung cấp **đặc tả kỹ thuật sâu (Technical Spec)** cho các API cốt lõi. Bất kỳ lập trình viên Frontend hay Backend nào khi tham chiếu tài liệu này phải tuân thủ đúng định dạng DTO, HTTP Status Code, và cơ chế Authorization.

---

## 1. Màn hình Xác Thực (Auth)

### 1.1. API Đăng ký tài khoản (Register)
- **UI Element:** Form Đăng ký (Email, Mật khẩu, Tên).
- **Endpoint:** `POST /api/v1/auth/register`
- **Guard (Phân quyền):** `Public` (Không yêu cầu Token).
- **Request Payload (RegisterDto):**
  ```json
  {
    "email": "string, IsEmail()",
    "password": "string, MinLength(8), MaxLength(32)",
    "fullName": "string, MinLength(2), MaxLength(100)"
  }
  ```
- **Responses:**
  - `201 Created`: Thành công. Trả về `{ "data": { "id": "uuid", "email": "..." }, "message": "Đăng ký thành công" }`.
  - `400 Bad Request`: Validation lỗi (sai định dạng email, password quá ngắn).
  - `409 Conflict`: Email đã tồn tại trong hệ thống.

### 1.2. API Đăng nhập (Login)
- **Endpoint:** `POST /api/v1/auth/login`
- **Guard:** `Public`.
- **Request Payload (LoginDto):**
  ```json
  {
    "email": "string, IsEmail()",
    "password": "string, IsNotEmpty()"
  }
  ```
- **Responses:**
  - `200 OK`: Thành công. Trả về `{ "data": { "accessToken": "jwt...", "refreshToken": "jwt..." } }`.
  - `401 Unauthorized`: Sai email hoặc mật khẩu.

---

## 2. Hệ thống Giải Đấu (Tournaments)

### 2.1. API Lấy chi tiết Giải đấu (Tournament Dashboard)
- **UI Element:** Trang mô tả chi tiết giải đấu.
- **Endpoint:** `GET /api/v1/tournaments/:id`
- **Guard:** `Public` (Ai cũng xem được).
- **Responses:**
  - `200 OK`: Trả về toàn bộ thông tin (Tên, cấu hình, lệ phí, `registrationEndDate`, `maxParticipants`).
  - `404 Not Found`: Không tìm thấy ID giải đấu.

### 2.2. API Đăng ký Tham gia Giải (Register Team)
- **UI Element:** Form chọn thành viên đội, xác nhận lệ phí.
- **Endpoint:** `POST /api/v1/tournaments/:id/participants`
- **Guard:** `JwtAuthGuard` (Bắt buộc đăng nhập).
- **Quy tắc Nghiệp vụ (Business Rules):**
  1. Kiểm tra `registrationStartDate` <= NOW <= `registrationEndDate`. Ném `400` nếu ngoài thời hạn.
  2. Đếm số đội trong `tournament_participants`. Ném `409 Conflict` nếu `>= maxParticipants`.
  3. Bọc Database Transaction: Insert vào `tournament_participants` và bảng `payments` cùng lúc.
- **Request Payload (RegisterParticipantDto):**
  ```json
  {
    "teamName": "string, MinLength(3), MaxLength(100)",
    "rosterUserIds": ["uuid", "uuid"] // ID của các thành viên trong đội
  }
  ```
- **Responses:**
  - `201 Created`: Trả về `{ "data": { "participantId": "uuid", "paymentId": "uuid" } }`.
  - `400 Bad Request`: Hết hạn đăng ký hoặc Validation lỗi.
  - `409 Conflict`: Giải đã đầy đội.
  - `403 Forbidden`: Người dùng bị cấm tham gia.

---

## 3. Hệ thống Thanh toán (Payments)

### 3.1. API Tạo Link Thanh toán VNPay
- **UI Element:** Nút "Thanh toán lệ phí".
- **Endpoint:** `POST /api/v1/payments/create-link`
- **Guard:** `JwtAuthGuard`.
- **Request Payload (CreatePaymentLinkDto):**
  ```json
  {
    "paymentId": "uuid, IsUUID()",
    "returnUrl": "string, IsUrl()" // URL để VNPay redirect về Frontend sau khi thanh toán
  }
  ```
- **Responses:**
  - `200 OK`: Trả về `{ "data": { "checkoutUrl": "https://sandbox.vnpayment.vn/..." } }`.
  - `400 Bad Request`: Payment này đã được thanh toán rồi (status = SUCCESS).

### 3.2. API Webhook VNPay (Server-to-Server)
- **Endpoint:** `POST /api/v1/payments/webhook`
- **Guard:** `Public` (Nhưng có cơ chế Verify Signature HMAC SHA512).
- **Quy tắc Nghiệp vụ:**
  - Xác minh chuỗi Hash hợp lệ.
  - `db.transaction()`: Cập nhật Payment, Cập nhật Participant, Ghi Audit Log.
- **Responses:**
  - `200 OK`: VNPay yêu cầu trả về chuẩn `{ "RspCode": "00", "Message": "Confirm Success" }`.

---

## 4. Hệ thống Trận đấu & Live Score (WebSocket)

### 4.1. Khởi tạo kết nối & Vào phòng
- **Namespace:** `wss://domain.com/matches`
- **Authentication:** Gửi Token qua query `?token=...` hoặc Header Auth.
- **Client Emit Event `joinRoom`:**
  - Payload: `{ "matchId": "uuid" }`
  - Server sẽ gom các Client này vào một Socket.io Room để gửi Real-time riêng biệt.

### 4.2. API Cập nhật Điểm số (Live Score)
- **UI Element:** Bảng điều khiển trọng tài (Nút +1 điểm).
- **HTTP Endpoint:** `PATCH /api/v1/matches/:id/score`
- **Guard:** `JwtAuthGuard` + `RolesGuard` (Chỉ Trọng tài hoặc Admin giải).
- **Request Payload (UpdateMatchScoreDto):**
  ```json
  {
    "scoreDetails": { "p1_score": 15, "p2_score": 14 },
    "p1SetsWon": 1,
    "p2SetsWon": 0
  }
  ```
- **Logic Backend:**
  - Lưu Database.
  - Gọi Socket Gateway: `server.to(matchId).emit('score:update', payload)`.
- **Responses:** `200 OK`. Client khán giả tự động nhảy điểm nhờ Socket.

### 4.3. API Chốt Trận Đấu (Complete Match)
- **UI Element:** Nút "Kết thúc trận".
- **HTTP Endpoint:** `PATCH /api/v1/matches/:id/status`
- **Request Payload:**
  ```json
  {
    "status": "COMPLETED",
    "winnerId": "uuid"
  }
  ```
- **Quy tắc Nghiệp vụ (Giao dịch khắt khe):**
  - Mở `db.transaction(tx)`.
  - Cập nhật Match hiện tại (Lưu `scoreConfirmedBy`, `scoreConfirmedAt`).
  - Ghi AuditLog.
  - Đẩy Winner lên `next_match_id`. Đẩy Loser xuống `loser_next_match_id` (Ngoại trừ họ là nhánh thua cuối).
  - Gửi Job vào Queue (BullMQ) để kích hoạt hàm tính ELO ngầm.
