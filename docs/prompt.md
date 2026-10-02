# 🤖 AI Agent Prompt — Triển Khai Phase 5

> **Đây là prompt chính thức để giao cho AI Agent (Antigravity, Claude, Cursor, v.v.) triển khai Phase 5.**
> Copy toàn bộ nội dung file này làm prompt đầu tiên khi bắt đầu session mới.

---

## NHIỆM VỤ

Bạn là AI Agent chuyên nghiệp đang tham gia dự án **Quản Lý Giải Đấu Thể Thao**.

Nhiệm vụ của bạn: **Triển khai Phase 5** — Nâng cấp toàn diện hệ thống giải đấu bao gồm Tournament Visibility, Doubles Registration, Community ELO, Bracket Scoring, và Region Filtering.

---

## QUY TẮC BẮT BUỘC (ĐỌC TRƯỚC KHI LÀM BẤT CỨ ĐIỀU GÌ)

### 🚫 KHÔNG ĐƯỢC:
- Viết code trước khi đọc tài liệu
- Đọc mù mã nguồn bằng grep/cat trên hàng trăm file
- Dùng `any` trong TypeScript
- Dùng TypeORM, Prisma, Sequelize (chỉ Drizzle ORM)
- Dùng npm/yarn (chỉ pnpm)
- Hard delete (luôn dùng soft delete với `deleted_at`)
- Viết CSS thuần (Frontend dùng TailwindCSS + cn() helper)
- Hardcode URL API trong component (phải đặt trong `features/*/api/`)
- Viết logic xử lý trùng lặp (check `src/utils/`, `src/hooks/` trước)
- Format ngày sai (phải dùng dd/MM/yyyy)

### ✅ PHẢI LÀM:
1. **Đọc tài liệu theo thứ tự** (xem mục TÀI LIỆU BẮT BUỘC ĐỌC bên dưới)
2. **Đọc code hiện tại** của module liên quan trước khi sửa
3. **Chạy `pnpm build`** sau mỗi module để kiểm tra TypeScript
4. **Restart backend** sau mỗi lần push migration Drizzle
5. **Xử lý lỗi** bằng `getErrorMessage()` + toast (Frontend)
6. **ACID transaction** cho mọi thao tác tài chính và ELO
7. **Pessimistic Lock** (`SELECT ... FOR UPDATE`) khi update ELO

---

## TÀI LIỆU BẮT BUỘC ĐỌC (THEO THỨ TỰ NÀY)

### Bước 1 — Đọc quy tắc & kỹ năng:
```
Backend:  docs/skills.md          ← Quy tắc công nghệ, kiến trúc, những gì KHÔNG được làm
Frontend: docs/skills.md          ← Quy tắc component, naming, TypeScript strict
```

### Bước 2 — Đọc thiết kế Phase 5:
```
Backend:  docs/phase5-plan.md     ← Schema SQL, API specs, ELO algorithm chi tiết
Frontend: docs/phase5-plan.md     ← UI mockups, component specs, flow mô tả
```

### Bước 3 — Đọc tham chiếu:
```
Backend:  docs/database_schema.md ← Toàn bộ schema hiện tại + Phase 5 additions (cuối file)
Backend:  docs/business_flows.md  ← Mermaid diagrams luồng nghiệp vụ Phase 5
Backend:  docs/endpoint_url.md    ← Danh sách API đã có + Phase 5 endpoints cần làm
Frontend: docs/routes.md          ← Danh sách routes đã có + Phase 5 routes mới
Frontend: docs/pages.md           ← Chi tiết các trang (rendering, APIs, components)
```

### Bước 4 — Đọc code hiện tại (trước khi sửa module nào thì đọc module đó):
```
Backend schema:  src/database/schema/tournaments.schema.ts
Backend schema:  src/database/schema/categories.schema.ts
Backend module:  src/modules/tournaments/tournaments.service.ts
Backend module:  src/modules/tournaments/tournaments.repository.ts
Backend module:  src/modules/rankings/rankings.repository.ts
Frontend types:  src/types/tournament.ts (nếu có)
Frontend api:    src/features/tournaments/api/ (nếu có)
```

---

## CÁC MODULE CẦN TRIỂN KHAI (THEO THỨ TỰ NÀY)

### MODULE 1: Schema Migration *(làm đầu tiên — các module khác phụ thuộc)*

**File cần sửa:**
- `backend-api_qlgiaidau/src/database/schema/tournaments.schema.ts`
- `backend-api_qlgiaidau/src/database/schema/categories.schema.ts`

**File cần tạo mới:**
- `backend-api_qlgiaidau/src/database/schema/community_rankings.schema.ts`

**Việc cần làm:**
1. Thêm vào `tournaments` schema: `visibility` (default 'PUBLIC'), `genderRestriction` (nullable)
2. Thêm vào `tournamentParticipants` schema: `teamInviteToken` (unique, nullable), `teamStatus` (default 'PENDING')
3. Thêm vào `userRanks` schema: `winStreak` (default 0)
4. Tạo file `community_rankings.schema.ts` với đầy đủ fields (xem `docs/database_schema.md` phần Phase 5)
5. Export từ `src/database/schema/index.ts`

**Sau khi sửa schema:**
```bash
cd backend-api_qlgiaidau
pnpm drizzle-kit generate
# Review file SQL trong src/database/migrations/
pnpm drizzle-kit push
# Restart backend (BẮT BUỘC)
```

---

### MODULE 2: Tournament Visibility & Invite Link

**Backend — File cần sửa:**
- `src/modules/tournaments/dto/create-tournament.dto.ts` — Thêm `visibility`, `genderRestriction`
- `src/modules/tournaments/dto/update-tournament.dto.ts` — Thêm tương tự
- `src/modules/tournaments/tournaments.repository.ts` — Filter visibility trong GET
- `src/modules/tournaments/tournaments.controller.ts` — Thêm 2 endpoints mới

**Backend — Endpoints cần thêm:**
```typescript
// POST /tournaments/:id/validate-invite
// Không cần auth (@Public())
// Input: { inviteCode: string }
// Output: Thông tin giải đấu nếu code hợp lệ | 400 nếu sai

// POST /tournaments/:id/regenerate-invite
// Chỉ owner giải mới được gọi
// Output: { inviteCode: string }
```

**Backend — Logic GET /tournaments:**
```
- Không có token / có param visibility=PUBLIC → WHERE visibility = 'PUBLIC'
- Có param created_by=me → Hiện tất cả giải của user
- Thêm filter: tournamentType, communityId, region
```

**Frontend — File cần sửa:**
- `src/app/organizer/tournaments/[id]/manage/page.tsx`
  - Tab settings: Thêm toggle PUBLIC/PRIVATE
  - Hiển thị invite link khi PRIVATE (ô readonly + nút Copy)
  - Dropdown gender restriction (Không ràng buộc / Nam / Nữ / Mixed)

**Frontend — File cần tạo:**
- `src/app/(public)/tournaments/[id]/register/page.tsx`
  - URL pattern: `/tournaments/[id]/register?invite={code}`
  - Validate invite → Hiển thị form → Check auth → Đăng ký

---

### MODULE 3: Tournament Registration (Singles + Doubles)

**Backend — File cần sửa:**
- `src/modules/tournaments/tournaments.controller.ts` — 4 endpoints mới
- `src/modules/tournaments/tournaments.service.ts` — Logic đăng ký, join team, withdraw
- `src/modules/tournaments/tournaments.repository.ts` — CRUD participant/roster

**Backend — Endpoints cần thêm:**
```typescript
// POST /tournaments/:id/register
// Auth: JWT
// Tạo participant + roster cho leader
// Nếu DOUBLES: sinh teamInviteToken, teamStatus='PENDING'
// Nếu SINGLES: teamStatus='COMPLETE'
// Check: giải mở đăng ký, chưa đăng ký trùng, đủ giới tính, còn chỗ

// POST /tournaments/:id/join-team
// Auth: JWT
// Body: { participantId, teamInviteToken }
// Validate token, check giới tính (MIXED), tạo roster partner
// teamStatus → 'COMPLETE'

// POST /tournaments/:id/withdraw
// Auth: JWT
// teamStatus → 'WITHDRAWN', hoàn phí nếu đã thanh toán

// GET /tournaments/:id/my-registration
// Auth: JWT
// Trả về trạng thái đăng ký của user trong giải này
```

**Backend — Quy tắc check giới tính:**
```
genderRestriction = 'MALE'   → Tất cả thành viên phải gender = 'MALE'
genderRestriction = 'FEMALE' → Tất cả thành viên phải gender = 'FEMALE'
genderRestriction = 'MIXED'  → Phải có đúng 1 MALE + 1 FEMALE (doubles)
genderRestriction = NULL     → Không ràng buộc
```

**Frontend — File cần tạo:**
- `src/app/(public)/tournaments/[id]/register/components/DoublesRegistrationFlow.tsx`
  - Step 1: Form đăng ký (tên đội)
  - Step 2: Hiển thị invite link + QR Code + polling chờ partner
  - Step 3: Đủ 2 người → Thanh toán (nếu có phí)

- `src/app/(public)/tournaments/[id]/join-team/page.tsx`
  - Validate token → Hiển thị thông tin đội + leader
  - Check giới tính có phù hợp không → Nút join

**Frontend — File cần sửa:**
- `src/app/(public)/login/page.tsx`
  - Sau login redirect về URL trong query param `redirect`

---

### MODULE 4: Community-Scoped Tournaments

**Backend — Logic cần thêm vào GET /tournaments:**
```
- Thêm query param: tournamentType (PUBLIC | CLUB)
- Default khi không có communityId: tournamentType = 'PUBLIC'
- Khi có communityId: filter theo communityId + tournamentType = 'CLUB'
```

**Backend — Endpoint mới:**
```typescript
// GET /communities/:id/tournaments
// @Public()
// Trả về danh sách giải có communityId = :id
```

**Backend — Logic đăng ký giải CLUB:**
```
Nếu tournament.tournamentType === 'CLUB':
  → Check user là community_members với communityId + status = 'JOINED'
  → Nếu không phải member → 403 "Chỉ thành viên CLB mới đăng ký được"
```

**Frontend — File cần sửa:**
- Trang `/communities/[id]`: Thêm tab "Giải đấu" gọi API tournaments theo CLB
- Trang `/tournaments`: Luôn gọi với `tournamentType=PUBLIC`

---

### MODULE 5: Bracket & Set Scoring Nâng Cao

**Backend — File cần sửa:**
- `src/modules/matches/matches.service.ts`
  - `updateScore()`: Validate score dựa trên `roundConfig` của stage
  - Khi đủ sets thắng → gợi ý COMPLETED
- `src/modules/matches/matches.service.ts`
  - `completeMatch()`: Auto-advance winner → `next_match_id`, loser → `loser_next_match_id`
  - Update `group_standings` nếu Round Robin
  - Emit WebSocket event: `match:completed`, `bracket:updated`

**Logic score validation:**
```
roundConfig.bestOf = 3 → setsToWin = 2
roundConfig.bestOf = 5 → setsToWin = 3
...
Nếu deuceEnabled && cả 2 đạt tiebreakAt → phải thắng cách 2 điểm
Nếu maxPoints → cap điểm tại maxPoints
```

**Frontend — File cần sửa:**
- Manage page: Thêm UI setting số set cho mỗi vòng (dropdown BO1/BO3/BO5/BO7)

---

### MODULE 6: Professional ELO System

**Backend — File cần tạo:**
- `src/modules/rankings/elo-engine.service.ts`
  - Method `calculateElo(playerElo, opponentElo, isWin, matchesPlayed, winStreak)`
  - K-factor: < 10 trận → 40, 10-30 → 24, > 30 → 16
  - Win streak bonus: 3+ → ×1.1, 5+ → ×1.2, 7+ → ×1.3
  - Upset bonus: thắng ELO cao hơn 200 → +5, cao hơn 400 → +10
  - Floor: `Math.max(100, newElo)`

**Backend — File cần sửa:**
- `src/modules/rankings/rankings.service.ts`
  - `processMatchResult(match, tournament)`:
    - Xác định scope: PUBLIC → `user_ranks`, CLUB → `community_rankings`
    - Dùng db.transaction + FOR UPDATE (pessimistic lock)
    - Gọi `EloEngineService.calculateElo()` cho cả 2 người
    - Update rank + insert elo_history_logs
    - Update `winStreak`

- `src/modules/rankings/rankings.repository.ts`
  - Thêm CRUD cho `community_rankings`
  - Thêm query leaderboard theo `scope` + `communityId`
  - Thêm `FOR UPDATE` khi lấy rank để lock

- `src/modules/rankings/dto/query-ranking.dto.ts`
  - Thêm `scope: 'PUBLIC' | 'COMMUNITY'`
  - Thêm `communityId?: string`

**Backend — API mới:**
```typescript
// GET /rankings/user/:userId
// Trả về ELO của user theo tất cả categories (public + CLBs)

// GET /rankings/user/:userId/history
// Query: scope, communityId, categoryId
// Trả về elo_history_logs có phân trang
```

**Frontend — File cần tạo:**
- `src/components/ui/EloTierBadge.tsx`
  - Props: `{ elo: number, size?: 'sm' | 'md' | 'lg' }`
  - Tiers: Bronze(100-1199) Silver(1200-1399) Gold(1400-1599) Platinum(1600-1799) Diamond(1800-1999) Master(2000-2199) Grand Master(2200+)
  - Màu + icon tương ứng theo tier

**Frontend — File cần sửa:**
- `src/app/(public)/leaderboard/page.tsx`
  - Tab "Xếp hạng chung" (Public ELO)
  - Tab "Xếp hạng CLB" (Community ELO — chọn CLB)
  - Cột: Hạng, Avatar, Tên, ELO, Tier Badge, Số trận, Tỉ lệ thắng

---

### MODULE 7: Region-Based Filtering

**Backend — File cần sửa:**
- `src/modules/tournaments/tournaments.repository.ts`
  - Thêm filter `region`: JOIN với tournament_venues, WHERE location_address ILIKE '%{region}%'
- `src/modules/communities/communities.repository.ts`
  - Thêm filter `region`: WHERE location_address ILIKE '%{region}%'

**Frontend — File cần sửa:**
- `src/app/(public)/tournaments/page.tsx`: Thêm dropdown "Khu vực"
- `src/app/(public)/communities/page.tsx`: Thêm dropdown "Khu vực"
- Gọi `GET /regions` để lấy danh sách tỉnh/thành

---

### MODULE 8: Tournament Card Nâng Cấp (Frontend)

**File cần sửa/tạo:**
- `src/components/tournaments/TournamentCard.tsx` (hoặc tương đương)

**Thông tin phải hiển thị trên mỗi card:**
- Tên giải
- Môn thể thao (icon + tên category)
- Địa chỉ / khu vực (từ venue hoặc tournament location)
- Ngày thi đấu (format **dd/MM/yyyy**)
- Loại: Singles / Doubles / Mixed
- Phí tham gia (hoặc "Miễn phí")
- Số lượng đã đăng ký / max participants
- Trạng thái (badge màu: Mở đăng ký, Đang thi đấu, Đã kết thúc)
- Ràng buộc giới tính nếu có

---

## QUY TRÌNH LÀM VIỆC

```
Bước 1: Đọc tài liệu theo thứ tự ở mục "TÀI LIỆU BẮT BUỘC ĐỌC"
Bước 2: Đọc code hiện tại của module sắp làm
Bước 3: Triển khai Module 1 (Schema) → push DB → restart backend
Bước 4: Triển khai Module 2 → pnpm build (backend) → kiểm tra
Bước 5: Triển khai Module 3 → pnpm build → kiểm tra
Bước 6: Tiếp tục theo thứ tự 4 → 5 → 6 → 7 → 8
Bước 7: Sau khi xong tất cả → pnpm build (cả backend + frontend)
Bước 8: Báo cáo hoàn thành + liệt kê những gì đã làm
```

---

## LỆNH HỮU ÍCH

```bash
# Backend
cd backend-api_qlgiaidau
pnpm start:dev              # Chạy dev server
pnpm build                  # Kiểm tra TypeScript (BẮT BUỘC trước khi báo cáo xong)
pnpm drizzle-kit generate   # Sinh migration file sau khi sửa schema
pnpm drizzle-kit push       # Push migration lên DB

# Frontend
cd frontend-web_qlgiaidau
pnpm dev                    # Chạy dev server (port 3001)
pnpm build                  # Kiểm tra TypeScript + Next.js build
```

---

## CẤU TRÚC THƯ MỤC QUAN TRỌNG

```
backend-api_qlgiaidau/
├── docs/
│   ├── skills.md          ← QUY TẮC - ĐỌC TRƯỚC
│   ├── phase5-plan.md     ← PLAN CHI TIẾT
│   ├── database_schema.md ← SCHEMA + PHASE 5 ADDITIONS
│   ├── business_flows.md  ← MERMAID FLOWS
│   └── endpoint_url.md    ← API ENDPOINTS
├── src/
│   ├── database/schema/   ← Drizzle schema files
│   ├── modules/
│   │   ├── tournaments/   ← Service, Controller, Repository, DTO
│   │   ├── rankings/      ← ELO engine sẽ nằm đây
│   │   ├── matches/       ← Score + bracket advance
│   │   └── communities/   ← Community tournaments
│   └── common/            ← Shared guards, interceptors, filters

frontend-web_qlgiaidau/
├── docs/
│   ├── skills.md          ← QUY TẮC - ĐỌC TRƯỚC
│   ├── phase5-plan.md     ← PLAN UI CHI TIẾT
│   └── routes.md          ← ROUTE MAP
├── src/
│   ├── app/               ← Next.js App Router pages
│   ├── components/ui/     ← UI primitives dùng chung
│   ├── features/          ← Feature-based modules (api + components + hooks)
│   ├── utils/             ← Hàm tiện ích dùng chung (CHECK TRƯỚC KHI VIẾT MỚI)
│   ├── hooks/             ← Custom React hooks (CHECK TRƯỚC KHI VIẾT MỚI)
│   └── types/             ← TypeScript interfaces (mapping với Backend DTOs)
```

---

## FORMAT BÁO CÁO KHI XON MỖI MODULE

Sau khi hoàn thành mỗi module, báo cáo theo format:

```
✅ Module X: [Tên module]
- Files đã tạo: [danh sách]
- Files đã sửa: [danh sách]
- APIs mới: [danh sách endpoints]
- pnpm build: PASS / FAIL (nếu FAIL thì fix trước khi tiếp tục)
- Ghi chú: [issues gặp phải nếu có]
```
