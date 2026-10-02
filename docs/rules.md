# ⚖️ Quy Tắc Dự Án (Rules)

> Tất cả thành viên (người hoặc AI Agent) tham gia dự án **BẮT BUỘC** phải tuân thủ các quy tắc dưới đây.  
> Vi phạm sẽ bị reject PR (Pull Request).

---

## 1. Quy tắc dành cho AI Agent 🤖

> **QUAN TRỌNG:** Khi nhận được yêu cầu viết code cho dự án này, AI Agent PHẢI đọc các file sau TRƯỚC KHI bắt đầu:

| File cần đọc | Lý do |
|---|---|
| `docs/skills.md` | Để biết chính xác công nghệ và phiên bản nào được phép sử dụng |
| `docs/spec.md` | Để biết quy cách kỹ thuật: format response, cách đặt tên, cách tổ chức file |
| `docs/architecture.md` | Để biết cấu trúc thư mục chuẩn, đặt file vào đúng chỗ |
| `docs/database_schema.md` | Để hiểu cấu trúc DB, quan hệ giữa các bảng |
| `docs/apicrud.md` | Để biết các API endpoints đã được thiết kế |
| `docs/rules.md` | File này — để tuân thủ quy tắc viết code |

### Yêu cầu bắt buộc cho AI:
- ❌ **KHÔNG** được dùng TypeORM, Prisma, Sequelize. Dự án này dùng **Drizzle ORM**.
- ❌ **KHÔNG** được dùng Express thuần. Dự án này dùng **NestJS**.
- ❌ **KHÔNG** được tạo file `.js`. Toàn bộ code phải là **TypeScript (`.ts`)**.
- ❌ **KHÔNG** được dùng `any` trong TypeScript. Phải type đầy đủ.
- ✅ **PHẢI** tuân theo cấu trúc thư mục trong `architecture.md`.
- ✅ **PHẢI** dùng UUID cho tất cả Primary Key.
- ✅ **PHẢI** viết DTO với `class-validator` decorators.
- ✅ **PHẢI** thêm `@ApiProperty()` cho mọi field trong DTO (Swagger).

---

## 2. Quy tắc Viết Code (Code Convention)

### Đặt tên (Naming)
| Loại | Quy tắc | Ví dụ |
|---|---|---|
| Biến, hàm, method | `camelCase` | `getUserById`, `matchScore` |
| Class, Interface, Type | `PascalCase` | `UsersService`, `CreateTournamentDto` |
| File, Folder | `kebab-case` (theo chuẩn NestJS) | `users.controller.ts`, `create-user.dto.ts` |
| Hằng số | `UPPER_SNAKE_CASE` | `MAX_RETRY_COUNT`, `JWT_EXPIRES_IN` |
| Bảng DB | `snake_case` (số nhiều) | `users`, `tournament_participants` |
| Cột DB | `snake_case` | `created_at`, `elo_points` |

### Format & Linting
- Dùng **Prettier** + **ESLint** (config mặc định của NestJS).
- Tab size: **2 spaces**.
- Dấu nháy đơn (`'`) cho string.
- Có dấu `;` cuối dòng.
- Không push code khi còn lỗi ESLint.

### Import Order
```typescript
// 1. NestJS / Node.js built-in
import { Controller, Get } from '@nestjs/common';

// 2. Thư viện bên thứ 3
import { eq } from 'drizzle-orm';

// 3. Module nội bộ dự án
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
```

---

## 3. Quy trình Git (Git Workflow)

### Branches
| Nhánh | Mục đích |
|---|---|
| `main` | Code Production — ổn định, đã test |
| `develop` | Code Staging — tích hợp các feature mới |
| `feature/*` | Phát triển tính năng mới |
| `bugfix/*` | Sửa lỗi |
| `hotfix/*` | Sửa lỗi khẩn cấp trên Production |

### Commit Message (Conventional Commits)
```
<type>(<scope>): <mô tả ngắn gọn>

Ví dụ:
feat(auth): add JWT refresh token endpoint
fix(matches): resolve race condition in score update
docs(readme): update installation guide
refactor(users): extract password hashing to utility
chore(deps): upgrade drizzle-orm to 0.45.2
```

**Các type được phép:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `style`.

### Pull Request (PR)
- Mỗi PR chỉ giải quyết **1 vấn đề** (1 feature hoặc 1 bugfix).
- Tiêu đề PR phải rõ ràng: `feat(tournaments): implement bracket generation algorithm`.
- PR phải pass hết ESLint + Unit Tests trước khi merge.
- Phải có ít nhất **1 reviewer** approve.

---

## 4. Quy tắc Database

- **KHÔNG BAO GIỜ Hard Delete** user hoặc tournament. Luôn dùng Soft Delete (cột `deleted_at`).
- Mọi query liên quan đến tiền (Payments, Payouts) **BẮT BUỘC** phải bọc trong **Database Transaction**.
- Khi cập nhật ELO, **BẮT BUỘC** dùng Pessimistic Lock (`SELECT ... FOR UPDATE`) để chống Race Condition.
- Tất cả thay đổi schema phải thông qua **Drizzle Migration** (`drizzle-kit generate`). Không được sửa DB bằng tay.

---

## 5. Quy tắc API

- Global prefix: `/api/v1/`.
- Response format thống nhất (xem chi tiết trong `spec.md`).
- Mọi endpoint POST/PATCH/DELETE phải có Authentication Guard (trừ khi đánh dấu `@Public()`).
- Mọi endpoint GET danh sách phải hỗ trợ Pagination (`?page=1&limit=10`).
