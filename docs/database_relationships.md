# 🔗 Phân Tích Quan Hệ Database (Relationships Analysis)

> Tài liệu này phân tích **chi tiết từng mối quan hệ** giữa các bảng trong hệ thống.  
> Quy ước: **Rich Junction Table** = bảng trung gian M:N có thêm cột dữ liệu ngoài 2 FK.

---

## 📊 Tổng quan: 31 bảng, 3 loại quan hệ

| Loại                                     | Số lượng | Ví dụ                                 |
| ---------------------------------------- | -------- | ------------------------------------- |
| **1:1** (One-to-One)                     | 1        | `users` ↔ `profiles`                  |
| **1:N** (One-to-Many)                    | 18       | `tournaments` → `matches`             |
| **M:N** (Many-to-Many via Rich Junction) | 7        | `users` ↔ `roles` qua `user_to_roles` |

---

## 🟢 1. TẦNG USER & AUTH

### `users` ↔ `profiles` — **1:1**

```
users.id ←—— profiles.user_id (UNIQUE)
```

- Mỗi user có đúng 1 profile. Cột `user_id` trong `profiles` có ràng buộc `UNIQUE`.
- `ON DELETE CASCADE`: Xóa user → xóa profile.

### `users` ↔ `roles` — **M:N (Rich Junction: `user_to_roles`)**

```
users.id ←——┐
             ├── user_to_roles (assigned_at, assigned_by)
roles.id ←——┘
```

- 1 user có nhiều role (PLAYER + ORGANIZER). 1 role gán cho nhiều user.
- **Rich columns:** `assigned_at` (khi nào gán), `assigned_by` (ai gán) — dùng cho audit.

### `users` → `sessions` — **1:N**

```
users.id ←—— sessions.user_id
```

- 1 user có nhiều session (đăng nhập trên nhiều thiết bị).
- `ON DELETE CASCADE`: Xóa user → xóa hết session.

---

## 🟡 2. TẦNG ELO & RANKING

### `categories` → `elo_tiers` — **1:N**

```
categories.id ←—— elo_tiers.category_id
```

- Mỗi môn thể thao (Pickleball) có nhiều tier (Low D, High D, C, B, A).

### `users` ↔ `categories` — **M:N (Rich Junction: `user_ranks`)**

```
users.id ←——┐
             ├── user_ranks (elo_points, tier_id, matches_played, matches_won)
categories.id ←——┘
```

- 1 user chơi nhiều môn, mỗi môn có 1 bộ ELO riêng.
- **Rich columns:** `elo_points`, `tier_id`, `matches_played`, `matches_won` — đây là bảng dữ liệu cốt lõi.
- UNIQUE constraint `(user_id, category_id)` đảm bảo mỗi user chỉ có 1 rank/môn.

### `user_ranks` → `elo_tiers` — **N:1**

```
user_ranks.tier_id ——→ elo_tiers.id
```

- Mỗi user_rank liên kết tới 1 tier hiện tại. `ON DELETE SET NULL` nếu tier bị xóa.

### `users` → `elo_history_logs` — **1:N**

```
users.id ←—— elo_history_logs.user_id
```

- 1 user có nhiều dòng lịch sử biến động ELO (theo thời gian).

---

## 🔵 3. TẦNG CỘNG ĐỒNG

### `users` → `communities` — **1:N** (creator)

```
users.id ←—— communities.creator_id (RESTRICT)
```

- 1 user tạo nhiều community. `ON DELETE RESTRICT` — không xóa được user nếu đang sở hữu community.

### `users` ↔ `communities` — **M:N (Rich Junction: `community_members`)**

```
users.id ←——┐
             ├── community_members (role, status, joined_at)
communities.id ←——┘
```

- 1 user tham gia nhiều community. 1 community có nhiều member.
- **Rich columns:** `role` (MEMBER/MODERATOR/OWNER), `status` (JOINED/BANNED), `joined_at`.

### `communities` ↔ `categories` — **M:N (Rich Junction: `community_sports`)**

```
communities.id ←——┐
                   ├── community_sports
categories.id ←———┘
```

- 1 community hoạt động nhiều môn thể thao. 1 môn được nhiều community chơi.
- **Junction đơn giản** (chỉ có 2 FK, không có cột phụ).

---

## 🟠 4. TẦNG GIẢI ĐẤU

### `communities` → `tournaments` — **1:N**

```
communities.id ←—— tournaments.community_id
```

- 1 community tổ chức nhiều giải. `ON DELETE SET NULL` — nếu community bị xóa, giải vẫn còn.

### `tournaments` → `tournament_stages` → `tournament_groups` — **1:N:N (Cascade)**

```
tournaments.id ←—— tournament_stages.tournament_id
tournament_stages.id ←—— tournament_groups.stage_id
```

- 1 giải có nhiều Stage (VD: Vòng bảng, Vòng loại trực tiếp).
- 1 Stage có nhiều Group (VD: Bảng A, Bảng B).
- Cascade: Xóa giải → xóa hết stages → xóa hết groups.

### `tournaments` → `tournament_participants` — **1:N**

```
tournaments.id ←—— tournament_participants.tournament_id
```

- 1 giải có nhiều đội/cá nhân đăng ký.

### `users` ↔ `tournament_participants` — **M:N (Rich Junction: `tournament_rosters`)**

```
users.id ←——┐
             ├── tournament_rosters (role: MAIN/SUBSTITUTE, joined_at)
tournament_participants.id ←——┘
```

- 1 user chơi cho nhiều đội (ở các giải khác nhau). 1 đội có nhiều thành viên.
- **Rich columns:** `role` (MAIN/SUBSTITUTE — Chính thức/Dự bị), `joined_at`.
- `ON DELETE RESTRICT` trên `user_id` — chống xóa user đang tham gia giải.

### `tournament_groups` → `matches` — **1:N**

```
tournament_groups.id ←—— matches.group_id
```

- 1 group chứa nhiều trận đấu.

### `matches` → `matches` — **Self-referencing 1:N (Bracket Tree)**

```
matches.next_match_id ——→ matches.id
matches.loser_next_match_id ——→ matches.id
```

- Mỗi match có thể trỏ tới match tiếp theo (winner lên gặp ai). Tạo thành **cây nhánh đấu (bracket tree)**.
- `loser_next_match_id` dùng cho **Double Elimination** (người thua xuống nhánh phụ).

### `users` ↔ `matches` — **M:N (Rich Junction: `match_players`)**

```
users.id ←——┐
             ├── match_players (participant_id, status: PLAYED/BENCHED)
matches.id ←——┘
```

- Ghi nhận chính xác **ai thực sự ra sân** trong mỗi trận.
- **Rich columns:** `participant_id` (thuộc đội nào), `status` (có đứng trên sân không).
- Đây là bảng **quan trọng nhất cho việc tính ELO cá nhân**.

---

## 🔴 5. TẦNG TÀI CHÍNH

### `users` → `payments` — **1:N**

```
users.id ←—— payments.user_id (RESTRICT)
```

- 1 user có nhiều giao dịch thanh toán. `RESTRICT` — bảo toàn sổ sách.

### `tournaments` → `payments` — **1:N**

```
tournaments.id ←—— payments.tournament_id (RESTRICT)
```

- 1 giải có nhiều giao dịch đóng phí.

### `payments` → `payment_status_logs` — **1:N**

```
payments.id ←—— payment_status_logs.payment_id (RESTRICT)
```

- 1 payment có nhiều dòng lịch sử thay đổi status (PENDING → SUCCESSFUL → ...).

### `tournaments` → `organizer_payouts` — **1:N**

```
tournaments.id ←—— organizer_payouts.tournament_id (RESTRICT)
```

- 1 giải có thể có nhiều lệnh rút tiền (nếu rút nhiều đợt).

### `organizer_payouts` → `payout_status_logs` — **1:N**

```
organizer_payouts.id ←—— payout_status_logs.payout_id (RESTRICT)
```

- Lịch sử trạng thái mỗi lệnh rút tiền.

---

## 💬 6. TẦNG SOCIAL

### `users` ↔ `users` — **M:N (Rich Junction: `friendships`)**

```
users.id ←——┐
             ├── friendships (status: PENDING/ACCEPTED/BLOCKED, created_at, updated_at)
users.id ←——┘
```

- Self-referencing M:N. 1 user kết bạn với nhiều user khác.
- **Rich columns:** `status`, `created_at`, `updated_at`.
- CHECK: `sender_id != receiver_id` — không tự kết bạn với mình.

### `users` ↔ `chat_rooms` — **M:N (Rich Junction: `chat_room_members`)**

```
users.id ←——┐
             ├── chat_room_members (joined_at)
chat_rooms.id ←——┘
```

- 1 user ở nhiều phòng chat. 1 phòng có nhiều thành viên.
- **Rich columns:** `joined_at`.

### `chat_rooms` → `chat_messages` — **1:N**

```
chat_rooms.id ←—— chat_messages.room_id
```

- 1 phòng chat có nhiều tin nhắn.

### `users` ↔ `matches` (reactions) — **M:N (Rich Junction: `match_reactions`)**

```
users.id ←——┐
             ├── match_reactions (type: LIKE/HIGH_FIVE, created_at)
matches.id ←——┘
```

- 1 user react 1 lần/trận. UNIQUE `(match_id, user_id)`.
- **Rich columns:** `type`, `created_at`.

### `matches` → `match_comments` — **1:N**

```
matches.id ←—— match_comments.match_id
```

- 1 trận có nhiều bình luận.

### `match_comments` → `match_comments` — **Self-referencing 1:N (Nested/Threaded)**

```
match_comments.parent_id ——→ match_comments.id
```

- Bình luận lồng nhau (reply).

### `matches` → `match_disputes` — **1:N**

```
matches.id ←—— match_disputes.match_id (RESTRICT)
```

- 1 trận có thể có nhiều khiếu nại.

---

## 📈 7. BẢNG ĐỘC LẬP & PHỤ TRỢ

| Bảng                | Quan hệ chính                     | Ghi chú                   |
| ------------------- | --------------------------------- | ------------------------- |
| `audit_logs`        | N:1 → `users`                     | Ghi nhật ký mọi hành động |
| `notifications`     | N:1 → `users` (receiver + sender) | Thông báo                 |
| `advertisements`    | Độc lập                           | Không FK tới bảng nào     |
| `tournament_venues` | 1:N → `venue_courts`              | Sân thi đấu               |

---

## 🎯 Tổng kết bảng Rich Junction (M:N)

| Rich Junction Table  | Bảng A        | Bảng B                    | Rich Columns                                             |
| -------------------- | ------------- | ------------------------- | -------------------------------------------------------- |
| `user_to_roles`      | `users`       | `roles`                   | `assigned_at`, `assigned_by`                             |
| `user_ranks`         | `users`       | `categories`              | `elo_points`, `tier_id`, `matches_played`, `matches_won` |
| `community_members`  | `users`       | `communities`             | `role`, `status`, `joined_at`                            |
| `community_sports`   | `communities` | `categories`              | _(junction đơn giản)_                                    |
| `tournament_rosters` | `users`       | `tournament_participants` | `role` (MAIN/SUB), `joined_at`                           |
| `match_players`      | `users`       | `matches`                 | `participant_id`, `status` (PLAYED/BENCHED)              |
| `friendships`        | `users`       | `users`                   | `status`, `created_at`, `updated_at`                     |
| `chat_room_members`  | `users`       | `chat_rooms`              | `joined_at`                                              |
| `match_reactions`    | `users`       | `matches`                 | `type`, `created_at`                                     |
