# 🛠️ 8 Kỹ Năng Cốt Lõi (Tech Skills Map)

> Tài liệu này quy định **chính xác** 8 nhóm kỹ năng cần thiết để xây dựng dự án.  
> Mỗi kỹ năng được **map trực tiếp** với nghiệp vụ thực tế từ `database_schema.md`, `plan.md`, `apicrud.md`.  
> **AI Agent hoặc thành viên mới:** Hãy đọc file này TRƯỚC KHI viết bất kỳ dòng code nào.

---

## 🤖 QUY TẮC BẮT BUỘC DÀNH CHO AI AGENT (GRAPHIFY PROTOCOL)

Nhằm tối ưu **Token Quota** và tăng tốc độ hiểu dự án, mọi AI Agent tham gia vào dự án này (Antigravity, Claude, Cursor, v.v.) **BẮT BUỘC** phải tuân thủ quy trình sau:

1. **KHÔNG đọc mù mã nguồn (Blind Reading):** Khi nhận được yêu cầu thêm tính năng mới, AI **KHÔNG ĐƯỢC** dùng các công cụ `grep` hoặc `cat` chạy rà soát toàn bộ hàng trăm file mã nguồn.
2. **Sử dụng Graphify làm Nguồn Sự Thật (Source of Truth):** AI phải tự động nạp hoặc tham chiếu tới thư mục `graphify-out/` (cụ thể là `graph.json` và `GRAPH_REPORT.md`) để nắm bắt kiến trúc tổng thể, luồng gọi hàm (AST) và sự liên kết giữa các file.
3. **Cập nhật Graphify sau mỗi Feature lớn:** 
   - Sau khi hoàn thành code cho một module mới hoặc sửa đổi cấu trúc diện rộng, AI **phải** chủ động chạy lệnh `graphify update .` trên Terminal.
   - Quá trình này không tiêu tốn API key LLM (No LLM needed) và chỉ mất vài giây để quét lại cây AST nội bộ. Nhờ đó, Knowledge Graph luôn tươi mới (Freshness = 100%) cho các lượt Prompt tiếp theo.

---

## Skill 1: Backend Core — NestJS + TypeScript 🏗️

> **Nền tảng của toàn bộ hệ thống.** Mọi API, logic, module đều chạy trên NestJS.

| Công nghệ | Phiên bản | Vai trò trong dự án |
|---|---|---|
| **Node.js** | >= 20 LTS | Runtime |
| **TypeScript** | >= 5.x (Strict mode) | Ngôn ngữ chính — **KHÔNG dùng JS, KHÔNG dùng `any`** |
| **NestJS** | >= 11.x | Framework Modular Monolith |
| **class-validator** | Latest | Validate mọi DTO đầu vào (CreateTournamentDto, UpdateMatchDto...) |
| **class-transformer** | Latest | Serialize response, loại bỏ field nhạy cảm (password_hash) |
| **@nestjs/swagger** | Latest | Auto-generate API docs tại `/api/docs` |

### Phải biết gì?
- **Module pattern**: Mỗi feature 1 module riêng biệt (Users, Tournaments, Matches, Payments...)
- **Request lifecycle**: Middleware → Guard → Interceptor → Pipe → Controller → Service → Repository
- **Decorator**: Tạo custom `@CurrentUser()`, `@Public()`, `@Roles('ADMIN')`
- **Exception Filter**: Format lỗi chuẩn `{ statusCode, message, error, details, timestamp, path }`
- **Interceptor**: `TransformInterceptor` wrap response `{ data, message, statusCode, meta }`
- **Dependency Injection**: Inject service giữa các module (`TournamentsService` inject `UsersService`)

### Dùng ở đâu trong dự án?
- Toàn bộ 36 bảng đều cần Module + Controller + Service + Repository
- `plan.md` Phase 1.2 (Common Layer), Phase 1.4 (Users Module), Phase 1.5 (Swagger)

---

## Skill 2: Database & ORM — PostgreSQL + Drizzle + PostGIS 🗄️

> **Trái tim dữ liệu.** 36 bảng, 9 tầng nghiệp vụ, ACID cho tài chính, GIS cho tìm sân.

| Công nghệ | Phiên bản | Vai trò trong dự án |
|---|---|---|
| **PostgreSQL** | >= 16.x | Database chính — JSONB, UUID, Array, CHECK constraints |
| **Drizzle ORM** | >= 0.45.x | ORM type-safe, SQL-first — **KHÔNG dùng TypeORM/Prisma/Sequelize** |
| **Drizzle Kit** | >= 0.31.x | CLI: `drizzle-kit generate` (migration) + `drizzle-kit push` (sync) |
| **PostGIS** | Extension | Geography queries — tìm community/sân gần tôi |
| **uuid-ossp** | Extension | Generate UUID v4 cho mọi Primary Key |

### Phải biết gì?
- **Drizzle Schema**: Khai báo bảng bằng TypeScript (`pgTable`, `uuid`, `varchar`, `timestamp`...)
- **Relations**: Drizzle `relations()` để define 1:1, 1:N, M:N
- **Migration workflow**: Sửa schema → `drizzle-kit generate` → review SQL → `drizzle-kit push`
- **Transaction**: Bọc mọi thao tác tiền trong `db.transaction()` — payments, payouts, ELO update
- **Pessimistic Lock**: `SELECT ... FOR UPDATE` khi cập nhật ELO chống Race Condition
- **JSONB**: Dùng cho `sport_rules`, `tournament_config`, `score_details`, `gateway_response`
- **PostGIS queries**: `ST_DWithin()`, `ST_Distance()` cho tìm kiếm theo vị trí
- **Soft Delete**: Mọi bảng chính đều có `deleted_at` — KHÔNG BAO GIỜ Hard Delete user/tournament

### Dùng ở đâu trong dự án?
- `database_schema.md` — toàn bộ 36 bảng cần Drizzle schema tương ứng
- `plan.md` Phase 1.1 (Cấu hình DB), Phase 2.2 (PostGIS query), Phase 2.5 (ELO lock)

### Cấu trúc file Drizzle Schema
```
src/database/schema/
├── users.schema.ts          # users, profiles, roles, user_to_roles, sessions
├── categories.schema.ts     # categories, elo_tiers, user_ranks, elo_history_logs
├── communities.schema.ts    # communities, community_members, community_sports
├── venues.schema.ts         # tournament_venues, venue_courts
├── tournaments.schema.ts    # tournaments, stages, groups, participants, rosters
├── matches.schema.ts        # matches, match_players, match_disputes, group_standings
├── payments.schema.ts       # payments, payment_status_logs, organizer_payouts, payout_status_logs
├── social.schema.ts         # friendships, chat_rooms, chat_room_members, chat_messages
├── notifications.schema.ts  # notifications, match_comments, match_reactions
├── advertisements.schema.ts # advertisements
├── audit.schema.ts          # audit_logs
└── index.ts                 # Re-export tất cả
```

---

## Skill 3: Authentication & Authorization — JWT + RBAC 🔐

> **Bảo vệ API.** Xác thực người dùng, phân quyền theo vai trò, quản lý phiên đăng nhập.

| Công nghệ | Phiên bản | Vai trò trong dự án |
|---|---|---|
| **@nestjs/passport** | Latest | Tích hợp Passport vào NestJS |
| **passport-jwt** | Latest | JWT Strategy — verify Access Token |
| **@nestjs/jwt** | Latest | Sign & verify JWT tokens |
| **bcrypt** | Latest | Hash password (salt rounds = 12) |

### Phải biết gì?
- **JWT Flow**: Login → Access Token (15 phút) + Refresh Token (7 ngày, lưu bảng `sessions`)
- **Token Payload**: `{ sub: uuid, email, roles: ['PLAYER', 'ORGANIZER'], iat, exp }`
- **Guards**:
  - `JwtAuthGuard` — check token hợp lệ (global, trừ route `@Public()`)
  - `RolesGuard` — check user có role đủ quyền (`@Roles('ADMIN')`, `@Roles('ORGANIZER')`)
- **Session Management**: Bảng `sessions` — multi-device login, revoke token, lưu `ip_address` + `user_agent`
- **Password Security**: bcrypt hash, KHÔNG BAO GIỜ trả `password_hash` về client
- **3 vai trò (Roles)**:
  - `PLAYER` (mặc định) — xem giải, đăng ký, xem ELO
  - `ORGANIZER` — tạo giải, nhập score, rút tiền
  - `ADMIN` — duyệt community, quản lý payments, toàn quyền

### Dùng ở đâu trong dự án?
- Bảng: `users`, `roles`, `user_to_roles`, `sessions`
- `plan.md` Phase 1.3 (Auth Module) — register, login, refresh, logout
- `spec.md` mục 2 (JWT Token Structure, Roles)
- Mọi endpoint POST/PATCH/DELETE đều cần Guard (trừ `@Public()`)

---

## Skill 4: Real-time Communication — WebSocket + Socket.io 📡

> **Trải nghiệm trực tiếp.** Live Score cập nhật tức thì, Chat real-time giữa người chơi.

| Công nghệ | Phiên bản | Vai trò trong dự án |
|---|---|---|
| **@nestjs/websockets** | Latest | WebSocket Gateway trong NestJS |
| **@nestjs/platform-socket.io** | Latest | Socket.io adapter |
| **Socket.io** | Latest | Server-side real-time engine |
| **Socket.io-client** | Latest | Client-side (Web + Mobile) |

### Phải biết gì?
- **WebSocket Gateway**: Tạo `@WebSocketGateway()` cho Live Score và Chat
- **CORS Configuration**: Bắt buộc sử dụng cấu hình CORS tập trung (ví dụ từ `src/config/cors.config.ts`), kết hợp giữa biến môi trường `process.env.FRONTEND_URL` và `credentials: true`. Tuyệt đối KHÔNG cấu hình cứng `origin: '*'` hoặc hardcode tên miền riêng lẻ ở từng file Gateway để tránh lỗi CORS và dễ dàng thay đổi khi triển khai (host).
- **Rooms**: Mỗi trận đấu 1 room (`match:{matchId}`), mỗi phòng chat 1 room (`chat:{roomId}`)
- **Events**:
  - `score:update` — broadcast khi tỷ số thay đổi
  - `match:status` — broadcast khi trận `SCHEDULED → IN_PROGRESS → COMPLETED`
  - `chat:message` — gửi/nhận tin nhắn real-time
  - `chat:typing` — indicator đang gõ
- **Authentication**: Verify JWT trong WebSocket handshake (`handleConnection`)
- **Scalability**: Redis Adapter cho multi-instance (Phase 5)

### Dùng ở đâu trong dự án?
- Bảng: `matches` (live score), `chat_rooms`, `chat_messages`
- `plan.md` Phase 2.4 (WebSocket Live Score), Phase 4.2 (Chat Module)
- `project_overview.md` — "Theo dõi tỷ số trực tiếp (Live Score)"

---

## Skill 5: Payment Integration — VNPay + MoMo + Webhook 💳

> **Dòng tiền.** Thu phí giải đấu, cắt hoa hồng, rút tiền cho BTC. Sai = mất tiền thật.

| Công nghệ | Phiên bản | Vai trò trong dự án |
|---|---|---|
| **VNPay SDK** | Latest | Cổng thanh toán chính (sandbox + production) |
| **MoMo API** | Latest | Cổng thanh toán phụ (QR Code) |
| **crypto** (Node.js) | Built-in | Verify HMAC signature từ webhook callback |

### Phải biết gì?
- **Payment Flow**:
  1. User đăng ký giải có phí → Tạo `payments` record (`status: PENDING`)
  2. Redirect user sang VNPay/MoMo checkout page
  3. User thanh toán → Gateway gọi **Webhook callback** về server
  4. Server verify signature → **Transaction ACID**:
     - Update `payments.status = 'SUCCESSFUL'`
     - Update `tournament_participants.is_paid = true`
     - Insert `payment_status_logs` (lưu vết)
     - Tính `platform_fee_amount = amount * platform_fee_percentage / 100`
- **Idempotency**: Dùng `transaction_reference` (UNIQUE) chống webhook gọi đúp
- **Payout Flow**: BTC yêu cầu rút → Admin duyệt → Upload ảnh bill → Đổi status
- **ACID bắt buộc**: Mọi thao tác tiền PHẢI bọc trong `db.transaction()`
- **Audit Trail**: Mọi thay đổi status đều phải insert vào `payment_status_logs` hoặc `payout_status_logs`
- **CHECK Constraints**:
  - `payments.amount > 0` — không thanh toán số 0
  - `organizer_payouts: total_collected >= amount_requested + platform_fee_retained`

### Dùng ở đâu trong dự án?
- Bảng: `payments`, `payment_status_logs`, `organizer_payouts`, `payout_status_logs`
- `plan.md` Phase 3 (Monetization & Payments)
- `spec.md` mục 6 (VNPAY_TMN_CODE, VNPAY_HASH_SECRET env vars)

---

## Skill 6: Domain Logic — ELO, Bracket, Giải đấu 🧠

> **Nghiệp vụ đặc thù thể thao.** Thuật toán ELO, sinh nhánh đấu, quản lý multi-stage.

### 6.1 Hệ thống ELO & Xếp hạng

| Khái niệm | Chi tiết |
|---|---|
| **ELO Algorithm** | K-factor based — tính toán khi match `COMPLETED` |
| **Tier System** | Low D → High D → C → B → Low A → High A (theo `elo_tiers`) |
| **Per-Category** | Mỗi user có ELO riêng cho mỗi môn (Pickleball, Tennis, Cầu lông) |
| **Race Condition** | `SELECT ... FOR UPDATE` trên `user_ranks` khi cập nhật ELO |

#### Phải biết gì?
- **ELO Formula**: `new_elo = old_elo + K * (actual_score - expected_score)`
  - `expected_score = 1 / (1 + 10^((opponent_elo - player_elo) / 400))`
  - K-factor tùy theo tier (K=32 cho new player, K=16 cho player ổn định)
- **Match → ELO Event**: Khi `matches.status = 'COMPLETED'` → trigger Event:
  1. Lấy danh sách `match_players` (ai thực sự ra sân)
  2. Lock `user_ranks` cho mỗi player (`FOR UPDATE`)
  3. Tính ELO mới cho winner + loser
  4. Update `user_ranks.elo_points`, `matches_played`, `matches_won`
  5. Auto-update `tier_id` nếu ELO vượt ngưỡng
  6. Insert `elo_history_logs` (lưu previous → new, reason: `MATCH_WIN`/`MATCH_LOSS`)
- **Leaderboard**: Query `user_ranks` ORDER BY `elo_points DESC` theo `category_id`

### 6.2 Bracket Generation (Sinh nhánh đấu)

| Thể thức | Mô tả |
|---|---|
| **Round Robin** | Mỗi đội gặp nhau 1 lần → tính `group_standings` → top N lên vòng sau |
| **Single Elimination** | Thua 1 trận = loại. Dùng `matches.next_match_id` tạo cây bracket |
| **Double Elimination** | Thua lần 1 xuống nhánh phụ (`loser_next_match_id`). Thua lần 2 = loại |

#### Phải biết gì?
- **Self-referencing**: `matches.next_match_id` → `matches.id` tạo bracket tree
- **Bracket seeding**: Sắp xếp `tournament_participants.seed` để hạt giống không gặp nhau sớm
- **Stage transition**: Round Robin xong → lấy top N từ `group_standings` → seed vào Elimination stage
- **Bảng điều phối**: `matches(group_id, round_number, match_order, bracket_branch)` — xác định vị trí chính xác trên bracket

### Dùng ở đâu trong dự án?
- Bảng: `user_ranks`, `elo_tiers`, `elo_history_logs`, `match_players`, `tournament_stages`, `tournament_groups`, `matches`, `group_standings`
- `plan.md` Phase 2.3 (Bracket), Phase 2.4 (Matches), Phase 2.5 (ELO)

---

## Skill 7: Web Frontend — Next.js + React 🖥️

> **Giao diện người dùng.** Dashboard giải đấu, Live Score board, Chat, Leaderboard.

| Công nghệ | Phiên bản | Vai trò trong dự án |
|---|---|---|
| **Next.js** | >= 15.x | Framework React (App Router, Server Components) |
| **React** | >= 19.x | UI Library |
| **TypeScript** | >= 5.x | Ngôn ngữ chính |
| **TailwindCSS** | >= 4.x | Styling utility-first |
| **Zustand** | Latest | State management (auth state, live score state, chat state) |
| **Axios** hoặc **ky** | Latest | HTTP Client gọi REST API |
| **Socket.io-client** | Latest | Nhận live score + chat real-time |

### Phải biết gì?
- **App Router**: `app/` directory, layouts, loading states, error boundaries
- **Server Components vs Client Components**: Biết khi nào cần `'use client'`
- **Auth Flow**: Lưu Access Token (memory/cookie), auto-refresh khi hết hạn
- **Real-time UI**: Connect Socket.io → listen events → update Zustand store → re-render
- **Responsive**: Mobile-first design (Player dùng điện thoại là chính)

### Các trang chính cần xây
| Trang | Mô tả |
|---|---|
| Landing Page | Giới thiệu nền tảng, CTA đăng ký |
| Dashboard | Tổng quan giải đấu sắp tới, ELO cá nhân |
| Tournament Detail | Bracket view, danh sách đội, live score |
| Live Score Board | Real-time score update qua WebSocket |
| Leaderboard | Bảng xếp hạng ELO theo môn |
| Community Page | Thông tin community, members, giải đấu |
| Chat | Direct message + Group chat |
| Profile | Thông tin cá nhân, lịch sử ELO, thành tích |
| Admin Panel | Duyệt community, quản lý payments, payouts |

---

## Skill 8: DevOps & Infrastructure — Docker + CI/CD + Cloud ☁️

> **Vận hành.** Đóng gói, triển khai, monitoring. Không có DevOps = không ship được sản phẩm.

| Công nghệ | Vai trò trong dự án |
|---|---|
| **Docker** + **Docker Compose** | Container hóa: PostgreSQL + PostGIS + Redis + NestJS API |
| **pnpm** | Package manager (nhanh, tiết kiệm disk so với npm) |
| **ESLint** + **Prettier** | Linting & Format — config mặc định NestJS |
| **Git** + **GitHub** | Version control, branching model (main/develop/feature/*) |
| **GitHub Actions** | CI/CD: Lint → Test → Build → Deploy tự động |
| **Redis** (>= 7.x) | Cache Leaderboard, Live Score, Session store |
| **Cloudinary** hoặc **AWS S3** | Lưu ảnh: avatar, banner, match evidence, transaction proof |
| **pgAdmin** | GUI quản lý PostgreSQL |
| **Postman** / **Insomnia** | Test API thủ công, tạo Collection |
| **PM2** | Process manager cho production Node.js |

### Phải biết gì?
- **Docker Compose stack**:
  ```yaml
  services:
    postgres:    # PostgreSQL 16 + PostGIS extension
    redis:       # Redis 7 cho caching
    api:         # NestJS app (depends on postgres, redis)
    pgadmin:     # GUI quản lý DB (dev only)
  ```
- **CI/CD Pipeline** (GitHub Actions):
  1. `pnpm lint` — Check ESLint
  2. `pnpm test` — Unit tests
  3. `pnpm build` — TypeScript compile
  4. Deploy to staging/production
- **Redis Caching**: Cache Leaderboard (TTL 60s), Live Score (TTL 5s), Session validation
- **Cloud Storage**: Upload flow — Client → API (validate file type/size) → Cloudinary/S3 → Lưu URL vào DB
- **Environment**: `.env` file với tối thiểu: DB config, JWT secrets, Redis, Cloudinary, VNPay keys
- **Monitoring**: PM2 logs, health check endpoint (`GET /health`)

### Dùng ở đâu trong dự án?
- `plan.md` Phase 5.2 (Performance & DevOps)
- `spec.md` mục 6 (Environment Variables)
- `rules.md` mục 3 (Git Workflow)

---

## 📊 Ma Trận: Skill → Phase Mapping

| Skill | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 |
|---|---|---|---|---|---|
| 1. Backend Core | ⭐⭐⭐ | ⭐⭐ | ⭐ | ⭐ | — |
| 2. Database & ORM | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐ | — |
| 3. Auth & Security | ⭐⭐⭐ | ⭐ | ⭐ | — | — |
| 4. Real-time (WS) | — | ⭐⭐ | — | ⭐⭐⭐ | ⭐ |
| 5. Payment | — | — | ⭐⭐⭐ | — | — |
| 6. Domain Logic | — | ⭐⭐⭐ | — | — | — |
| 7. Web Frontend | — | — | — | — | ⭐⭐⭐ |
| 8. DevOps | ⭐ | — | — | — | ⭐⭐⭐ |

> ⭐⭐⭐ = Kỹ năng chính trong phase đó | ⭐ = Có sử dụng | — = Không cần

---

## 🚫 Công Nghệ KHÔNG ĐƯỢC Dùng

| ❌ Cấm | ✅ Thay thế |
|---|---|
| TypeORM, Prisma, Sequelize | **Drizzle ORM** |
| Express thuần | **NestJS** (dùng Express underneath) |
| JavaScript (`.js`) | **TypeScript (`.ts`)** |
| `any` type | Type đầy đủ, dùng Generics |
| npm, yarn | **pnpm** |
| Hard Delete | **Soft Delete** (`deleted_at`) |
| MongoDB | **PostgreSQL** |
| Firebase Firestore / Realtime DB | **PostgreSQL + Drizzle ORM** (Firebase CHỈ ĐƯỢC DÙNG làm cổng gửi Push Notification FCM ra thiết bị) |

