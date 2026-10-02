# 🤖 PROMPT — Tiếp tục xây dựng Backend API Quản Lý Giải Đấu (Phase 2 trở đi)

> **Mục đích:** Copy toàn bộ prompt này vào Gemini / Claude / Cursor AI để nó tiếp tục triển khai backend.
> **Cập nhật lần cuối:** 2026-06-04

---

## PROMPT BẮT ĐẦU TỪ ĐÂY ⬇️

---

Bạn là một **Senior Backend Engineer** chuyên NestJS + TypeScript + Drizzle ORM. Nhiệm vụ của bạn là **tiếp tục triển khai** Backend API cho dự án **Quản Lý Giải Đấu (Tournament Management Platform)**.

---

## 📂 TRẠNG THÁI HIỆN TẠI CỦA DỰ ÁN

### Đã hoàn thành ✅
- **Phase 0:** Thiết lập dự án, tài liệu, database schema (36 bảng).
- **Phase 1:** Nền móng backend.
  - Config: `ConfigModule`, `DatabaseModule` (Drizzle + node-postgres).
  - Common layer: `HttpExceptionFilter`, `TransformInterceptor`, `ValidationPipe` global.
  - Guards & Decorators: `JwtAuthGuard` (global), `RolesGuard`, `@Public()`, `@CurrentUser()`, `@Roles()`.
  - Auth Module: Register, Login, Refresh Token, Logout — JWT Access + Refresh.
  - Users Module: CRUD user + profile, đổi mật khẩu, soft delete.
  - Scalar API Reference tại `/api/docs` (thay thế Swagger UI).
- **Database schema Drizzle:** Đã tạo đầy đủ cho 36 bảng trong `src/database/schema/`.
- **Build & Lint:** `pnpm build` và `pnpm lint` pass hoàn toàn.
- **Server chạy thành công** trên `http://localhost:3000/api/v1`.

### Chưa làm ❌ (Nhiệm vụ của bạn)
- **Phase 2:** Categories, Communities, Tournaments, Matches, ELO & Rankings.
- **OAuth 2.0:** Bảng `auth_providers`, Google/Facebook login (xem `docs/oauth2-plan.md`).
- **Phase 3:** Payments, Payouts, Advertisements.
- **Phase 4:** Social (Friendships, Chat, Comments, Reactions), Notifications.

---

## 📋 TÀI LIỆU BẮT BUỘC PHẢI ĐỌC TRƯỚC KHI CODE

> ⚠️ **ĐỌC HẾT các file dưới đây TRƯỚC KHI viết bất kỳ dòng code nào.** Đây là luật sắt.

| File | Nội dung |
|------|----------|
| `docs/rules.md` | Quy tắc viết code, naming convention, git workflow |
| `docs/spec.md` | Response format, JWT structure, pagination, error codes |
| `docs/architecture.md` | Cấu trúc thư mục NestJS modular monolith |
| `docs/database_schema.md` | Toàn bộ 36 bảng SQL (Drizzle schema đã có sẵn) |
| `docs/database_relationships.md` | Quan hệ giữa các bảng |
| `docs/apicrud.md` | API endpoints đã thiết kế cho từng module |
| `docs/plan.md` | Kế hoạch phát triển theo phase |
| `docs/skills.md` | Tech stack và công nghệ bắt buộc |
| `docs/oauth2-plan.md` | Kế hoạch OAuth 2.0 multi-provider |

---

## 🚫 QUY TẮC TUYỆT ĐỐI

1. **ORM:** Chỉ dùng **Drizzle ORM**. KHÔNG Prisma, KHÔNG TypeORM, KHÔNG Sequelize.
2. **TypeScript strict:** KHÔNG dùng `any`. Type đầy đủ, dùng Generics khi cần.
3. **File naming:** `kebab-case` cho files (`create-tournament.dto.ts`), `PascalCase` cho class, `camelCase` cho biến/hàm.
4. **Soft delete:** KHÔNG BAO GIỜ hard delete user hoặc tournament. Dùng cột `deleted_at`.
5. **Transaction:** Mọi thao tác liên quan tới tiền (payments, payouts) PHẢI bọc trong `db.transaction()`.
6. **ELO update:** PHẢI dùng Pessimistic Lock (`SELECT ... FOR UPDATE`) chống race condition.
7. **Response format:** Tuân thủ `{ statusCode, message, data, meta }` (đã có `TransformInterceptor`).
8. **DTO:** Mọi input PHẢI có DTO với `class-validator` + `@ApiProperty()` cho Swagger.
9. **UUID:** Tất cả Primary Key là UUID.
10. **Import order:** NestJS/Node → Thư viện ngoài → Module nội bộ.

---

## 🏗️ CẤU TRÚC MỖI MODULE MỚI

Khi tạo module mới, **BẮT BUỘC** theo cấu trúc này:

```
src/modules/<tên-module>/
├── dto/
│   ├── create-<tên>.dto.ts      # Validation cho POST
│   ├── update-<tên>.dto.ts      # Validation cho PATCH (PartialType)
│   └── query-<tên>.dto.ts       # Query params: page, limit, search, sort, order
├── <tên>.controller.ts           # Route handlers, Swagger decorators
├── <tên>.service.ts              # Business logic (KHÔNG chứa SQL)
├── <tên>.repository.ts           # Database queries (Drizzle ORM only)
└── <tên>.module.ts               # NestJS module definition
```

### Mẫu chuẩn cho Controller:
```typescript
@ApiTags('<tên-module>')
@Controller('<tên-module>')
export class XxxController {
  constructor(private readonly xxxService: XxxService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách' })
  async findAll(@Query() query: QueryXxxDto) { ... }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết theo ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) { ... }

  @Post()
  @ApiOperation({ summary: 'Tạo mới' })
  async create(@Body() dto: CreateXxxDto, @CurrentUser() user) { ... }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateXxxDto) { ... }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Xóa (soft delete)' })
  async remove(@Param('id', ParseUUIDPipe) id: string) { ... }
}
```

### Mẫu chuẩn cho Repository:
```typescript
@Injectable()
export class XxxRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findAll(query: QueryXxxDto) {
    // Drizzle select + where + pagination
  }

  async findById(id: string) {
    const result = await this.db.select().from(schema.xxx).where(eq(schema.xxx.id, id)).limit(1);
    return result[0];
  }

  async create(data: typeof schema.xxx.$inferInsert) {
    const [record] = await this.db.insert(schema.xxx).values(data).returning();
    return record;
  }

  async update(id: string, data: Partial<typeof schema.xxx.$inferInsert>) {
    const [updated] = await this.db.update(schema.xxx).set(data).where(eq(schema.xxx.id, id)).returning();
    return updated;
  }

  async softDelete(id: string) {
    return this.update(id, { deletedAt: new Date() });
  }
}
```

---

## 📌 THỨ TỰ TRIỂN KHAI (Ưu tiên)

### PHASE 2A — Categories & Communities (Nền tảng cho Giải đấu)

**Module 1: Categories** (ĐÃ HOÀN THÀNH ✅)
- Bảng: `categories`, `elo_tiers`
- CRUD Categories (Pickleball, Tennis, Cầu lông).
- CRUD Elo Tiers (Low D, High D, C, B, Low A, High A).
- Seed data mặc định (tạo file `src/database/seeds/categories.seed.ts`).

**Module 2: Communities** (ĐÃ HOÀN THÀNH ✅)
- Bảng: `communities`, `community_members`, `community_sports`
- CRUD Community (tạo, sửa, xem danh sách, xem chi tiết).
- Luồng duyệt: PENDING → APPROVED / REJECTED (chỉ ADMIN mới duyệt).
- Thành viên: Thêm/xóa member, phân quyền OWNER/MODERATOR/MEMBER.
- Sub-routes: `POST /communities/:id/members`, `DELETE /communities/:id/members/:userId`.
- Community Sports: Liên kết community với categories (môn thể thao).

**Module 3: Venues**
- Bảng: `tournament_venues`, `venue_courts`
- CRUD Venues (tên sân, địa chỉ, ảnh).
- CRUD Courts thuộc venue.

### PHASE 2B — Tournaments & Matches (Core business)

**Module 4: Tournaments** ⭐
- Bảng: `tournaments`, `tournament_stages`, `tournament_groups`, `tournament_participants`, `tournament_rosters`
- CRUD Tournament (gắn với community + category).
- Quản lý Stages, Groups.
- Đăng ký đội (participants + rosters).
- **Thuật toán sinh Bracket** (Single Elimination, Double Elimination, Round Robin).
- Chuyển trạng thái: UPCOMING → ONGOING → COMPLETED → CANCELLED.

**Module 5: Matches** ⭐
- Bảng: `matches`, `match_players`, `match_disputes`, `group_standings`
- CRUD Match (nằm trong group/stage).
- **API cập nhật tỷ số** (ACID): Cập nhật `p1_sets_won`, `p2_sets_won`, `score_details` (JSONB).
- Ghi nhận match_players (ai thực sự ra sân).
- Cập nhật group_standings khi match hoàn thành (Round Robin).
- **Khi match COMPLETED → trigger tính ELO** (Event-Driven hoặc gọi trực tiếp).

**Module 6: ELO & Rankings**
- Bảng: `user_ranks`, `elo_history_logs`
- **Logic tính ELO (K-factor algorithm):**
  ```
  expected = 1 / (1 + 10^((opponent_elo - player_elo) / 400))
  new_elo = old_elo + K * (actual - expected)
  ```
- Pessimistic Lock khi update ELO (`SELECT ... FOR UPDATE`).
- Auto-update tier khi ELO vượt ngưỡng.
- API Leaderboard: `GET /rankings?categoryId=xxx&page=1&limit=20`.
- API Lịch sử ELO cá nhân: `GET /rankings/:userId?categoryId=xxx`.

### PHASE 2C — OAuth 2.0

**Xem chi tiết tại `docs/oauth2-plan.md`.**
- Thêm bảng `auth_providers` vào schema.
- Sửa `passwordHash` cho phép NULL.
- Cài `passport-google-oauth20`.
- Tạo `google.strategy.ts`.
- Thêm routes: `GET /auth/google`, `GET /auth/google/callback`.
- Logic: findOrCreate user + link provider.

### PHASE 3 — Payments (sau khi Phase 2 xong)

**Module 7: Payments**
- Bảng: `payments`, `payment_status_logs`
- Tạo đơn thanh toán khi đăng ký giải có phí.
- (Mock) VNPay webhook callback.
- ACID transaction: Update payment + participant.is_paid.
- Idempotency bằng `transaction_reference` UNIQUE.

**Module 8: Payouts**
- Bảng: `organizer_payouts`, `payout_status_logs`
- BTC yêu cầu rút tiền.
- Admin duyệt/từ chối.
- Upload ảnh chứng từ.

**Module 9: Advertisements**
- Bảng: `advertisements`
- CRUD quảng cáo.
- API đếm views/clicks.

### PHASE 4 — Social & Notifications (sau Phase 3)

**Module 10: Social**
- Bảng: `friendships`, `match_comments`, `match_reactions`
- Gửi/chấp nhận/từ chối lời kết bạn.
- Comment lồng nhau (nested, `parent_id`).
- React trận đấu.

**Module 11: Notifications**
- Bảng: `notifications`
- Tạo notification cho các sự kiện hệ thống.
- API đánh dấu đã đọc.
- (Tương lai) Push notification.

**Module 12: Chat** (WebSocket)
- Bảng: `chat_rooms`, `chat_room_members`, `chat_messages`
- `@WebSocketGateway()` cho real-time.
- Lưu tin nhắn vào DB.

---

## ✅ CHECKLIST SAU MỖI MODULE

Sau khi hoàn thành mỗi module, kiểm tra:
- [ ] `pnpm lint` — không có errors.
- [ ] `pnpm build` — biên dịch thành công.
- [ ] Swagger/Scalar hiển thị đúng endpoints mới.
- [ ] Đăng ký module trong `app.module.ts`.
- [ ] Mọi DTO có `@ApiProperty()`.
- [ ] Mọi endpoint có `@ApiOperation()` + `@ApiResponse()`.
- [ ] Soft delete hoạt động (không hard delete).
- [ ] Pagination hoạt động cho GET danh sách.

---

## 🔧 THÔNG TIN KỸ THUẬT HIỆN CÓ

### Dependencies đã cài
```json
{
  "@nestjs/common": "^11.0.0",
  "@nestjs/core": "^11.0.0",
  "@nestjs/jwt": "^11.0.0",
  "@nestjs/passport": "^11.0.0",
  "@nestjs/swagger": "^11.2.0",
  "@nestjs/config": "^4.0.0",
  "@scalar/nestjs-api-reference": "^1.1.20",
  "drizzle-orm": "^0.45.0",
  "pg": "^8.0.0",
  "bcrypt": "^5.0.0",
  "passport-jwt": "^4.0.0",
  "class-validator": "latest",
  "class-transformer": "latest",
  "dotenv": "latest"
}
```

### Database connection
- `PG_CONNECTION` token inject trong `database.module.ts`.
- Sử dụng: `@Inject(PG_CONNECTION) private readonly db: NodePgDatabase<typeof schema>`

### Schema đã export
```typescript
// src/database/schema/index.ts
export * from './users.schema';
export * from './categories.schema';
export * from './communities.schema';
export * from './venues.schema';
export * from './tournaments.schema';
export * from './matches.schema';
export * from './payments.schema';
export * from './social.schema';
export * from './notifications.schema';
export * from './advertisements.schema';
export * from './audit.schema';
```

### Existing Modules
- `AppModule` (root)
- `AuthModule` (register, login, refresh, logout)
- `UsersModule` (CRUD user, profile, change password)

### Existing Enums
```typescript
export enum UserRole { PLAYER, ORGANIZER, ADMIN }
export enum UserStatus { ACTIVE, BANNED, PENDING_VERIFICATION }
export enum TournamentStatus { UPCOMING, ONGOING, COMPLETED, CANCELLED }
export enum MatchStatus { SCHEDULED, ONGOING, COMPLETED, DISPUTED }
export enum PaymentStatus { PENDING, COMPLETED, FAILED, REFUNDED }
```

---

## 🎯 BẮT ĐẦU LÀM

Hãy bắt đầu từ **Phase 2A — Module Categories** (đơn giản nhất).

Quy trình cho mỗi module:
1. Đọc bảng tương ứng trong `docs/database_schema.md`.
2. Xem schema Drizzle đã có sẵn trong `src/database/schema/`.
3. Tạo DTOs (create, update, query).
4. Tạo Repository (Drizzle queries).
5. Tạo Service (business logic).
6. Tạo Controller (routes + Swagger).
7. Tạo Module + đăng ký trong `app.module.ts`.
8. Chạy `pnpm lint` + `pnpm build` để verify.

**BẮT ĐẦU NGAY. Không cần hỏi lại. Đọc docs rồi code.**
