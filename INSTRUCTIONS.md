# QUY TẮC BẮT BUỘC — Dự Án Quản Lý Giải Đấu

> **ĐỌC FILE NÀY TRƯỚC KHI VIẾT BẤT KỲ DÒNG CODE NÀO.**
> Tài liệu chi tiết nằm trong thư mục `docs/`.

## CÔNG NGHỆ

- Backend: **NestJS** (>= 11.x) + **TypeScript** (>= 5.x, strict mode)
- ORM: **Drizzle ORM** (>= 0.45.x) — SQL-first, type-safe
- Database: **PostgreSQL** (>= 16.x) + PostGIS + uuid-ossp
- Auth: **Passport JWT** + **bcrypt** — Access Token 15 phút, Refresh Token 7 ngày
- Package manager: **pnpm**

## CẤM

- ❌ TypeORM, Prisma, Sequelize — Chỉ dùng **Drizzle ORM**
- ❌ File `.js` — Chỉ dùng **TypeScript `.ts`**
- ❌ Kiểu `any` — Phải type đầy đủ
- ❌ Hard Delete user/tournament — Chỉ dùng **Soft Delete** (cột `deleted_at`)
- ❌ Thao tác tiền không có Transaction — Payments/Payouts **PHẢI** bọc `db.transaction()`
- ❌ Update ELO không có Lock — **PHẢI** dùng `SELECT ... FOR UPDATE`

## BẮT BUỘC

- ✅ UUID cho tất cả Primary Key
- ✅ Mọi DTO phải có `class-validator` decorators + `@ApiProperty()` (Swagger)
- ✅ API prefix: `/api/v1/`
- ✅ Response format: `{ data, message, statusCode, meta }`
- ✅ Mọi POST/PATCH/DELETE phải có `JwtAuthGuard` (trừ `@Public()`)
- ✅ Mọi GET danh sách phải hỗ trợ pagination `?page=1&limit=10`
- ✅ Đặt file đúng cấu trúc: `src/modules/{name}/{name}.controller.ts`, `.service.ts`, `.module.ts`, `dto/`
- ✅ Schema Drizzle đặt tại: `src/database/schema/{name}.schema.ts`
- ✅ Migration qua `drizzle-kit generate` + `drizzle-kit push` — KHÔNG sửa DB tay

## NAMING

- Biến/hàm: `camelCase` — File/folder: `kebab-case` — Class: `PascalCase`
- Bảng DB: `snake_case` số nhiều — Cột DB: `snake_case`
- Hằng số: `UPPER_SNAKE_CASE`

## 3 ROLES

- `PLAYER` (mặc định) — xem giải, đăng ký, xem ELO
- `ORGANIZER` — tạo giải, nhập score, rút tiền
- `ADMIN` — duyệt community, quản lý payments, toàn quyền

## TÀI LIỆU THAM KHẢO (đọc thêm khi cần)

- `docs/database_schema.md` — SQL schema 36 bảng
- `docs/database_relationships.md` — Quan hệ giữa các bảng
- `docs/apicrud.md` — Danh sách API endpoints
- `docs/architecture.md` — Cấu trúc thư mục NestJS
- `docs/spec.md` — Quy cách kỹ thuật chi tiết
- `docs/plan.md` — Kế hoạch phát triển theo Phase
- `docs/skills.md` — 8 kỹ năng cốt lõi
- `docs/rules.md` — Quy tắc đầy đủ + Git workflow
