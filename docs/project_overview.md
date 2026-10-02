# 🏟️ Tổng Quan Dự Án (Project Overview)

> **Tên dự án:** Quản Lý Giải Đấu (Tournament Management Platform)  
> **Tham khảo:** [Baseline.vn](https://baseline.vn/) — Nền tảng quản lý giải đấu Pickleball/Tennis hàng đầu Việt Nam & Đông Nam Á  
> **Trạng thái:** 🟡 Đang phát triển (In Development)

---

## 1. Tầm nhìn (Vision)

Xây dựng một **nền tảng mở** cho phép bất kỳ ai cũng có thể:
- Tự tạo **nhóm (community)**, rủ bạn bè tham gia.
- Tự tổ chức **giải đấu** vui chơi hoặc chuyên nghiệp — linh hoạt mọi thể thức.
- Theo dõi **tỷ số trực tiếp (Live Score)** và **xếp hạng ELO** theo từng môn thể thao.

Nền tảng kiếm tiền thông qua **hoa hồng phí tham gia giải** (ví dụ: 5% trên mỗi vé 30K) và **quảng cáo**.

---

## 2. Đối tượng người dùng (User Personas)

| Vai trò | Mô tả | Hành động chính |
|---|---|---|
| 🏃 **Người chơi (Player)** | Người trực tiếp tham gia thi đấu | Đăng ký giải, xem ELO, farm điểm, chat, kết bạn |
| 🏢 **Ban tổ chức (Organizer)** | Quản trị viên cộng đồng/câu lạc bộ | Tạo giải, nhập tỷ số, quản lý đội hình, rút tiền |
| 👀 **Người xem (Fan/Viewer)** | Người hâm mộ theo dõi kết quả | Xem live score, bình luận, react trận đấu |
| ⚙️ **Admin hệ thống (Platform Admin)** | Quản trị viên nền tảng | Duyệt community, quản lý thanh toán, đối soát |

---

## 3. Tính năng cốt lõi (Core Features)

### 🟢 Nhóm 1 — Cộng đồng & Tài khoản
- Đăng ký / Đăng nhập (Email + Password, JWT Authentication).
- Tạo hồ sơ cá nhân (Avatar, Bio, Số điện thoại).
- Tạo và tham gia **cộng đồng (Community)** — tương tự câu lạc bộ (Club).
- Phân quyền: Member, Moderator, Owner.

### 🟡 Nhóm 2 — Giải đấu & Trận đấu
- Tạo giải đấu đa thể thức (Round Robin, Single/Double Elimination).
- Đa môn thể thao: Pickleball, Tennis, Cầu lông...
- Xếp lịch, phân nhánh đấu (Bracket) tự động.
- Cập nhật tỷ số trận đấu **theo thời gian thực** (Live Score).
- Hệ thống dự bị: Ghi nhận chính xác ai ra sân để tính ELO.

### 🔴 Nhóm 3 — ELO & Xếp hạng
- Hệ thống ELO với **Tier** cụ thể: Low D → High D → C → B → Low A → High A.
- Farm ELO linh hoạt: Qua giải đấu HOẶC thi đấu cá nhân (Pick-up games).
- Lịch sử biến động điểm ELO theo biểu đồ.

### 🟣 Nhóm 4 — Thanh toán & Kinh doanh
- Thu phí tham gia giải (entry fee) qua cổng thanh toán (VNPay, MoMo, Bank Transfer).
- Nền tảng giữ lại hoa hồng (ví dụ 5%).
- Ban tổ chức yêu cầu rút tiền → Admin duyệt và chuyển khoản thủ công.

### ⚪ Nhóm 5 — Mạng xã hội & Tương tác
- Kết bạn, Chat 1-1 và nhóm.
- Bình luận trận đấu (nested comments), React ("High five").
- Thông báo đẩy (Push Notification).
- Quảng cáo banner (Ads System).

---

## 4. Kiến trúc hệ thống (High-Level Architecture)

```
┌────────────────┐     ┌────────────────┐     ┌─────────────────┐
│  Mobile App    │────▶│                │     │  PostgreSQL     │
│  (Flutter/RN)  │     │  Backend API   │────▶│  + PostGIS      │
└────────────────┘     │  (NestJS)      │     └─────────────────┘
                       │                │
┌────────────────┐     │  REST + WS     │     ┌─────────────────┐
│  Web Frontend  │────▶│                │────▶│  Redis          │
│  (Next.js)     │     └────────────────┘     │  (Cache/Queue)  │
└────────────────┘              │             └─────────────────┘
                                │
                       ┌────────▼────────┐
                       │  Cloudinary/S3  │
                       │  (Image Store)  │
                       └─────────────────┘
```

---

## 5. Tài liệu liên quan

| File | Mục đích |
|---|---|
| [database_schema.md](./database_schema.md) | Thiết kế toàn bộ cơ sở dữ liệu (SQL) |
| [architecture.md](./architecture.md) | Kiến trúc thư mục NestJS Modular Monolith |
| [plan.md](./plan.md) | Kế hoạch triển khai từng bước |
| [apicrud.md](./apicrud.md) | Chi tiết các API endpoints |
| [skills.md](./skills.md) | Công nghệ sử dụng & yêu cầu kỹ năng |
| [rules.md](./rules.md) | Quy tắc viết code & quy trình làm việc |
| [spec.md](./spec.md) | Quy cách kỹ thuật & tiêu chuẩn hệ thống |
