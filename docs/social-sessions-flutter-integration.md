# Social Sessions auto-close và tích hợp Flutter

## 1. Tóm tắt cho client

> Flutter **không cần và không được** gọi `closeExpiredSessions` trực tiếp. Không tồn tại endpoint public `POST /social-sessions/close`.

Luồng đúng:

1. Flutter gọi `GET /api/v1/social-sessions/by-community/:communityId`.
2. Backend tự chạy `SocialSessionsRepository.closeExpiredSessions(now, communityId)` **scoped đúng Club đó** trước khi query list.
3. Response trả về đã có `status` mới nhất (`OPEN` quá giờ → `COMPLETED`).

Cơ chế bổ trợ phía server:

- Cron `SocialSessionSchedulerService` (`EVERY_5_MINUTES`) đóng toàn bảng.
- Lazy `refreshStatusIfExpired` trong `getById / join / update / chat` cho detail.
- Lazy bulk trong `listByCommunity` cho list theo Club (đã triển khai).

Kết quả: giữa 2 lần cron, list theo Club vẫn đúng mà không cần client trigger gì thêm.

## 2. Điều kiện hết hạn

Một kèo được coi là hết giờ khi:

- `status IN ('OPEN','FULL')`, và
- `startAt + durationMinutes <= NOW()`, và
- `deletedAt IS NULL`.

Khi thỏa, backend `UPDATE status='COMPLETED'`. Idempotent: đã `COMPLETED`/`CANCELLED` thì bỏ qua. Close lỗi không chặn list (server chỉ `warn` log, cron sẽ dọn lại).

## 3. Contract `GET by-community`

```http
GET /api/v1/social-sessions/by-community/:communityId?status=OPEN,FULL,COMPLETED&from=2026-09-01&to=2026-09-30&sport=pickleball&search=san&page=1&limit=20
```

- Auth: `Public` + `OptionalJwtAuthGuard`. Được phép không gửi token.
- `communityId`: UUID `communities.id` (bắt buộc, validate `ParseUUIDPipe`).
- Query (`QuerySocialByCommunityDto`):

| Param | Mặc định | Ràng buộc | Ghi chú |
|---|---|---|---|
| `status` | `OPEN,FULL,COMPLETED` | csv trong `OPEN,FULL,COMPLETED,CANCELLED` | Sai → `400 INVALID_STATUS` |
| `from` | - | `YYYY-MM-DD` | Sai → `400 INVALID_FROM_DATE` |
| `to` | - | `YYYY-MM-DD` | Sai → `400 INVALID_TO_DATE` |
| `sport` | - | `tennis\|pickleball\|badminton` | Sai → 400 validation, không tồn tại → `400 CATEGORY_NOT_FOUND` |
| `search` | - | string | match `title/venueName/venueAddress` (ilike) |
| `page` | `1` | int >= 1 | - |
| `limit` | `20` | 1..50 | - |

Phân quyền hiển thị do backend tự suy từ token:

- Không token hoặc không phải member: chỉ `visibility=PUBLIC`.
- Member `JOINED`: thấy cả `PUBLIC + CLUB_ONLY`.
- Manager (`OWNER/MODERATOR` của Club) hoặc platform `ADMIN`: được giữ `CANCELLED` trong filter. Còn lại `CANCELLED` bị loại bỏ. Nếu sau khi loại mà `statuses` rỗng → trả `{ items: [], meta }` luôn.

Response envelope:

```json
{
  "items": [
    {
      "id": "22222222-2222-4222-8222-222222222222",
      "communityId": "55555555-5555-4555-8555-555555555555",
      "title": "Pickleball Giao hữu",
      "startAt": "2026-09-17T14:45:00+07:00",
      "durationMinutes": 120,
      "playDate": "2026-09-17",
      "status": "COMPLETED",
      "visibility": "PUBLIC",
      "currentSlots": 6,
      "maxSlots": 8,
      "community": { "id": "...", "name": "SB Club", "logoUrl": null },
      "sport": "pickleball"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1 }
}
```

Sort `startAt DESC` (mới → cũ) để xem lịch sử. Khác `GET /social-sessions?date=` vốn chỉ lọc `OPEN,FULL` theo ngày.

## 4. Status lifecycle cho UI

- `OPEN`: còn slot, còn giờ → cho Join, hiện nút Tham gia.
- `FULL`: đủ slot, còn giờ → disable Join, hiện Đã đủ người (`409 SESSION_FULL` nếu cố join).
- `COMPLETED`: quá giờ (tự đóng) → chỉ đọc, ẩn nút Join/thêm người/gửi chat mới.
- `CANCELLED`: host/manager hủy → chỉ manager thấy ở list, detail vẫn xem được.

Lưu ý quan trọng khi test:

- Filter mặc định: kèo vừa hết giờ vẫn nằm trong list nhưng đổi `OPEN → COMPLETED`.
- Filter `status=OPEN`: kèo vừa hết giờ sẽ **biến mất** khỏi list. Đây là hành vi đúng, không phải mất dữ liệu.

## 5. Mã lỗi Flutter cần handle

- `404 COMMUNITY_NOT_FOUND`: sai `communityId`.
- `400 INVALID_STATUS / INVALID_FROM_DATE / INVALID_TO_DATE`: query sai định dạng.
- `400 CATEGORY_NOT_FOUND`: `sport` không map được `categories.slug`.
- Không có mã lỗi riêng cho auto-close. Nếu close fail, list vẫn `200` với dữ liệu cũ.

## 6. Tích hợp khuyến nghị trong Flutter

1. Một repository method `fetchCommunitySessions(communityId, {status, from, to, sport, search, page, limit})` gọi đúng URL trên, luôn gửi lại khi pull-to-refresh / resume app / chuyển tab Club.
2. Không cache `OPEN` quá lâu. Nếu cache in-memory thì TTL ngắn (ví dụ 30-60s) hoặc invalidate khi `DateTime.now() >= startAt.add(Duration(minutes: durationMinutes))`.
3. Không cần timer gọi close riêng. Nếu muốn UI tự chuyển badge đúng giờ, dùng timer local chỉ để refresh list (khuyến nghị >= 60s, tốt nhất 5 phút theo nhịp cron), không gọi endpoint giả định.
4. Gửi `Authorization: Bearer <jwt>` khi user đã login để thấy kèo `CLUB_ONLY` và `CANCELLED` (nếu là manager). Guest không token vẫn gọi được nhưng chỉ thấy `PUBLIC`.
5. Phân trang `page/limit` theo `meta.total`. `limit` tối đa 50.
6. Disable Join khi `status != OPEN` ở client để tránh `400 SESSION_CLOSED`, nhưng vẫn handle `400/409` từ server vì race (vừa hết giờ giữa lúc bấm).

Checklist kiểm thử:

- Tạo kèo `OPEN` đã quá `startAt + duration` → gọi list lần đầu đã thấy `COMPLETED`.
- Gọi list `status=OPEN` → kèo đó biến mất; gọi default → thấy `COMPLETED`.
- Guest không token chỉ thấy `PUBLIC`; member thấy thêm `CLUB_ONLY`.
- Non-manager truyền `status=OPEN,CANCELLED` → request thực tế chỉ còn `OPEN`.

## 7. Vì sao không mở endpoint close cho mobile

- Client trigger bulk `UPDATE` toàn bảng dễ gây lock/DOS khi nhiều máy cùng gọi.
- Phải thêm guard admin/manager, audit, rate-limit — phức tạp mà không lợi gì vì lazy close đã đủ.
- Nếu sau này cần tool nội bộ, nên làm `POST /api/v1/admin/social-sessions/close-expired` có `JwtAuth + Roles(ADMIN)` riêng, không dùng app public.
