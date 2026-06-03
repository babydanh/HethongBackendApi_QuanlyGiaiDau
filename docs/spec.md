# 📐 Quy Cách Kỹ Thuật (Technical Specification)

> File này quy định **chi tiết kỹ thuật** mà code phải tuân theo.  
> AI Agent và Developer: Đọc file này khi cần biết cách triển khai cụ thể.

---

## 1. API Response Format

Tất cả API phải trả về response theo format thống nhất (xử lý bởi `TransformInterceptor`):

### Thành công (Success)
```json
{
  "statusCode": 200,
  "message": "Lấy danh sách thành công",
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 150,
    "totalPages": 15
  }
}
```

### Lỗi (Error)
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "details": [
    { "field": "email", "message": "Email không hợp lệ" }
  ],
  "timestamp": "2026-06-03T09:00:00.000Z",
  "path": "/api/v1/users"
}
```

---

## 2. Authentication & Authorization

### JWT Token Structure
```
Access Token: Thời hạn 15 phút
Refresh Token: Thời hạn 7 ngày, lưu trong bảng `sessions`
```

### Token Payload
```json
{
  "sub": "uuid-of-user",
  "email": "user@example.com",
  "roles": ["PLAYER", "ORGANIZER"],
  "iat": 1717398000,
  "exp": 1717398900
}
```

### Phân quyền (Roles)
| Role | Mô tả | Quyền |
|---|---|---|
| `PLAYER` | Người chơi (mặc định khi đăng ký) | Xem giải, đăng ký, xem ELO |
| `ORGANIZER` | Ban tổ chức (Owner/Mod của Community) | Tạo giải, nhập score, rút tiền |
| `ADMIN` | Quản trị viên hệ thống | Duyệt community, quản lý payments, toàn quyền |

---

## 3. Cấu trúc file trong mỗi Module

Mỗi feature module phải tuân theo cấu trúc sau:

```
src/modules/tournaments/
├── dto/
│   ├── create-tournament.dto.ts    # Input validation cho POST
│   ├── update-tournament.dto.ts    # Input validation cho PATCH
│   └── query-tournament.dto.ts     # Query params (pagination, filter)
├── entities/                        # (Nếu cần type riêng ngoài Drizzle schema)
├── tournaments.controller.ts        # Route handlers
├── tournaments.service.ts           # Business logic
├── tournaments.repository.ts        # Database queries (Drizzle)
├── tournaments.module.ts            # NestJS Module definition
└── tournaments.controller.spec.ts   # Unit tests
```

---

## 4. Drizzle ORM Schema Convention

### Đặt tên file schema
```
src/database/schema/
├── users.schema.ts
├── tournaments.schema.ts
├── matches.schema.ts
├── payments.schema.ts
├── social.schema.ts          # friendships, chat, reactions
├── notifications.schema.ts
├── advertisements.schema.ts
└── index.ts                  # Re-export tất cả
```

### Ví dụ Schema
```typescript
import { pgTable, uuid, varchar, timestamp, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
```

---

## 5. Pagination Convention

Tất cả API GET danh sách phải hỗ trợ query params:

| Param | Type | Default | Mô tả |
|---|---|---|---|
| `page` | number | 1 | Trang hiện tại |
| `limit` | number | 10 | Số item mỗi trang (max: 100) |
| `search` | string | — | Tìm kiếm theo tên/email |
| `sort` | string | `created_at` | Cột sắp xếp |
| `order` | `asc` \| `desc` | `desc` | Thứ tự sắp xếp |

---

## 6. Environment Variables

File `.env` phải chứa tối thiểu:

```env
# Server
PORT=3000
NODE_ENV=development

# Database (PostgreSQL)
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_password
DB_DATABASE=tournament_db

# JWT
JWT_ACCESS_SECRET=your-access-secret-key
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=your-refresh-secret-key
JWT_REFRESH_EXPIRES_IN=7d

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Payment Gateway
VNPAY_TMN_CODE=your-tmn-code
VNPAY_HASH_SECRET=your-hash-secret
VNPAY_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
```

---

## 7. Error Codes Convention

| HTTP Code | Khi nào dùng |
|---|---|
| `200` | GET thành công, PATCH thành công |
| `201` | POST tạo mới thành công |
| `204` | DELETE thành công (no content) |
| `400` | Validation error, Bad request |
| `401` | Chưa đăng nhập (missing/invalid token) |
| `403` | Không có quyền (forbidden) |
| `404` | Resource không tồn tại |
| `409` | Conflict (email đã tồn tại, đã đăng ký giải rồi) |
| `422` | Unprocessable Entity (logic lỗi: giải đã kết thúc không thể đăng ký) |
| `500` | Internal Server Error |

---

## 8. Testing Convention

- Mỗi module phải có ít nhất 1 file `.spec.ts` cho Controller.
- Test phải cover: Happy path + Edge case + Error case.
- Chạy test: `pnpm test` (unit) và `pnpm test:e2e` (integration).
