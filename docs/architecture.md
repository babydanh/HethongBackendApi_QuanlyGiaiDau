# 🏗️ NestJS Modular Monolith Architecture: Tournament Management Platform

Tài liệu này mô tả cấu trúc thư mục và kiến trúc hệ thống chuẩn cho dự án. Kiến trúc này được thiết kế theo hướng **Module hóa**, giúp dễ dàng bảo trì và có thể tách thành Microservices trong tương lai.

## 📂 Sơ đồ cấu trúc thư mục (Updated)

```text
my-modular-monolith/
├── docker-compose.yml         # Setup môi trường (Postgres, Redis, pgAdmin)
├── Dockerfile                 # Recipe build image cho NestJS App
├── Dockerfile.db              # Recipe build image cho Postgres + Extensions
├── package.json
├── src/
│   ├── main.ts                # Điểm khởi đầu: Cấu hình cổng, Swagger, Global Pipes
│   ├── app.module.ts          # "Nhạc trưởng": Nơi kết nối tất cả các Module lại
│   │
│   ├── common/                # 🛠️ VÙNG DÙNG CHUNG (Global Utilities)
│   │   ├── decorators/        # @CurrentUser, @Public, @Roles
│   │   ├── filters/           # Bắt và định dạng lỗi (HttpExceptionFilter)
│   │   ├── guards/            # Bảo vệ API (JwtAuthGuard, RolesGuard)
│   │   ├── interceptors/      # Biến đổi dữ liệu đầu ra, Log thời gian Request
│   │   ├── pipes/             # Xử lý/ép kiểu dữ liệu (ParseIntPipe, ValidationPipe)
│   │   ├── constants/         # Lưu các biến hằng số, thông báo lỗi chuẩn
│   │   └── utils/             # Hàm bổ trợ (Crypto, Date formatter, String helper)
│   │
│   ├── config/                # ⚙️ CẤU HÌNH HỆ THỐNG
│   │   ├── database.config.ts # Cấu hình TypeORM/Database
│   │   ├── auth.config.ts     # Cấu hình JWT, Token thời hạn
│   │   └── env.validation.ts  # Schema để check file .env khi khởi động
│   │
│   ├── providers/             # 🔌 KẾT NỐI BÊN THỨ 3 (Shared Infrastructure)
│   │   ├── mail/              # Dịch vụ gửi Email (Nodemailer/SendGrid)
│   │   ├── storage/           # Dịch vụ lưu ảnh (Cloudinary/S3)
│   │   └── redis/             # Caching hoặc Message Queue
│   │
│   ├── modules/               # 🧠 BỘ NÃO (Feature Modules)
│   │   ├── users/             # Quản lý người dùng
│   │   │   ├── dto/           # CreateUserDto, UpdateUserDto
│   │   │   ├── entities/      # User.entity.ts (Mapping bảng DB)
│   │   │   ├── users.controller.ts
│   │   │   ├── users.service.ts
│   │   │   ├── users.repository.ts
│   │   │   └── users.module.ts
│   │   │
│   │   ├── tournaments/       # Logic quản lý giải đấu chuyên sâu
│   │   │   ├── dto/
│   │   │   ├── entities/
│   │   │   ├── tournaments.controller.ts
│   │   │   ├── tournaments.service.ts
│   │   │   ├── tournaments.repository.ts
│   │   │   └── tournaments.module.ts
│   │   │
│   │   └── notifications/     # Event-Driven: Tự động gửi mail/push thông báo
│   │       ├── listeners/     # Lắng nghe sự kiện (TournamentCreatedEvent)
│   │       ├── notifications.service.ts
│   │       └── notifications.module.ts
│   │
│   └── database/              # 🗄️ QUẢN LÝ DỮ LIỆU GỐC
│       ├── migrations/        # Lịch sử thay đổi bảng (Không lo mất dữ liệu)
│       └── seeds/             # Tạo dữ liệu ảo để test (Mock data)
└── test/                      # 🧪 KIỂM THỬ (E2E Testing)
```

---

## 📝 Phân tích tác dụng từng Folder

### 1. `common/` (Cơ sở hạ tầng dùng chung)
*   **Filters**: Khi code của bạn bị lỗi, thay vì trả về một lỗi lạ lẫm, Filter sẽ "bắt" nó lại và trả về định dạng JSON thống nhất (VD: `{ status, message, timestamp }`).
*   **Interceptors**: Cực kỳ hữu ích để "lọc" bớt dữ liệu nhạy cảm (như mật khẩu) trước khi trả về cho client.
*   **Guards**: Lá chắn bảo vệ. Check xem người dùng đã đăng nhập chưa, hoặc có quyền Admin để vào route này không.

### 2. `modules/` (Chia để trị)
*   **Logic Độc lập**: Mỗi module nên hoạt động như một ứng dụng nhỏ. Module `Tournaments` không nên can thiệp trực tiếp vào bảng `Users`, mà phải thông qua `UsersService`. Điều này giúp hệ thống cực kỳ ít lỗi dây chuyền.
*   **Repository Pattern**: Tách biệt việc "xử lý logic" (Service) và việc "truy vấn dữ liệu" (Repository). Giúp code service ngắn gọn, dễ đọc.

### 3. `providers/` (Cổng kết nối ngoại vi)
*   Tập trung các dịch vụ như Cloudinary hay Mailer vào đây để các Module khác chỉ việc "mượn" dùng, không cần cấu hình lại nhiều lần.

### 4. `database/migrations/` (Quan trọng cho Teamwork)
*   Thay vì gửi file `.sql` cho nhau, bạn dùng Migrations. Khi một người thêm cột mới vào DB, những người khác chỉ cần chạy một lệnh là DB của họ tự cập nhật theo y hệt.

---

## 🚀 Luồng đi của một Request (Standard Flow)
1. **Client** gửi request -> **Middleware** (Check log)
2. -> **Guards** (Check Token/Quyền)
3. -> **Interceptors** (Bắt đầu đếm thời gian xử lý)
4. -> **Pipes** (Validate & Ép kiểu dữ liệu - VD: String sang Number)
5. -> **Controller** (Điều hướng)
6. -> **Service** (Xử lý logic nghiệp vụ)
7. -> **Repository** (Lấy dữ liệu từ DB)
8. -> **Service** trả kết quả -> **Controller**
9. -> **Interceptors** (Format lại dữ liệu JSON lần cuối)
10. -> **Client** nhận kết quả.

---
> [!TIP]
> **Điểm còn thiếu:** Với dự án Quản Lý Giải Đấu, sau này chúng ta sẽ cần thêm một thư mục `events/` hoặc dùng trực tiếp trong `modules/` để xử lý **WebSockets** (cho Cập nhật Live Score/Chat real-time) và **Task Scheduling** (để tự động chốt danh sách hoặc cập nhật trạng thái giải đấu).
