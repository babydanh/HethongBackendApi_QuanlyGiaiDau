# Fix Plan: Bracket Per Division & Mock Participant Bug

> Ngày: 2026-06-18  
> Scope: Backend + Frontend — Bracket Generation / Mock Participants / Per-Division Views

---

## 🐛 BUG 1: Mock participants khác division → bracket báo "không có participant id"

### Triệu chứng

- Organizer vào manage page → chọn Division A (VD: Đôi Nam) → seed mock → generate bracket → **OK**
- Organizer sau đó chọn Division B (VD: Đơn Nữ) → seed mock → generate bracket  
- Ấn xem bracket của Division B (hoặc bất kỳ division) → **lỗi "participant not found"** hoặc bracket hiển thị sai người

### Root Cause — Phân tích từ code

#### Nguyên nhân 1: FE gọi `seedMockParticipants` không có `divisionId`

**File:** [`frontend-web_qlgiaidau/src/app/organizer/tournaments/[id]/manage/page.tsx`](file:///d:/Duancanhan/Project_QuanLyGiaiDau/frontend-web_qlgiaidau/src/app/organizer/tournaments/[id]/manage/page.tsx#L867)

```ts
// ❌ HIỆN TẠI — không truyền divisionId
await tournamentsApi.seedMockParticipants(id, names);
```

**File:** [`frontend-web_qlgiaidau/src/features/tournaments/api.ts`](file:///d:/Duancanhan/Project_QuanLyGiaiDau/frontend-web_qlgiaidau/src/features/tournaments/api.ts#L124)

```ts
// ❌ API signature không nhận divisionId
seedMockParticipants: (id: string, names: string[]) =>
  api.post(`/tournaments/${id}/mock-participants`, { names }),
```

**Hậu quả:** Mock participants được tạo với `tournamentDivisionId = null` → không thuộc division nào → khi `generateBracket` với `divisionId` thì query:
```sql
WHERE tournamentId = ? AND tournamentDivisionId = ? → 0 rows
```
→ `numParticipants < 2` → throw error hoặc bracket rỗng.

---

#### Nguyên nhân 2: BE Controller nhận `divisionId` đúng nhưng FE không truyền

**File:** [`backend-api_qlgiaidau/src/modules/tournaments/tournaments.controller.ts`](file:///d:/Duancanhan/Project_QuanLyGiaiDau/backend-api_qlgiaidau/src/modules/tournaments/tournaments.controller.ts#L428)

```ts
@Post(':id/mock-participants')
async seedMockParticipants(
  @Param('id') id: string,
  @Body('names') names: string[],
  @CurrentUser() user: JwtPayload,
  @Body('divisionId') divisionId?: string  // ← BE đã support
) {
  return this.tournamentsService.seedMockParticipants(id, user.sub, names, [user.role], divisionId);
}
```

BE đã sẵn sàng. FE chưa gửi `divisionId`. 

---

#### Nguyên nhân 3: BracketTab nhận `divisionId` nhưng TournamentDetailClient chưa truyền đúng

**File:** [`frontend-web_qlgiaidau/src/app/(public)/tournaments/[id]/components/BracketTab.tsx`](file:///d:/Duancanhan/Project_QuanLyGiaiDau/frontend-web_qlgiaidau/src/app/(public)/tournaments/[id]/components/BracketTab.tsx#L24)

```ts
interface Props {
  tournament: Tournament;
  tournamentId?: string;
  divisionId?: string;  // ← prop có nhưng có thể không được truyền đúng
  onScheduleMatch?: OnScheduleMatch;
}
```

Cần check `TournamentDetailClient.tsx` xem có truyền `selectedDivisionId` vào `BracketTab` chưa.

---

### Hướng sửa

**Chỉ cần sửa 2 chỗ FE, không cần đổi BE:**

#### Fix 1 — `api.ts`: thêm `divisionId` vào signature

```ts
// ✅ MỚI
seedMockParticipants: (id: string, names: string[], divisionId?: string) =>
  api.post(`/tournaments/${id}/mock-participants`, { names, divisionId }),
```

#### Fix 2 — `manage/page.tsx`: truyền `selectedDivisionId` khi gọi

```ts
// ✅ MỚI
await tournamentsApi.seedMockParticipants(id, names, selectedDivisionId || undefined);
```

---

## 🐛 BUG 2: `clearMockParticipants` xóa tất cả division thay vì division đang chọn

### Triệu chứng

- Organizer seed mock cho Division A và Division B
- Bấm "Xóa mock" → **xóa hết cả 2 division** chứ không chỉ division đang chọn

### Root Cause

**File:** [`backend-api_qlgiaidau/src/modules/tournaments/tournaments.repository.ts`](file:///d:/Duancanhan/Project_QuanLyGiaiDau/backend-api_qlgiaidau/src/modules/tournaments/tournaments.repository.ts#L2141)

```ts
async clearMockParticipants(tournamentId: string) {
  // ❌ Không có divisionId filter → xóa tất cả mock của tournament
  .where(
    and(
      eq(tournamentParticipants.tournamentId, tournamentId),
      eq(tournamentParticipants.isMock, true)
    )
  )
}
```

**File:** [`backend-api_qlgiaidau/src/modules/tournaments/tournaments.controller.ts`](file:///d:/Duancanhan/Project_QuanLyGiaiDau/backend-api_qlgiaidau/src/modules/tournaments/tournaments.controller.ts#L440)

```ts
@Delete(':id/mock-participants')
async clearMockParticipants(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
  // ❌ Không nhận divisionId từ query/body
  return this.tournamentsService.clearMockParticipants(id, user.sub, [user.role]);
}
```

### Hướng sửa

**Option A (đơn giản):** Thêm `divisionId` query param vào `DELETE`:
```
DELETE /tournaments/:id/mock-participants?divisionId=xxx
```

**Option B (hiện tại tạm OK):** Giữ nguyên hành vi xóa tất cả, nhưng thông báo rõ cho user:
```
"Xóa toàn bộ mock của TẤT CẢ hình thức? [Xóa tất cả] [Chỉ xóa hình thức đang chọn]"
```

→ **Khuyến nghị Option A** — sạch hơn, không break flow.

---

## 📋 PLAN: Mỗi Division có Bracket + Danh sách riêng

### Vấn đề hiện tại

Khi tournament có nhiều division (VD: Đơn Nam + Đơn Nữ + Đôi Nam):

1. **Bracket tab** gọi `getTournamentBracket(tournamentId)` không có divisionId → lấy tất cả stage của tournament → mix lẫn bracket của nhiều division
2. **Participants/Teams tab** gọi `getTournamentParticipants(tournamentId)` → lấy tất cả → không phân biệt division
3. **Mock Panel** không biết đang seed cho division nào
4. **Generate Bracket button** có truyền `selectedDivisionId` nhưng UI chọn division chưa connect rõ với mock panel

### Kiến trúc đúng

```
Tournament (1 tournament có nhiều division)
├── Division A: Đơn Nam
│   ├── Bracket riêng (stages với tournamentDivisionId = A)
│   ├── Participants riêng (tournamentParticipants với tournamentDivisionId = A)
│   └── Mock panel riêng (seed với divisionId = A)
├── Division B: Đơn Nữ
│   ├── Bracket riêng
│   ├── Participants riêng
│   └── Mock panel riêng
└── Division C: Đôi Nam
    ├── Bracket riêng
    ├── Participants riêng
    └── Mock panel riêng
```

---

### Plan sửa — Frontend (manage/page.tsx)

#### Bước 1: UI chọn Division rõ ràng hơn

**Hiện tại:** Có `selectedDivisionId` state + dropdown chọn division ở UI, nhưng mock panel và participants panel không react theo `selectedDivisionId`.

**Cần thêm:**
- Mock panel phải hiện rõ: "Đang seed cho division: [Đôi Nam]"
- Khi `selectedDivisionId` thay đổi → mock panel clear text, participants list refetch

```tsx
// Trong mock panel
<div className="text-xs text-amber-600 font-semibold mb-2">
  Đang seed cho: {selectedDivision?.name ?? 'Chưa chọn hình thức'}
</div>
```

#### Bước 2: Participants list filter theo division

**Hiện tại:**
```ts
// ❌ Lấy tất cả participants
const parts = await tournamentsApi.getTournamentParticipants(id);
```

**Cần:** Thêm endpoint `GET /tournaments/:id/participants?divisionId=xxx` để filter:
```ts
// ✅ Filter theo division
const parts = await tournamentsApi.getTournamentParticipants(id, selectedDivisionId);
```

**BE endpoint hiện tại:** Cần check `getTournamentParticipants` có support `divisionId` query param chưa.

#### Bước 3: Bracket hiển thị theo division đang chọn

**Hiện tại** (manage page):
```ts
// handleGenerateBracket đã đúng — dùng selectedDivisionId
await tournamentsApi.generateBracket(id, selectedDivisionId || undefined);
```

**Vấn đề còn lại:** Sau khi generate, bracket display component (`BracketTab`) cần nhận đúng `divisionId` từ state của manage page. Check xem `BracketTab` trong manage page có được truyền `divisionId={selectedDivisionId}` chưa.

#### Bước 4: Mock panel phân biệt rõ division

```
[Bảng Mock Data]
└── Dropdown: Hình thức đang seed: [Đôi Nam ▼]  ← map với selectedDivisionId
    Nhập tên người chơi (2 tên mỗi cặp):
    [textarea]
    [Seed] [Xóa mock của hình thức này]
```

---

### Plan sửa — Backend

#### GET /tournaments/:id/participants — thêm divisionId filter

**File:** [`tournaments.repository.ts`](file:///d:/Duancanhan/Project_QuanLyGiaiDau/backend-api_qlgiaidau/src/modules/tournaments/tournaments.repository.ts)

```ts
// Thêm divisionId param
async getParticipants(tournamentId: string, divisionId?: string) {
  return this.db
    .select()
    .from(schema.tournamentParticipants)
    .where(
      divisionId
        ? and(
            eq(tournamentParticipants.tournamentId, tournamentId),
            eq(tournamentParticipants.tournamentDivisionId, divisionId),
          )
        : eq(tournamentParticipants.tournamentId, tournamentId)
    );
}
```

#### DELETE /tournaments/:id/mock-participants — thêm divisionId

```ts
// Controller
@Delete(':id/mock-participants')
async clearMockParticipants(
  @Param('id') id: string,
  @Query('divisionId') divisionId?: string,
  @CurrentUser() user: JwtPayload,
) {
  return this.tournamentsService.clearMockParticipants(id, user.sub, [user.role], divisionId);
}

// Repository
async clearMockParticipants(tournamentId: string, divisionId?: string) {
  .where(
    divisionId
      ? and(
          eq(tournamentParticipants.tournamentId, tournamentId),
          eq(tournamentParticipants.isMock, true),
          eq(tournamentParticipants.tournamentDivisionId, divisionId),
        )
      : and(
          eq(tournamentParticipants.tournamentId, tournamentId),
          eq(tournamentParticipants.isMock, true),
        )
  )
}
```

---

### Tóm tắt các file cần sửa

#### Frontend
| File | Thay đổi |
|---|---|
| `features/tournaments/api.ts` | `seedMockParticipants` thêm `divisionId` param |
| `features/tournaments/api.ts` | `clearMockParticipants` thêm `divisionId` param |
| `features/tournaments/api.ts` | `getTournamentParticipants` thêm `divisionId` param |
| `manage/page.tsx` | `handleSeedMockData` truyền `selectedDivisionId` |
| `manage/page.tsx` | `handleClearMockData` truyền `selectedDivisionId` (query param) |
| `manage/page.tsx` | Mock panel hiện tên division đang chọn |
| `manage/page.tsx` | Participants list refetch khi `selectedDivisionId` thay đổi |

#### Backend
| File | Thay đổi |
|---|---|
| `tournaments.controller.ts` | `clearMockParticipants` nhận `@Query('divisionId')` |
| `tournaments.service.ts` | `clearMockParticipants` forward `divisionId` |
| `tournaments.repository.ts` | `clearMockParticipants` filter theo `divisionId` |
| `tournaments.controller.ts` | `getParticipants` nhận `@Query('divisionId')` |
| `tournaments.service.ts` | `getParticipants` forward `divisionId` |
| `tournaments.repository.ts` | `getParticipants` filter theo `divisionId` |

---

### Priority

| # | Bug/Task | Priority | Độ khó |
|---|---|---|---|
| 1 | FE `seedMockParticipants` thiếu `divisionId` | 🔴 Critical | Thấp (1 dòng) |
| 2 | FE `clearMockParticipants` thiếu `divisionId` | 🟡 Medium | Thấp |
| 3 | BE `clearMockParticipants` filter divisionId | 🟡 Medium | Thấp |
| 4 | BE `getParticipants` filter divisionId | 🟡 Medium | Thấp |
| 5 | FE manage page mock panel hiện division label | 🟢 Nice | Thấp |
| 6 | FE participants list filter by division | 🟡 Medium | Trung bình |
| 7 | Bracket tab nhận đúng divisionId từ manage page | 🟡 Medium | Thấp |

---

## 🐛 BUG 3: Bracket Tab trong Organizer Manage Page — Hiện sai/mất bracket khi đổi division

### Mô tả vấn đề (từ screenshot)

Trong trang `/organizer/tournaments/:id/manage`, tab **"Sơ đồ Bracket"**:
- Bracket đang **tự render nội tuyến** trong `manage/page.tsx` (KHÔNG dùng `BracketTab.tsx`)
- Bracket chỉ render danh sách match theo grid 2 cột — **không phải cây bracket visual**
- Bracket được lưu trong state `bracket` (kiểu `{ stages: BracketStage[] } | null`)

### Root Cause phân tích từ code

#### Vấn đề 1: `fetchTournamentData` (initial load) gọi bracket **không có divisionId**

**File:** [`manage/page.tsx`](file:///d:/Duancanhan/Project_QuanLyGiaiDau/frontend-web_qlgiaidau/src/app/organizer/tournaments/[id]/manage/page.tsx#L291)

```ts
// ❌ Lúc load trang — gọi bracket KHÔNG có divisionId
// → Sẽ lấy tất cả stages của tournament (mix nhiều division)
const bRes = await tournamentsApi.getTournamentBracket(id);  // ← line 292
if (bRes.data) setBracket(bRes.data);
```

Điều này xảy ra trong `fetchTournamentData()` được gọi lúc `useEffect([id])`. Khi đó `selectedDivisionId` chưa được set (chưa load xong divisions).

#### Vấn đề 2: `useEffect([id, selectedDivisionId])` có gọi đúng — nhưng chỉ khi có selectedDivisionId

**File:** [`manage/page.tsx`](file:///d:/Duancanhan/Project_QuanLyGiaiDau/frontend-web_qlgiaidau/src/app/organizer/tournaments/[id]/manage/page.tsx#L511)

```ts
useEffect(() => {
  if (!selectedDivisionId) return;  // ← Nếu không có divisionId thì skip!
  
  const fetchDivisionScopedData = async () => {
    const [participantsRes, bracketRes] = await Promise.all([
      divisionsApi.getDivisionParticipants(id, selectedDivisionId),
      tournamentsApi.getTournamentBracket(id, selectedDivisionId),  // ← Đúng!
    ]);
    if (participantsRes.data) setParticipants(participantsRes.data);
    if (bracketRes.data) setBracket(bracketRes.data);
  };
  fetchDivisionScopedData();
}, [id, selectedDivisionId]);
```

**Nhận xét:** Logic này ĐÃ ĐÚNG. Nhưng có vấn đề timing:
- `fetchTournamentData` chạy lúc init → gọi bracket **không có divisionId** → set `bracket` với data sai
- Sau đó `fetchDivisions` mới set `selectedDivisionId`
- `useEffect([selectedDivisionId])` fire → fetch lại đúng → overwrite

→ **Có một khoảng flash** lúc trang load hiện bracket sai (tất cả divisions trộn lẫn), rồi mới đúng.

#### Vấn đề 3: `handleGenerateBracket` sau khi generate chỉ fetch bracket khi có `selectedDivisionId`

```ts
if (selectedDivisionId) {
  const bRes = await tournamentsApi.getTournamentBracket(id, selectedDivisionId);
  if (bRes.data) setBracket(bRes.data);
} else {
  fetchTournamentData();  // ← Nếu không có division → fetch lại tất cả (sai)
}
```

**Vấn đề:** Nếu `selectedDivisionId = ''` (chưa chọn, hoặc tournament không có division), hệ thống gọi `fetchTournamentData()` → lại gọi `getTournamentBracket(id)` không có divisionId. Với tournament có division, việc này sẽ lấy bracket của tất cả divisions trộn vào nhau.

#### Vấn đề 4: Bracket manage page dùng UI dạng grid card — không phải cây bracket visual

Bracket trong manage page là **custom render** dạng card grid 2 cột:
```tsx
// Grid card render — không phải SVG bracket tree
{group.matches.map((match) => (
  <div className="bg-white border rounded-xl p-4 shadow-sm ...">
    ...
  </div>
))}
```

Trong khi `BracketTab.tsx` (public view) có SVG bracket tree đẹp hơn. Manage page intentionally dùng card layout để thêm button "Xếp Sân & Giờ".

**Đây không phải bug** — đây là thiết kế khác nhau cho organizer vs public view. Nhưng cần kiểm tra xem:
- Card grid này có hiển thị đúng thông tin participant không (tên, seed)
- Các button "Xếp Sân & Giờ" có hoạt động không khi participant là mock

---

### Luồng đầy đủ trong Manage Page

```
Page load
  ├── fetchTournamentData()
  │   ├── getTournamentById(id)
  │   ├── getTournamentParticipants(id)          ← [BUG] không filter division
  │   ├── getTournamentBracket(id)               ← [BUG] không filter division
  │   └── fetchDivisions(tournamentId)
  │       └── setSelectedDivisionId(first div)  ← trigger useEffect
  │
  └── useEffect([id, selectedDivisionId])  ← fire sau khi selectedDivisionId set
      ├── getDivisionParticipants(id, divisionId)   ← ĐÃ ĐÚNG
      └── getTournamentBracket(id, divisionId)       ← ĐÃ ĐÚNG

Button "Sinh VĐV ảo"
  └── seedMockParticipants(id, names)               ← [BUG] thiếu divisionId

Button "Khởi tạo sơ đồ thi đấu"
  └── generateBracket(id, selectedDivisionId)       ← ĐÃ ĐÚNG
      └── getTournamentBracket(id, selectedDivisionId)  ← ĐÃ ĐÚNG (nếu có div)
```

---

### Hướng sửa Bracket Tab trong Manage Page

#### Fix 1 (Critical): `fetchTournamentData` — skip bracket fetch nếu có division

```ts
// ❌ Xóa block fetch bracket trong fetchTournamentData:
// try {
//   const bRes = await tournamentsApi.getTournamentBracket(id);
//   if (bRes.data) setBracket(bRes.data);
// } catch { setBracket(null); }

// ✅ Để useEffect([selectedDivisionId]) handle tất cả bracket fetching
// Chỉ để fetchTournamentData fetch tournament info + participants thô
// useEffect sẽ override với filtered data sau khi selectedDivisionId set
```

**Tại sao:** Để tránh flash bracket sai ở initial load. `useEffect([selectedDivisionId])` đã handle đúng rồi.

#### Fix 2 (Medium): Khi tournament KHÔNG có divisions — fetch bracket như cũ

```ts
// Nếu tournament không có divisions, bracket fetch không cần divisionId
useEffect(() => {
  if (!selectedDivisionId && divisions.length === 0) {
    // Tournament bình thường, không có division → fetch all
    tournamentsApi.getTournamentBracket(id)
      .then(res => { if (res.data) setBracket(res.data); })
      .catch(() => setBracket(null));
  }
}, [id, divisions.length, selectedDivisionId]);
```

#### Fix 3 (Minor): `handleGenerateBracket` khi không có division

```ts
// Sau khi generate, luôn fetch bracket với divisionId (nếu có)
const bRes = selectedDivisionId
  ? await tournamentsApi.getTournamentBracket(id, selectedDivisionId)
  : await tournamentsApi.getTournamentBracket(id);
if (bRes.data) setBracket(bRes.data);
// ❌ Bỏ nhánh fetchTournamentData() — quá nặng, gây re-render toàn trang
```

---

### Tổng hợp bảng ưu tiên (updated)

| # | Bug/Task | Priority | File | Độ khó |
|---|---|---|---|---|
| 1 | `seedMockParticipants` thiếu `divisionId` FE | 🔴 Critical | `api.ts` + `manage/page.tsx` | Thấp |
| 2 | `fetchTournamentData` fetch bracket không có divisionId | 🔴 Critical | `manage/page.tsx:292` | Thấp |
| 3 | `handleGenerateBracket` fallback gọi `fetchTournamentData` | 🟡 Medium | `manage/page.tsx` | Thấp |
| 4 | `clearMockParticipants` BE thiếu divisionId filter | 🟡 Medium | `tournaments.repository.ts` | Thấp |
| 5 | `clearMockParticipants` FE thiếu divisionId | 🟡 Medium | `api.ts` + `manage/page.tsx` | Thấp |
| 6 | Mock panel chưa hiện tên division đang seed | 🟢 Nice | `manage/page.tsx` | Thấp |
| 7 | `getParticipants` BE chưa filter divisionId | 🟡 Medium | `tournaments.repository.ts` | Thấp |
