# Tournament/Match API và tích hợp Flutter

## Tóm tắt tương thích

Các thay đổi backend hiện tại tối ưu cách đọc dữ liệu trong repository và bổ sung index database. Không đổi URL, query parameter, envelope JSON hay tên field của API; Flutter hiện tại vẫn tương thích mà không cần migration model.

Các API liên quan trực tiếp tới luồng trong `log_request.txt`:

1. `GET /api/v1/tournaments/public?limit=50` lấy danh sách giải công khai.
2. `GET /api/v1/matches?tournamentId={uuid}&publicOnly=true&limit=100[&cursor={opaqueCursor}]` lấy các trang trận đấu của từng giải.

Backend tối ưu SQL cho việc lấy tournament/division participant counts và thêm index trong migration `src/database/migrations/2026-09-24_optimize_tournament_match_reads.sql`. Những thay đổi này không đòi hỏi Flutter đổi model hoặc parser response.

## Contract của `GET /matches`

Ví dụ lấy trang đầu của một giải:

```http
GET /api/v1/matches?tournamentId=7b2...&publicOnly=true&limit=100
```

Trang tiếp theo giữ nguyên các filter, chỉ thêm cursor nhận được từ response trước:

```http
GET /api/v1/matches?tournamentId=7b2...&publicOnly=true&limit=100&cursor={meta.nextCursor}
```

Response có envelope dạng:

```json
{
  "data": [
    {
      "id": "...",
      "tournamentId": "...",
      "divisionId": "...",
      "status": "SCHEDULED"
    }
  ],
  "meta": {
    "total": 123,
    "page": 1,
    "limit": 100,
    "nextCursor": "...",
    "hasMore": true
  }
}
```

`cursor` là opaque token: không decode, sửa, hoặc dùng lại với bộ filter khác. Dừng khi `nextCursor` rỗng/null, không đổi so với cursor hiện tại, hoặc trang không có dữ liệu. DTO backend cho phép `limit` tối đa 1000; Flutter repository hiện đặt page size 100 và tối đa 50 trang. Không nên tăng page size chỉ để giảm request nếu chưa kiểm tra kích thước payload và bộ nhớ trên thiết bị.

Luôn gửi `publicOnly=true` cho luồng public. Không được xem `tournamentId` đơn lẻ là kiểm tra quyền/visibility; backend hiện có nhánh list cần kiểm tra visibility khi filter theo tournament mà thiếu `publicOnly`.

## Root cause của 31 GET trong log

Call chain hiện tại trong Flutter:

- `lib/features/home/screens/home_screen.dart`: vòng lặp các tournament gọi `ref.watch(matchesProvider(t.id))` để quyết định giải nào có trận phù hợp.
- `lib/providers/query_providers.dart`: `matchesProvider` gọi `watchByTournament(tournamentId)`.
- `lib/data/repositories/api/api_match_repository.dart`: trước thay đổi, `watchByTournament` gọi `_fetchAllByTournament` với `usePublicSnapshot: false`, khiến `_getMatchPages` tải các trang riêng cho từng `tournamentId`, page size 100. Hiện luồng này dùng snapshot public chung và chỉ fallback sang request riêng khi snapshot vượt giới hạn completeness.

Vì vậy log có 31 HTTP GET cho 28 tournament ID: đây là fan-out HTTP ở client, không phải N+1 SQL của backend. Sau khi danh sách được lọc, `LiveTournamentWithMatchesCard` còn có luồng tải trang hiển thị riêng (`getTournamentMatchesPaged`); cần lưu ý tránh tải toàn bộ match history ở parent chỉ để xác định card có dữ liệu hay không.

## Tích hợp khuyến nghị

Không cần endpoint mới để giữ tương thích API. Flutter có thể giảm fan-out bằng cơ chế snapshot public chung đã tồn tại trong `ApiMatchRepository`:

- `_getPublicMatchesSnapshot()` gọi `GET /matches?publicOnly=true&limit=100` và theo cursor đến hết; request đang chạy được chia sẻ, cache 10 giây.
- `_fetchAllByTournament(..., usePublicSnapshot: true)` lọc snapshot theo `match.tournamentId` ở client.
- `watchByTournament()` hiện đã dùng snapshot chung cho luồng không lọc division; `watchLive()` cũng dùng snapshot này.

Để tránh kết quả thiếu, client xác nhận tổng số public matches nằm trong giới hạn 50 trang (tối đa 5000 match) trước khi dùng snapshot. Nếu vượt giới hạn, client fallback về phân trang riêng theo tournament; khi đó có thể xuất hiện fan-out như trước, nhưng không âm thầm bỏ các match cũ. Truy vấn theo tournament/division tiếp tục được dùng cho màn hình lọc division.

Ở Home, lựa chọn tốt hơn về payload vẫn là để card tải trang đầu mà nó thực sự hiển thị, hoặc thay prefetch toàn bộ history bằng summary/batch API có kết quả theo tournament. Nếu cần giảm request cả khi tập public vượt giới hạn snapshot, cần thiết kế endpoint batch có giới hạn số tournament ID, cursor, visibility enforcement và response nhóm theo `tournamentId`; chưa có endpoint batch đó trong backend hiện tại, không nên gọi endpoint giả định.

## Triển khai và kiểm tra

- Backend: API contract không đổi; áp dụng DB migration qua quy trình migration của môi trường triển khai để nhận index mới. Migration chưa được chạy trên database bởi thay đổi mã nguồn này.
- Flutter: thay đổi snapshot là client-side optimization, độc lập với database migration. Với tổng dữ liệu dưới ngưỡng 5000, log `/matches` nên chỉ có một chuỗi phân trang snapshot dùng chung thay cho chuỗi riêng theo từng tournament trong Home; trên ngưỡng, kỳ vọng fallback có thể tạo lại chuỗi riêng.
- So sánh số card, trạng thái live/completed/scheduled, match được render và thao tác refresh/socket trước-sau; đặc biệt kiểm tra trường hợp có trên 5000 public matches.
