# 📋 Division Tournament — Tài Liệu Hiện Trạng & Việc Còn Lại

> Cập nhật lần cuối: 2026-06-17  
> Trạng thái: **Đã implement phần lớn. Còn 3 mục defer có lý do rõ ràng.**

---

## ✅ ĐÃ HOÀN THÀNH

### Backend
- Schema `tournament_divisions` đã có trong Drizzle ORM (`tournament_divisions.schema.ts`)
- CRUD API `/tournaments/:id/divisions` — GET, POST, PATCH, DELETE
- Ràng buộc unique: `(tournament_id, match_type, gender_restriction)`
- Ràng buộc xóa: không xóa được division còn participant
- `tournament_stages` và `tournament_participants` đều có cột `tournament_division_id`

### Frontend (trang quản lý organizer)
- Division selector panel với badge-button tabs
- Modal tạo division mới (chọn loại hình thức, bracket type)
- Xóa division inline với check participant count
- Tabs quản lý (Thông Tin / Lịch / Cấu Hình / Đăng Ký / Bracket / Tài Chính) đều hoạt động theo `selectedDivisionId`

---

## 🚧 CÒN TỒN ĐỌNG — 3 MỤC DEFER (CÓ LÝ DO)

---

### MỤC 1: Auto `resolveRegistrationDivision` theo gender

**Tình trạng hiện tại:**  
Không implement. Không có method `resolveRegistrationDivision` trong `tournaments.service.ts`.

**Lý do defer — phân tích kỹ:**

Cơ chế auto-detect gender → division **không khả thi với flow đăng ký hiện tại** vì:

1. **Doubles cần 2 user:** Gender check phải dựa trên CẢ HAI người trong cặp, nhưng `RegisterTournamentDto` hiện tại chỉ nhận 1 user (người đăng ký). Người thứ 2 join sau qua `team_invite_token`. Lúc join mới biết gender cặp là gì.

2. **Payments đã gắn divisionId:** Nếu auto-detect sai division → payment ghi nhầm division → hoàn phí phức tạp, không có flow rollback.

3. **Rosters join sau:** Trong doubles, player 2 join sau khi team đã tạo. Nếu player 2 gender không khớp với division đã đăng ký → phải kick toàn team hay chỉ cảnh báo? Logic phức tạp.

**Quyết định thiết kế (thay thế auto):**

> **FE filter danh sách division theo gender của user đang đăng nhập, để user tự chọn.**

Cụ thể:
- Gọi `GET /tournaments/:id/divisions`
- Ở client, filter: chỉ hiển thị division phù hợp với `currentUser.gender`
  - `gender = 'MALE'` → hiện divisions có `gender_restriction = 'MALE'` hoặc `'MIXED'`
  - `gender = 'FEMALE'` → hiện divisions có `gender_restriction = 'FEMALE'` hoặc `'MIXED'`
  - Chưa có gender trong profile → hiện tất cả nhưng nhắc cập nhật profile trước
- Không cần thay đổi gì ở backend
- Không có risk payment/roster

**File cần sửa khi implement:** Chỉ FE: trang đăng ký public tournament.

---

### MỤC 2: Bracket generation per-division

**Tình trạng hiện tại:**  
`bracket-generator.service.ts` — cả 3 method đều query participants theo `tournamentId` không theo `divisionId`:

```ts
// Line 27-30, 181-184, 583-586 — tất cả 3 method đều giống nhau
const participants = await tx
  .select()
  .from(schema.tournamentParticipants)
  .where(eq(schema.tournamentParticipants.tournamentId, tournamentId));
  // ← KHÔNG filter theo divisionId
```

Stage insert cũng không set `tournamentDivisionId`:
```ts
await tx.insert(schema.tournamentStages).values({
  tournamentId,
  name: 'Elimination Stage',
  type: 'SINGLE_ELIMINATION',
  order: 1,
  // ← không có tournamentDivisionId
})
```

**Lý do defer:**

Refactor ảnh hưởng **toàn bộ 3 thuật toán** (Single Elimination, Double Elimination, Round Robin) và **contract API**:
- Thêm tham số `divisionId` vào cả 3 method
- Thêm filter `WHERE tournament_division_id = divisionId` vào query participants
- Thêm `tournamentDivisionId` khi insert stages
- API endpoint `POST /tournaments/:id/bracket/generate` cần nhận thêm `divisionId` trong body

**Impact nếu refactor sai:** Bracket bị sinh nhầm participant của division khác → data corrupt, khó rollback.

**Kế hoạch khi làm:**

```ts
// Signature mới
async generateSingleElimination(
  tournamentId: string,
  userId: string,
  divisionId?: string   // ← optional để backward compat
) {
  // Query participants
  const whereClause = divisionId
    ? and(
        eq(schema.tournamentParticipants.tournamentId, tournamentId),
        eq(schema.tournamentParticipants.tournamentDivisionId, divisionId)
      )
    : eq(schema.tournamentParticipants.tournamentId, tournamentId);

  const participants = await tx
    .select()
    .from(schema.tournamentParticipants)
    .where(whereClause);

  // Stage insert
  await tx.insert(schema.tournamentStages).values({
    tournamentId,
    tournamentDivisionId: divisionId ?? null,  // ← thêm dòng này
    name: 'Elimination Stage',
    ...
  });
}
```

**Thứ tự làm khi undefer:**
1. Sửa cả 3 method trong `bracket-generator.service.ts`
2. Sửa `tournaments.service.ts` — method `generateBracket` truyền `divisionId` xuống
3. Sửa `tournaments.controller.ts` — nhận `divisionId` từ body/query
4. Sửa FE — khi generate bracket, gửi kèm `divisionId` của division đang chọn

---

### MỤC 3: Chạy `drizzle-kit push` lên DB dev

**Tình trạng:**  
Migration SQL đã được viết vào schema Drizzle. Chưa apply lên database thật.

**Lệnh cần chạy (1 lần, trên máy dev):**
```bash
cd backend-api_qlgiaidau
pnpm drizzle-kit push
```

> ⚠️ Phải chạy trước khi start server nếu schema có thay đổi mới, nếu không sẽ lỗi column not found.

**Không phải issue code, chỉ là setup action.**

---

## 🐛 BUG FE CẦN SỬA (PHÁT HIỆN QUA UX AUDIT)

### BUG BLOCKER — `isActive` sai logic, badge không highlight đúng

**File:** `frontend-web_qlgiaidau/src/app/organizer/tournaments/[id]/manage/page.tsx`  
**Dòng:** 1064

```ts
// ❌ HIỆN TẠI — luôn false vì div.id không bao giờ = tournament.id
const isActive = div.id === tournament.id;

// ✅ SỬA THÀNH
const isActive = div.id === selectedDivisionId;
```

**Hệ quả:** Badge hình thức thi đấu không bao giờ hiện trạng thái "đang chọn" (màu xanh). Số participant trên badge cũng hiển thị màu sai.

---

### BUG UX — Hai control chọn division trùng nhau

**Dòng:** 1042–1093

Có đồng thời `<select>` dropdown VÀ dãy badge-button đều bind vào `selectedDivisionId`. Xóa `<select>` dropdown đi, chỉ giữ badge-button.

---

### BUG UX — Nút X xóa division nằm trong badge, dễ bấm nhầm

**Dòng:** 1082–1090

Badge nhỏ (max-w-[100px]), nút X sát vùng click chọn. Cần tách nút xóa ra menu riêng hoặc hover-only + thêm confirm dialog.

---

## 📌 THỨ TỰ ƯU TIÊN THỰC HIỆN TIẾP THEO

| # | Việc | File | Mức độ |
|---|---|---|---|
| 1 | Fix bug `isActive` sai | `manage/page.tsx:1064` | 🔴 Ngay |
| 2 | Xóa `<select>` trùng lặp | `manage/page.tsx:1042–1052` | 🔴 Ngay |
| 3 | Tách nút X khỏi badge + confirm | `manage/page.tsx:1082–1090` | 🔴 Ngay |
| 4 | Chạy `drizzle-kit push` trên DB dev | terminal | 🟡 Trước khi test |
| 5 | FE filter division theo gender khi đăng ký | trang public register | 🟡 Sprint sau |
| 6 | Refactor bracket generator per-division | `bracket-generator.service.ts` | 🟢 Sprint sau |

---

## 📌 YÊU CẦU MỚI: BẮT BUỘC ĐIỀN ĐẦY ĐỦ HỒ SƠ CÁ NHÂN TRƯỚC KHI ĐĂNG KÝ

### Bối cảnh
User mới tạo tài khoản có thể chưa điền đủ thông tin profile. Nếu để họ đăng ký giải đấu mà thiếu giới tính/ngày sinh/điện thoại → ảnh hưởng tới filter division theo gender và liên lạc khi cần.

### Các trường bắt buộc (từ bảng `profiles`)

| Cột | Lý do bắt buộc |
|---|---|
| `full_name` | Tên hiển thị trên bracket, danh sách participant |
| `phone_number` | BTC cần liên hệ khẩn nếu cần |
| `date_of_birth` | Một số giải có giới hạn độ tuổi |
| `gender` | Để FE filter danh sách division phù hợp |

### Vị trí cần thêm guard — Backend

**3 điểm entry đăng ký**, đều trong `tournaments.service.ts`:

```
1. register()         — POST /tournaments/:id/register
2. joinTeam()         — POST /tournaments/:id/join-team  (đồng đội join cặp đôi)
3. joinByInviteCode() — POST /join/:inviteCode           (đăng ký qua link mời)
```

### Cách implement (Backend)

**Bước 1 — Thêm method vào `tournaments.repository.ts`:**
```ts
async findUserProfile(userId: string) {
  const [profile] = await this.db
    .select({
      fullName: schema.profiles.fullName,
      phoneNumber: schema.profiles.phoneNumber,
      dateOfBirth: schema.profiles.dateOfBirth,
      gender: schema.profiles.gender,
    })
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, userId))
    .limit(1);
  return profile ?? null;
}
```

**Bước 2 — Thêm private helper vào `tournaments.service.ts`:**
```ts
private async validateProfileComplete(userId: string): Promise<void> {
  const profile = await this.tournamentsRepository.findUserProfile(userId);

  if (!profile) {
    throw new BadRequestException(
      'Bạn chưa có thông tin cá nhân. Vui lòng cập nhật hồ sơ trước khi đăng ký giải đấu.',
    );
  }

  const missing: string[] = [];
  if (!profile.fullName?.trim()) missing.push('Họ và tên');
  if (!profile.phoneNumber?.trim()) missing.push('Số điện thoại');
  if (!profile.dateOfBirth) missing.push('Ngày sinh');
  if (!profile.gender?.trim()) missing.push('Giới tính');

  if (missing.length > 0) {
    throw new BadRequestException(
      `Hồ sơ cá nhân còn thiếu: ${missing.join(', ')}. Vui lòng cập nhật trước khi đăng ký giải đấu.`,
    );
  }
}
```

**Bước 3 — Gọi ở đầu mỗi method entry:**
```ts
async register(...) {
  await this.validateProfileComplete(userId);  // ← thêm dòng này đầu tiên
  // ... logic hiện tại
}

async joinTeam(...) {
  await this.validateProfileComplete(userId);  // ← đồng đội cũng phải đủ hồ sơ
  // ... logic hiện tại
}

async joinByInviteCode(...) {
  await this.validateProfileComplete(userId);  // ← qua link mời cũng phải check
  // ... logic hiện tại
}
```

### Xử lý ở Frontend

Khi API trả về lỗi `400` với message chứa "thiếu thông tin bắt buộc":
- Hiển thị toast/dialog rõ ràng: **"Hồ sơ của bạn chưa đầy đủ"**
- Có nút **"Cập nhật hồ sơ ngay"** → redirect tới `/profile/edit`
- Sau khi cập nhật xong → user quay lại trang giải và đăng ký lại

### Không cần thay đổi

- Schema DB — `profiles` table đã có đủ các cột cần thiết
- DTO `RegisterTournamentDto` — không đổi
- Controller — không đổi, guard nằm trong service

---

## ⚠️ RỦI RO ĐÃ BIẾT — CẦN XỬ LÝ TRONG SPRINT SAU

### RỦI RO 1 — TeamsTab / BracketTab public vẫn dùng logic legacy "division là tournament id"

**Mô tả:**  
Các tab công khai ở trang chi tiết giải (`TeamsTab.tsx`, `BracketTab.tsx`) vẫn có logic cũ dạng: fetch data bằng `tournamentId` thay vì `divisionId`. Chưa refactor trong lượt này.

**Biểu hiện:**  
Khi giải có nhiều division, tab Teams và Bracket có thể hiển thị lẫn dữ liệu của tất cả division thay vì đúng division đang chọn.

**Việc cần làm:**
- Audit `TeamsTab.tsx` và `BracketTab.tsx` — tìm mọi chỗ gọi API bằng `tournamentId` mà đáng lẽ phải dùng `divisionId`
- Thêm division selector ở trang public detail nếu giải có nhiều division
- Truyền `divisionId` vào các API call tương ứng

**Files cần sửa:**
```
frontend-web_qlgiaidau/src/app/(public)/tournaments/[id]/components/TeamsTab.tsx
frontend-web_qlgiaidau/src/app/(public)/tournaments/[id]/components/BracketTab.tsx
```

---

### RỦI RO 2 — Dữ liệu cũ có `tournament_division_id = NULL` không hiện trong endpoint per-division

**Mô tả:**  
Endpoint `GET /tournaments/:id/divisions/:divId/participants` query bằng `WHERE tournament_division_id = divisionId`. Các participant đăng ký trước khi có hệ thống division (hoặc khi tournament chưa có division nào) sẽ có `tournament_division_id = NULL` → không hiện ra.

**Biểu hiện:**  
Giải đấu cũ có participant nhưng tab division hiển thị 0 người.

**Hướng xử lý (chọn 1 trong 2):**

**Phương án A — Migration script (nếu muốn gán lại):**
```sql
-- Gán toàn bộ participant null vào division đầu tiên của tournament đó
UPDATE tournament_participants tp
SET tournament_division_id = (
  SELECT id FROM tournament_divisions td
  WHERE td.tournament_id = tp.tournament_id
  ORDER BY td.created_at ASC
  LIMIT 1
)
WHERE tp.tournament_division_id IS NULL
  AND EXISTS (
    SELECT 1 FROM tournament_divisions td2
    WHERE td2.tournament_id = tp.tournament_id
  );
```

**Phương án B — Fallback trong query (không migration):**  
Sửa endpoint `getParticipantsByDivision` để nếu `divisionId = null` hoặc là sentinel value thì trả về toàn bộ participant của tournament (backward compat).

**Khuyến nghị:** Phương án B an toàn hơn, không làm hỏng data cũ.

---

### RỦI RO 3 — Đôi Mixed khi chưa có partner sẽ bị chặn, FE cần UX rõ ràng

**Mô tả:**  
Flow đăng ký đôi (Doubles / Mixed Doubles) hiện tại: người đăng ký tạo team trước, sau đó gửi link mời cho partner. Nếu partner chưa join mà BTC chốt danh sách sớm → team bị incomplete, có thể bị loại.

Đây là **hành vi đúng và an toàn** (không auto-map mù), nhưng FE hiện tại chưa có UX hướng dẫn rõ cho người đăng ký đôi biết phải làm gì tiếp theo.

**Biểu hiện:**  
User đăng ký đôi xong thấy status `PENDING`, không biết cần mời partner, không thấy link mời ở đâu, bỏ quên dẫn đến team incomplete.

**Việc cần làm ở FE:**

1. **Sau khi đăng ký đôi thành công** → hiển thị modal/banner rõ:
   ```
   ✅ Đăng ký thành công!
   ─────────────────────────────────────────
   Bạn đã tạo team [Tên đội]. Hãy mời đồng đội:
   [Link mời: baseline.vn/join/ABC123] [Copy]
   
   ⚠️ Team cần 2 người mới hợp lệ.
   Đồng đội phải confirm trước ngày [ngày chốt].
   ```

2. **Trong trang "Giải đấu của tôi"** → hiển thị trạng thái team rõ:
   - `PENDING (Chờ đồng đội)` với nút "Xem link mời"
   - `COMPLETE (2/2 người)` khi đủ thành viên

3. **Khi chọn division Mixed Doubles** → tooltip/hint: *"Hình thức này cần 1 nam + 1 nữ. Bạn sẽ nhận link mời để gửi cho đồng đội sau khi đăng ký."*

**Files cần sửa:**
```
frontend-web_qlgiaidau/src/app/(public)/tournaments/[id]/... (trang đăng ký + confirmation)
frontend-web_qlgiaidau/src/app/(player)/my-tournaments/... (trang danh sách giải của tôi)
```

---

## 📊 TỔNG HỢP RỦI RO

| # | Rủi ro | Mức độ | Phương án xử lý | Sprint |
|---|---|---|---|---|
| 1 | TeamsTab/BracketTab legacy division logic | 🟡 Medium | Refactor 2 file FE | Sprint sau |
| 2 | Data cũ `division_id = NULL` không hiện | 🟡 Medium | Fallback query trong repo | Sprint sau |
| 3 | Doubles partner UX chưa rõ ràng | 🟡 Medium | Thêm confirmation UI + hint | Sprint sau |

---

## 🔍 AUDIT LEGACY CODE — `tournament.id === division_id`

> Scan toàn bộ codebase tìm nơi dùng `tournament.id` như là `divisionId`. Theo schema mới, `tournament_id ≠ division_id` — cần truyền `divisionId` riêng.

---

### FILE 1: `BracketTab.tsx` — **LỖI NGHIÊM TRỌNG**

**Path:** `frontend-web_qlgiaidau/src/app/(public)/tournaments/[id]/components/BracketTab.tsx`

**Dòng 746:**
```ts
// ❌ LEGACY — dùng tournament.id như division_id
export default function BracketTab({ tournament, onScheduleMatch }: Props) {
  const divisionId = tournament.id;  // ← SAI: tournament.id ≠ division.id

  // Dòng 755 — gọi API bracket bằng tournament.id thay vì division.id
  const res = await tournamentsApi.getTournamentBracket(divisionId);
```

**Vấn đề:** `tournamentsApi.getTournamentBracket(tournamentId, divisionId?)` nhận `tournamentId` ở param 1, `divisionId` optional ở param 2. Nhưng ở đây truyền `tournament.id` vào param 1 → **đúng cho single division**, nhưng nếu giải có nhiều division thì bracket của division nào cũng load chung một đống.

**Sửa cần làm:**
```ts
// ✅ MỚI — nhận divisionId từ props, không tự suy luận
interface Props {
  tournament: Tournament;
  divisionId?: string;       // ← thêm prop này
  onScheduleMatch?: OnScheduleMatch;
}

export default function BracketTab({ tournament, divisionId, onScheduleMatch }: Props) {
  // Dòng fetch:
  const res = await tournamentsApi.getTournamentBracket(tournament.id, divisionId);
  //                                                    ↑ tournamentId  ↑ divisionId filter
```

**Nơi truyền divisionId vào:** `TournamentDetailClient.tsx` — khi render `<BracketTab>` cần thêm prop `divisionId={selectedDivisionId}`.

---

### FILE 2: `MatchesTab.tsx` — **LỖI NGHIÊM TRỌNG**

**Path:** `frontend-web_qlgiaidau/src/app/(public)/tournaments/[id]/components/MatchesTab.tsx`

**Dòng 13–14:**
```ts
// ❌ LEGACY — comment còn thừa nhận đây là legacy
// divisionId is implicitly tournament.id - this is the division/tournament being viewed
const divisionId = tournament.id;

// Dòng 24–26
const res = await tournamentsApi.getOngoingMatches({
  tournament_id: divisionId,  // ← filter theo tournament_id, không có division filter
  status: '',
  limit: 100,
});
```

**Vấn đề:** API `/matches` filter theo `tournament_id` — nghĩa là lấy **tất cả matches của tournament**, không phân biệt division. Khi giải có nhiều division (Đơn Nam + Đôi Nam + Nam Nữ), tab Matches sẽ hiện lẫn tất cả.

**Sửa cần làm:**
```ts
// ✅ MỚI
interface Props {
  tournament: Tournament;
  divisionId?: string;   // ← thêm prop
}

export default function MatchesTab({ tournament, divisionId }: Props) {
  // Khi có divisionId thì thêm vào filter
  const res = await tournamentsApi.getOngoingMatches({
    tournament_id: tournament.id,
    division_id: divisionId,   // ← backend cần support query param này
    status: '',
    limit: 100,
  });
```

**Backend cần thêm:** `GET /matches?division_id=xxx` — query filter theo `tournament_division_id` trong bảng matches.

---

### FILE 3: `TeamsTab.tsx` — **LỖI TRUNG BÌNH**

**Path:** `frontend-web_qlgiaidau/src/app/(public)/tournaments/[id]/components/TeamsTab.tsx`

**Dòng 21:**
```ts
// ❌ LEGACY
const res = await tournamentsApi.getTournamentParticipants(tournament.id);
// → GET /tournaments/:id/participants → trả về TẤT CẢ participant của tournament
// → không phân biệt division nào
```

**Vấn đề:** Đây là endpoint cũ `GET /tournaments/:id/participants`. Endpoint mới per-division là `GET /tournaments/:id/divisions/:divisionId/participants` (đã có trong `divisionsApi.getDivisionParticipants`).

**Sửa cần làm:**
```ts
// ✅ MỚI
import { divisionsApi } from '@/features/tournaments/api';

interface Props {
  tournament: Tournament;
  divisionId?: string;   // ← thêm prop
}

export default function TeamsTab({ tournament, divisionId }: Props) {
  useEffect(() => {
    if (divisionId) {
      // Lấy participant của division cụ thể
      const res = await divisionsApi.getDivisionParticipants(tournament.id, divisionId);
    } else {
      // Fallback: lấy tất cả (backward compat cho giải chưa có division)
      const res = await tournamentsApi.getTournamentParticipants(tournament.id);
    }
  }, [tournament.id, divisionId]);
```

---

### FILE 4: `TournamentDetailClient.tsx` — **CẦN CẬP NHẬT PROPS**

**Path:** `frontend-web_qlgiaidau/src/app/(public)/tournaments/[id]/TournamentDetailClient.tsx`

**Dòng 70 — tốt:** Đã có `selectedDivisionId` state và set từ `divisionsList[0].id` ✅

**Dòng bị thiếu:** Khi render các Tab, chưa truyền `divisionId` xuống:
```tsx
// Cần tìm chỗ render <TeamsTab>, <BracketTab>, <MatchesTab> trong file này
// và thêm prop divisionId={selectedDivisionId}
// (cần xem phần render tabs — không hiển thị trong đoạn đã xem)
```

---

### FILE 5: Backend — `GET /matches` chưa có filter `division_id`

**Path:** `backend-api_qlgiaidau/src/modules/...` (matches controller/repository)

**Hiện tại:** Query matches chỉ filter theo `tournament_id`. Cần thêm optional `division_id` filter:
```sql
-- Thêm WHERE clause
WHERE tournament_id = $1
  AND ($2::uuid IS NULL OR tournament_division_id = $2)
```

---

### Bảng tổng hợp legacy fixes

| File | Dòng | Vấn đề | Sửa | Priority |
|---|---|---|---|---|
| `BracketTab.tsx` | 746 | `divisionId = tournament.id` | Thêm prop `divisionId`, truyền vào `getTournamentBracket(id, divisionId)` | 🔴 Cao |
| `MatchesTab.tsx` | 13–14 | `divisionId = tournament.id`, không filter division | Thêm prop `divisionId`, truyền vào query `division_id` | 🔴 Cao |
| `TeamsTab.tsx` | 21 | Dùng endpoint cũ lấy tất cả participant | Switch sang `divisionsApi.getDivisionParticipants` khi có divisionId | 🔴 Cao |
| `TournamentDetailClient.tsx` | render tabs | Chưa truyền `divisionId` xuống các Tab | Thêm prop `divisionId={selectedDivisionId}` vào `<BracketTab>`, `<TeamsTab>`, `<MatchesTab>` | 🟡 Cần sau khi sửa 3 file trên |
| Backend `/matches` | query | Không có filter `division_id` | Thêm optional `division_id` WHERE clause | 🟡 Khi cần MatchesTab đúng |

---

## 🆕 ĐỀ XUẤT TÍNH NĂNG — RỦI RO 3 MỞ RỘNG: Pre-select Mode Trước Khi Đăng Ký

> **Câu hỏi của bạn:** "Có nên thêm kiểu cá nhân có thể tự ghép cặp đôi hoặc chọn đơn hoặc đôi với người khác có thể chọn trước không rồi vào form đăng ký sau?"

**TL;DR: CÓ — và đây là design đúng hướng.**

---

### Vấn đề hiện tại của flow đăng ký

```
Hiện tại:
[Trang giải] → [Bấm Đăng ký] → [Chọn division] → [Điền form] → [Submit]

Vấn đề:
- Người dùng chưa biết mình sẽ thi đơn hay đôi trước khi vào form
- Với giải có 3-4 division, form đăng ký chưa rõ đang đăng ký cho division nào
- Doubles: không biết partner là ai, không biết có thể đăng ký trước không
```

---

### Thiết kế đề xuất: "Pre-selection Card" trước form đăng ký

#### Bước 0 — Màn hình chọn kiểu tham gia (trước khi vào form)

```
╔═══════════════════════════════════════════════════════╗
║  🏆 Hanoi Open Spring 2026                           ║
║  Bạn muốn tham gia hình thức nào?                    ║
╠═══════════════════════════════════════════════════════╣
║                                                       ║
║  [🧍 Đơn Nam]          [🧍 Đơn Nữ]                  ║
║  Thi đấu cá nhân        Thi đấu cá nhân              ║
║  Còn 5 slot             Còn 8 slot                   ║
║                                                       ║
║  [👫 Đôi Nam]          [👩 Đôi Nữ]                  ║
║  Cần 2 người nam        Cần 2 người nữ               ║
║  Còn 3 cặp              Còn 6 cặp                    ║
║                                                       ║
║  [👫👩 Nam Nữ]                                       ║
║  1 nam + 1 nữ                                        ║
║  Còn 4 cặp                                           ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
```

**Logic filter theo gender:**
- User `gender = MALE` → **ẩn** "Đơn Nữ", "Đôi Nữ"; hiện "Đơn Nam", "Đôi Nam", "Nam Nữ"
- User `gender = FEMALE` → **ẩn** "Đơn Nam", "Đôi Nam"; hiện "Đơn Nữ", "Đôi Nữ", "Nam Nữ"
- User chưa set gender → hiện tất cả kèm hint "Cập nhật giới tính để được gợi ý phù hợp"

---

#### Bước 1A — Nếu chọn Đơn (Singles)

Form đơn giản:
```
Tên đội / Tên hiển thị: [________________]
[Đăng ký ngay]
```

Sau khi submit → confirm screen → done.

---

#### Bước 1B — Nếu chọn Đôi (Doubles)

Thêm bước chọn kiểu ghép cặp:

```
╔═══════════════════════════════════════════╗
║  👫 Đôi Nam — Bạn đã có đồng đội chưa?  ║
╠═══════════════════════════════════════════╣
║                                           ║
║  [✅ Tôi biết đồng đội rồi]              ║
║  Nhập email/SĐT của họ để mời ngay       ║
║                                           ║
║  [🔍 Tìm đồng đội trong hệ thống]        ║
║  Xem danh sách người cần tìm cặp         ║
║                                           ║
║  [📋 Đăng ký trước, mời sau]             ║
║  Nhận link mời để gửi cho đồng đội       ║
║                                           ║
╚═══════════════════════════════════════════╝
```

---

#### Option mới: "Tìm đồng đội trong hệ thống" (Looking for Partner — LFP)

**Đây là tính năng hoàn toàn mới, cần plan riêng:**

```
Luồng:
1. User chọn "Tìm đồng đội"
2. User đăng ký vào danh sách "Looking for Partner" của division đó
3. Trang giải hiện tab "Tìm đồng đội" với danh sách người cần cặp
4. Người khác vào xem → click "Ghép cặp với [Tên]" → cả 2 nhận notification confirm
5. Nếu cả 2 đồng ý → hệ thống auto tạo team và đăng ký luôn
```

**Data model cần thêm:**
```sql
-- Bảng mới (đơn giản)
CREATE TABLE tournament_lfp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  tournament_division_id UUID REFERENCES tournament_divisions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  message TEXT,  -- "Tìm đồng đội nữ, ELO ~1200"
  status VARCHAR(20) DEFAULT 'OPEN',  -- OPEN | MATCHED | WITHDRAWN
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  matched_with UUID REFERENCES users(id)  -- khi đã ghép xong
);

UNIQUE(tournament_division_id, user_id);  -- 1 người chỉ đăng ký LFP 1 lần/division
```

---

### Phân tích: Nên làm hay không?

| Tiêu chí | Kết quả |
|---|---|
| UX rõ ràng hơn cho user | ✅ Rất rõ — không phải đoán |
| Giảm incomplete doubles team | ✅ LFP giúp tự ghép |
| Phức tạp implement | ⚠️ Pre-selection: đơn giản; LFP: cần bảng mới + notification |
| Risk payment | ✅ Thấp — payment chỉ tạo sau khi team COMPLETE |
| Ảnh hưởng backend hiện tại | LFP cần thêm bảng + API; pre-selection chỉ là FE |

**Khuyến nghị:**
- **Sprint này:** Implement Pre-selection card (chỉ FE, không cần backend)
- **Sprint sau:** Implement LFP (cần bảng DB + API + notification)

---

### Files cần làm cho Pre-selection (chỉ FE)

```
frontend-web_qlgiaidau/src/app/(public)/tournaments/[id]/register/
  ├── page.tsx                  ← thêm bước 0 chọn division trước form
  └── components/
      ├── DivisionPickStep.tsx  ← [NEW] card chọn hình thức thi đấu
      └── DoublesPickStep.tsx   ← [NEW] chọn kiểu ghép đôi
```

### Files cần làm cho LFP (FE + BE)

```
backend:
  - tournament_lfp.schema.ts    ← [NEW] Drizzle schema
  - tournament-lfp.repository   ← [NEW]
  - tournament-lfp.service      ← [NEW]
  - /tournaments/:id/divisions/:divId/lfp  ← [NEW] endpoint

frontend:
  - LFPTab.tsx                  ← [NEW] tab trong trang chi tiết giải
  - /register/components/LFPRegistrationFlow.tsx  ← [NEW]
```

---

## 🎾 UX DESIGN — FLOW ĐĂNG KÝ ĐÔI CHO 2 NGƯỜI

> **Bối cảnh:** Người dùng muốn đăng ký cùng đồng đội ngay từ đầu (không phải dạng "đăng ký trước mời sau"). Nghiên cứu UX pattern tốt nhất cho doubles registration.

---

### Phân tích flow hiện tại (`DoublesRegistrationFlow.tsx`)

```
HIỆN TẠI (3 bước):
Step 1: Người A tạo đội → tìm đồng đội theo email/SĐT (hoặc bỏ qua)
Step 2: Người A chờ → nhận link mời → gửi cho Người B
Step 3: Người B nhấn link → vào trang join-team → xác nhận → đội hoàn chỉnh
```

**Điểm yếu của flow hiện tại:**
1. **Người B bị bị động hoàn toàn** — chỉ có thể accept link, không có agency
2. **Bất đối xứng UX** — Người A điền nhiều, Người B chỉ click "Đồng ý"
3. **Không có xác nhận 2 chiều** — Người A có thể đặt tên đội mà Người B không đồng ý
4. **Polling mỗi 3 giây** — không realtime, UX chờ kém
5. **Người B phải tạo account trước** — barrier cao

---

### Nghiên cứu UX các app thực tế (Benchmarking)

| App | Cách xử lý doubles | Điểm hay |
|---|---|---|
| **Challonge** | Captain tạo team, thêm member bằng username | Đơn giản, không cần confirm |
| **Toornament** | Team có 1 captain, thêm players sau | Captain kiểm soát đội |
| **Smash.gg / start.gg** | Mỗi người tự đăng ký role (player), sau đó team up | Agency cho cả 2 |
| **Badminton World Federation** | Captain điền cả 2 thông tin (2 form fields) | Submit 1 lần |
| **Tennis (Lichess kiểu)** | Cả 2 vào cùng trang → 1 đăng ký cho 2 | Realtime |

**Kết luận benchmark:** Với giải đấu nghiệp dư (casual), pattern phổ biến nhất là:
> **Captain điền cả 2 người + xác nhận qua email/SMS** → nhanh nhất

---

### 3 Pattern UX có thể áp dụng

---

#### PATTERN A — "Captain điền cả 2 người" ⭐ KHUYẾN NGHỊ

```
Flow:
┌─────────────────────────────────────────────────────┐
│ Bước 1: Người A (Captain) điền form đội             │
│   • Tên đội: [_______________]                      │
│   • Thành viên 1: [Bạn — tự động]                  │
│   • Thành viên 2: [Email / SĐT đồng đội]           │
│   [TÌM] → hiện avatar + tên nếu có trong hệ thống  │
│                                                      │
│ Bước 2: Submit → hệ thống tạo team, gửi noti cho B │
│   → Người B nhận notification: "A đã đăng ký bạn   │
│     vào đội [Tên đội] tại [Giải]. Xác nhận?"       │
│                                                      │
│ Bước 3A (B có tài khoản): Bấm "Xác nhận" → done    │
│ Bước 3B (B chưa có TK): Link mời → tạo TK → done   │
└─────────────────────────────────────────────────────┘
```

**Ưu điểm:**
- ✅ Người A submit 1 lần, không phải chờ màn hình polling
- ✅ Người B được thông báo rõ ràng (push notification / email)
- ✅ Người B vẫn có quyền từ chối (consent)
- ✅ Nếu B chưa có tài khoản → link mời vẫn hoạt động như cũ

**Nhược điểm:**
- ⚠️ Cần thêm notification system (nếu chưa có)
- ⚠️ Người A có thể đặt tên đội mà B không thích (nhưng thực tế ổn)

**Khác biệt với flow hiện tại:**
- Hiện tại: Người A chờ → Người B nhấn link → confirm
- Pattern A: Người A submit → Người B nhận noti → confirm (không cần link share thủ công)

---

#### PATTERN B — "Cùng đăng ký một lần" (Simultaneous)

```
Flow:
Cả 2 người cùng có mặt → Người A mở trang đăng ký
→ Người A nhập thông tin 2 người → Submit
→ Hệ thống gửi OTP/confirm cho cả 2
→ Cả 2 xác nhận OTP → team COMPLETE

Hoặc: Người A tạo "session" → share link tới B
→ Cả 2 điền vào cùng 1 form realtime (Google Docs kiểu)
```

**Ưu điểm:**
- ✅ Trải nghiệm tốt nhất khi 2 người ngồi cạnh nhau
- ✅ Không cần polling

**Nhược điểm:**
- ❌ Quá phức tạp để implement (realtime session, OTP flow)
- ❌ Không phù hợp khi 2 người không ở cùng nhau

**Kết luận: Không nên làm** — over-engineer cho use case ít gặp.

---

#### PATTERN C — "Người B tự accept role" (hiện tại cải tiến)

```
Flow hiện tại nhưng cải tiến:
1. Người A tạo đội (như cũ)
2. Hệ thống tự gửi noti/email cho B (thay vì chờ A copy link thủ công)
3. B nhấn noti → vào app → thấy "Bạn được mời vào đội [X]"
4. B bấm "Chấp nhận" → done (không cần nhập thêm gì)
```

**Đây là cải tiến nhỏ nhất từ flow hiện tại, ít rủi ro nhất.**

---

### So sánh 3 Pattern

| Tiêu chí | Pattern A | Pattern B | Pattern C |
|---|---|---|---|
| UX người A | ✅ Nhanh nhất | ✅ Tốt | ✅ Tốt |
| UX người B | ✅ Chủ động (confirm) | ✅ Tốt nhất | 🟡 Phụ thuộc notification |
| Cần backend mới | Thêm noti | Nhiều | Thêm noti |
| Rủi ro implement | Thấp | Cao | Thấp |
| **Khuyến nghị** | ⭐ **Làm ngay** | ❌ Bỏ qua | 🟡 Bước đầu tạm OK |

---

### Quyết định thiết kế

**Làm ngay (ít thay đổi nhất, UX tốt nhất):**

Giữ `DoublesRegistrationFlow.tsx` nhưng cải tiến **Step 1** và **Step 2**:

**Step 1 — Cải tiến:**
```
HIỆN TẠI:
- Tìm đối tác theo email/SĐT
- Checkbox "Mời sau"

MỚI:
- Tìm đối tác theo email/SĐT (giữ)
- Hiển thị rõ: "Đồng đội sẽ nhận thông báo để xác nhận"
- Bỏ checkbox "Mời sau" → chỉ còn 2 option rõ ràng:
  [Tôi biết đồng đội rồi → nhập email/SĐT]
  [Gửi link mời → tôi tự share]
```

**Step 2 — Cải tiến:**
```
HIỆN TẠI:
- Hiện QR code + link để A tự copy
- Polling 3 giây

MỚI:
- Nếu B đã tìm thấy trong hệ thống → Step 2 hiện:
  "Đã gửi thông báo đến [Tên B]. Chờ B xác nhận..."
  (realtime polling như cũ, nhưng UX message rõ hơn)
- Nếu B chưa có tài khoản → vẫn hiện link/QR như cũ
- Thêm nút "Gửi lại thông báo" nếu B chưa confirm sau 10 phút
```

**Step 3 — Giữ nguyên** (đội COMPLETE → payment)

---

### Plan implement cụ thể

**Thay đổi FE (không cần backend mới):**

1. **`DoublesRegistrationFlow.tsx`** — Refactor Step 1 UI:
   - Xóa checkbox `inviteLater` → thay bằng 2 radio button rõ ràng
   - Cải thiện message ở Step 2 tùy theo có tìm thấy B trong hệ thống hay không

2. **`register/page.tsx`** — Trước khi vào `DoublesRegistrationFlow`:
   - Bỏ `<select>` dropdown chọn division (xấu, cứng) → thay bằng card picker đẹp hơn
   - Hiện số slot còn lại của từng division

**Thay đổi BE (nếu có notification system):**
- `register()` service: sau khi tạo team → trigger notification tới `partnerEmailOrPhone` user (nếu đã có account)
- Notification: "Bạn được mời vào đội `[teamName]` ở giải `[tournamentName]`. [Xác nhận]"

**Files cần sửa:**

```
frontend-web_qlgiaidau/src/app/(public)/tournaments/[id]/register/
  ├── page.tsx                           ← thay dropdown → card picker
  └── components/
      └── DoublesRegistrationFlow.tsx    ← refactor Step 1 UI + Step 2 message
```

---

### Mockup Step 1 mới (text-based)

```
┌──────────────────────────────────────────────────────────────┐
│ 👫 Đôi Nam — Tạo Đội                                        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ Tên đội:  [Song Hùng Hà Nội_____________]                   │
│                                                              │
│ Đồng đội của bạn:                                           │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ ● Nhập email/SĐT để tìm ngay trong hệ thống           │  │
│ │   [email hoặc SĐT_______________] [Tìm]               │  │
│ │                                                        │  │
│ │   → Tìm thấy: [Avatar] Nguyễn Văn B • 1250 ELO        │  │
│ │     Hệ thống sẽ gửi thông báo để họ xác nhận          │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                              │
│ ─── hoặc ───                                                 │
│                                                              │
│ ○ Gửi link/QR mời — Tôi sẽ tự chia sẻ cho đồng đội        │
│                                                              │
│ Lệ phí: 200,000đ × 2 người = 400,000đ                      │
│                                                              │
│              [✅ Đăng ký & Ghép cặp]                        │
└──────────────────────────────────────────────────────────────┘
```

---

## 🔨 PLAN IMPLEMENT — PATTERN A: "Captain điền cả 2 người"

> Đây là bản plan chi tiết để implement Pattern A vào codebase hiện tại.

### Scope thay đổi

**Chỉ cần refactor `DoublesRegistrationFlow.tsx`** — không cần backend mới.  
Backend đã có: `partnerEmailOrPhone` field trong `register()` API → gửi invite khi biết partner.

---

### Step 1 mới — UI Refactor

**Bỏ hoàn toàn:**
- `inviteLater` checkbox (gây nhầm lẫn, UX kém)

**Thay bằng 2 radio button rõ ràng:**

```tsx
// RadioGroup thay thế checkbox
type PartnerMode = 'search' | 'link';
const [partnerMode, setPartnerMode] = useState<PartnerMode>('search');
```

**Layout mới Step 1:**
```
┌─────────────────────────────────────────────────────┐
│ 👫 Tạo đội — [tên giải] · Đôi Nam                  │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Tên đội *                                           │
│ [_________________________________]                 │
│                                                     │
│ Đồng đội của bạn                                    │
│ ○──────────────────────────────────────────────    │
│ ● Tìm đồng đội trong hệ thống                       │
│   (đồng đội sẽ nhận thông báo để xác nhận)          │
│   [nhập email hoặc SĐT____] [Tìm]                  │
│   ✅ Tìm thấy: Nguyễn Văn B · 1250 ELO             │
│       Thông báo sẽ gửi đến họ để xác nhận.         │
│                                                     │
│ ○ Lấy link/QR rồi tự gửi cho đồng đội              │
│   (phù hợp khi đồng đội chưa có tài khoản)          │
│                                                     │
│ Lệ phí: 200,000đ/người → Tổng 400,000đ             │
│                                                     │
│ ⚠️ Đội cần 2 người mới hợp lệ để thi đấu           │
│                                                     │
│        [✅ Đăng ký & Ghép cặp ngay]                 │
└─────────────────────────────────────────────────────┘
```

---

### Step 2 mới — Phân nhánh theo `partnerMode`

**Nhánh A (search — đã tìm thấy B trong hệ thống):**
```
┌─────────────────────────────────────────────────────┐
│ ✉️ Đã gửi thông báo đến Nguyễn Văn B               │
│                                                     │
│ [Avatar B] Nguyễn Văn B đang được chờ xác nhận...  │
│                                                     │
│ 🔄 Đang kiểm tra tự động...                         │
│ [Kiểm tra ngay] [Gửi lại thông báo]                 │
│                                                     │
│                            [Hủy & Rút lui]          │
└─────────────────────────────────────────────────────┘
```

**Nhánh B (link — B chưa có tài khoản hoặc không tìm được):**
```
┌─────────────────────────────────────────────────────┐
│ 🔗 Link mời đồng đội                               │
│                                                     │
│ [QR Code 176×176]                                   │
│                                                     │
│ Link: [https://…/join-team?pid=…&token=…] [Copy]   │
│                                                     │
│ 🔄 Đang chờ đồng đội nhấp link...                   │
│ [Kiểm tra ngay] [Hủy & Rút lui]                    │
└─────────────────────────────────────────────────────┘
```

---

### Code changes cụ thể trong `DoublesRegistrationFlow.tsx`

**State cũ → mới:**
```ts
// ❌ Xóa:
const [inviteLater, setInviteLater] = useState(false);

// ✅ Thêm:
type PartnerMode = 'search' | 'link';
const [partnerMode, setPartnerMode] = useState<PartnerMode>('search');
```

**Logic submit `handleCreateTeam`:**
```ts
// Cũ:
const partnerEmailOrPhone = inviteLater
  ? undefined
  : (searchedPartner?.email || searchedPartner?.phoneNumber || partnerQuery);

// Mới:
const partnerEmailOrPhone = partnerMode === 'search' && searchedPartner
  ? (searchedPartner.email || searchedPartner.phoneNumber)
  : undefined;
// Nếu partnerMode === 'link' thì không gửi partnerEmailOrPhone
// Backend sẽ tạo team PENDING + return inviteToken
```

**Validation `handleCreateTeam`:**
```ts
// Cũ:
if (!inviteLater && !searchedPartner) {
  toast.error('Vui lòng tìm kiếm và xác nhận đồng đội hoặc chọn "Mời đồng đội sau"');

// Mới:
if (partnerMode === 'search' && !searchedPartner) {
  toast.error('Vui lòng tìm và xác nhận đồng đội trước khi đăng ký');
  return;
}
// partnerMode === 'link' → OK, submit ngay
```

**Step 2 conditional render:**
```tsx
{step === 2 && participant && (
  partnerMode === 'search' && searchedPartner ? (
    <NotificationWaitStep
      partnerName={searchedPartner.fullName}
      partnerAvatar={searchedPartner.avatarUrl}
      onManualCheck={handleManualCheck}
      onWithdraw={handleWithdraw}
      isWithdrawing={isWithdrawing}
    />
  ) : (
    <LinkShareStep   // existing Step 2 UI
      partnerLink={partnerLink}
      qrImageUrl={qrImageUrl}
      onManualCheck={handleManualCheck}
      onWithdraw={handleWithdraw}
      isWithdrawing={isWithdrawing}
    />
  )
)}
```

---

### File cần sửa

| File | Thay đổi |
|---|---|
| `DoublesRegistrationFlow.tsx` | Xóa `inviteLater`, thêm `partnerMode` radio, refactor Step 2 render |
| `register/page.tsx` | Thêm card picker thay dropdown (optional, riêng) |

---

## 🧮 BÀNG LUẬN — ELO CẶP ĐÔI TÍNH NHƯ THẾ NÀO?

> Nghiên cứu từ code thực tế tại `rankings.service.ts` → `processMatchResult()` → doubles branch (dòng 213–463)

---

### Hệ thống ELO hiện tại đã implement doubles

Hệ thống **đã có** logic doubles ELO với 2 lớp:

#### Lớp 1: Pair ELO (`pairRanks` table)
```
Mỗi cặp đôi (A+B) có 1 bản ghi ELO riêng trong bảng pair_ranks.
Key = (user1Id, user2Id, categoryId) — sorted để đảm bảo unique.

Lần đầu cặp đôi đấu → ELO pair = avg(eloA, eloB)
Các lần sau → ELO pair tự thay đổi theo kết quả trận
```

#### Lớp 2: Individual ELO với Scaled Delta
```
Sau khi tính delta của pair (pairDelta), phân chia cho 2 người theo tỉ lệ:

Nếu A (1400) và B (1200) thắng → pairDelta = +15

  wDiff = |1400 - 1200| = 200
  scale1 = max(0.2, min(1.8, 1 - 200/800)) = 0.75  ← người ELO cao hơn
  scale2 = max(0.2, min(1.8, 1 + 200/800)) = 1.25  ← người ELO thấp hơn

  deltaA (cao ELO) = 15 × 0.75 = +11
  deltaB (thấp ELO) = 15 × 1.25 = +19

→ Người yếu hơn trong cặp được thưởng nhiều hơn khi thắng
→ Người mạnh hơn bị phạt nhiều hơn khi thua
```

---

### Phân tích công thức scaled delta

```
scale_cao = max(0.2, min(1.8, 1 - |diff|/800))
scale_thap = max(0.2, min(1.8, 1 + |diff|/800))

Ví dụ các mức chênh lệch:
| Chênh lệch | scale_cao | scale_thap | Nhận xét |
|---|---|---|---|
| 0 (bằng nhau) | 1.0 | 1.0 | Chia đều |
| 200 | 0.75 | 1.25 | Lệch nhẹ |
| 400 | 0.5 | 1.5 | Lệch vừa |
| 600 | 0.25 | 1.75 | Lệch nhiều |
| 800+ | 0.2 (floor) | 1.8 (cap) | Tối đa |
```

**Ý nghĩa thiết kế:**
- Khuyến khích cặp đôi **cân bằng ELO** vì tổng delta duy trì như nhau
- Người yếu ghép với người mạnh → **được thưởng nhiều hơn** → incentive để newbie tìm pro làm cặp
- Người mạnh ghép yếu → khi thua **bị phạt nhiều hơn** → disincentive carry quá nhiều

---

### Vấn đề tiềm ẩn cần bàn luận

#### Vấn đề 1: "Pair ELO ảo" khi mới ghép

```
Lần đầu cặp A (1400) + B (1200) đấu:
  Pair ELO khởi tạo = avg(1400, 1200) = 1300

Nhưng thực tế A+B có thể rất ăn ý hoặc rất không ăn ý.
ELO 1300 là ước tính ban đầu, cần nhiều trận để calibrate.
```

**Giải pháp hiện tại:** Chấp nhận — ELO pair sẽ tự điều chỉnh sau nhiều trận.  
Nên cân nhắc: Thêm K-factor cao hơn (K=40) cho 5 trận đầu của cặp mới (như provisional ELO).

#### Vấn đề 2: Pair ELO và Individual ELO khác nhau cho cùng người

```
Người A:
  Individual ELO (Đôi Nam): 1400
  Pair ELO với B: 1300
  Pair ELO với C: 1450

→ A sẽ có 3 loại ELO khác nhau tùy context.
→ Khi giải validate ELO, dùng cái nào?
```

**Hiện tại:** `validateEloLimits()` dùng **individual ELO** (`getUserElo()`) để kiểm tra min/max.  
**Câu hỏi:** Có nên hiển thị Pair ELO trên profile/leaderboard không?

#### Vấn đề 3: Mixed Doubles ELO — tính vào hàng nào?

```
Hiện tại user_ranks có field matchType: 'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES'

Mixed Doubles (Nam Nữ):
  → Cần tách rank riêng cho mixed_doubles
  → Người A có rank SINGLES, DOUBLES, MIXED_DOUBLES riêng nhau
```

**Hiện tại:** Code đã truyền `matchType` vào `getOrCreateUserRank` → xử lý đúng.  
**Vấn đề:** UI hiện tại chỉ hiển thị 1 ELO chính trên profile. Cần hiện cả 3 nếu có.

---

### Kết luận — ELO doubles hiện tại

| Điểm | Đánh giá |
|---|---|
| Pair ELO riêng (không phụ thuộc individual) | ✅ Đúng hướng |
| Scaled delta (yếu thưởng nhiều hơn) | ✅ Fair cho mọi level |
| K-factor không có cho pair mới | ⚠️ Cần xem xét |
| UI chưa hiển thị Pair ELO | ⚠️ User không biết pair ELO của mình là bao nhiêu |
| Mixed Doubles rank tách biệt | ✅ Đã handle |
| Leaderboard pair chưa có | ⚠️ Có thể thêm sau |

---

### Bàn luận thêm: Có nên hiển thị Pair ELO ở đâu?

**Option 1:** Hiển thị trong hồ sơ cá nhân tab "Đôi":
```
Hồ sơ Nguyễn Văn A
├── Đơn Nam:    1400 ELO  [Tier B High]
├── Đôi Nam:    1380 ELO  (individual rank)
│   └── Cặp với Nguyễn Văn B:  1320 ELO  (pair rank, 15 trận)
│   └── Cặp với Trần Văn C:    1410 ELO  (pair rank, 8 trận)
└── Nam Nữ:     1350 ELO  (individual rank)
```

**Option 2:** Hiển thị trong trang giải khi đăng ký đôi:
```
Bạn đăng ký cùng Nguyễn Văn B:
  • ELO cá nhân của bạn:  1400
  • ELO cá nhân của B:    1200
  • Pair ELO (A+B):       1320  (15 trận trước đây)
  • Pair ELO (Mới):       1300  (cặp lần đầu)
```

**Khuyến nghị:** Implement Option 2 trước — thêm vào Step 1 của form đăng ký đôi khi đã tìm thấy partner, hiện Pair ELO lịch sử nếu có.
