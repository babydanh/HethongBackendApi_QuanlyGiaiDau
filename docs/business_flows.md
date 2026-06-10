# Kiến trúc Luồng Xử Lý Nội Bộ (Internal Architecture Flows)

Khác với các sơ đồ High-level chỉ vẽ mũi tên qua lại, tài liệu này đi sâu vào **Kiến trúc Mã nguồn Nội bộ (Internal Code Architecture)**. Mọi Developer khi code các Module này bắt buộc phải tuân thủ luồng truyền `transaction (tx)` và cách sắp xếp layer `Controller -> Service -> Repository`.

---

## 1. Luồng Thanh toán VNPay (Webhook Flow)
Luồng này đòi hỏi tính ACID nghiêm ngặt (Skill 2). Nếu Cập nhật Payment thành công nhưng bị lỗi lúc Ghi AuditLog thì MỌI THỨ PHẢI ĐƯỢC ROLLBACK.

```mermaid
sequenceDiagram
    participant WebhookController
    participant PaymentsService
    participant PaymentsRepo
    participant ParticipantsRepo
    participant AuditService
    participant DB

    WebhookController->>PaymentsService: processVnPayWebhook(payload)
    Note over PaymentsService: Bắt đầu: db.transaction(async (tx) => { ... })
    
    PaymentsService->>PaymentsRepo: updateStatus(id, 'SUCCESS', tx)
    PaymentsRepo->>DB: UPDATE payments ...
    
    PaymentsService->>ParticipantsRepo: updateIsPaid(participantId, true, tx)
    ParticipantsRepo->>DB: UPDATE tournament_participants ...
    
    PaymentsService->>AuditService: logAction('WEBHOOK_SUCCESS', 'payments', id, tx)
    AuditService->>DB: INSERT INTO audit_logs ...
    
    Note over PaymentsService: Commit: Tự động nếu không có Exception. Rollback nếu có Lỗi.
    PaymentsService-->>WebhookController: return success
```

---

## 2. Luồng Sinh Nhánh Đấu (Bracket Generation)
Chỉ Admin giải được gọi. Logic chia hạt giống và đội đặc cách (isBye) nằm ở Service.

```mermaid
sequenceDiagram
    participant TournamentsController
    participant TournamentsService
    participant BracketEngine (Util)
    participant MatchesRepo
    participant DB

    TournamentsController->>TournamentsService: generateBracket(tournamentId)
    TournamentsService->>DB: Count participants (isPaid = true)
    
    Note over TournamentsService: Tính toán Toán học: Tìm Power of 2 gần nhất.<br/>VD: 25 đội -> Nhánh 32 -> 7 đội có cờ isBye = true
    
    TournamentsService->>BracketEngine: buildTree(participants, 7 byes)
    BracketEngine-->>TournamentsService: Array<MatchEntity>
    
    Note over TournamentsService: db.transaction(async (tx) => { ... })
    TournamentsService->>MatchesRepo: batchInsertMatches(Array<MatchEntity>, tx)
    MatchesRepo->>DB: BATCH INSERT INTO matches (round, order, is_bye, ...)
    Note over TournamentsService: Commit
```

---

## 3. Luồng Live Score (WebSocket + HTTP)
Sử dụng kết hợp Gateways (Socket) để phát Real-time, nhưng vẫn dùng HTTP để đảm bảo an toàn thao tác.

```mermaid
sequenceDiagram
    participant Client (Referee)
    participant Client (Audience)
    participant MatchesController
    participant MatchesService
    participant MatchesGateway (WS)
    participant DB

    Note over Client (Referee), DB: 1. Hành động Tăng điểm (Cường độ cao)
    Client (Referee)->>MatchesController: PATCH /matches/:id/score (scoreDetails)
    MatchesController->>MatchesService: updateScore(matchId, details)
    MatchesService->>DB: UPDATE matches SET score_details = ...
    MatchesService->>MatchesGateway: emitToRoom('match:score:update', payload)
    MatchesGateway-->>Client (Audience): Bắt Event WebSocket -> Nhảy điểm
    
    Note over Client (Referee), DB: 2. Hành động Chốt Kết Quả (Cường độ thấp, Quan trọng cao)
    Client (Referee)->>MatchesController: PATCH /matches/:id/status (COMPLETED)
    MatchesController->>MatchesService: completeMatch(matchId, winnerId)
    Note over MatchesService: db.transaction((tx) => { ... })
    MatchesService->>DB: Cập nhật status='COMPLETED' (tx)
    MatchesService->>DB: Đẩy Winner lên next_match_id (tx)
    MatchesService->>DB: Lưu AuditLog "Referee X confirmed" (tx)
```

---

## 4. Luồng Tính ELO (Pessimistic Locking)
Luồng này chạy nền (Async Job/Cron) sau khi trận đấu kết thúc. Sử dụng Khóa Dữ Liệu `FOR UPDATE` để ngăn chặn lỗi đồng bộ nếu 1 User kết thúc 2 trận đấu sát giờ nhau.

```mermaid
sequenceDiagram
    participant EloJobQueue
    participant RankingsService
    participant RanksRepo
    participant DB

    EloJobQueue->>RankingsService: processMatchResult(matchId)
    Note over RankingsService: db.transaction(async (tx) => { ... })
    
    RankingsService->>RanksRepo: getUserRankForUpdate(userId, tx)
    Note over RanksRepo, DB: Kích hoạt SQL: SELECT * FROM user_ranks FOR UPDATE
    DB-->>RanksRepo: Row Locked (Khóa chống Ghi)
    
    RankingsService->>RankingsService: Tính toán K-Factor = New ELO
    
    RankingsService->>RanksRepo: updateElo(userId, newElo, tx)
    RankingsService->>RanksRepo: insertEloHistory(userId, diff, tx)
    
    Note over RankingsService: Commit Transaction
    Note over RanksRepo, DB: Mở khóa Row (Unlocked)
```

---

## 5. Luồng Đăng Ký Đánh Đôi (Doubles Registration — Phase 5)
Giải đấu doubles yêu cầu 2 người tạo thành 1 đội. Người 1 đăng ký trước, hệ thống sinh link mời, Người 2 nhấn link để join.

```mermaid
sequenceDiagram
    participant Leader
    participant Partner
    participant FE as Frontend
    participant BE as Backend API
    participant DB

    Leader->>FE: Nhấn "Đăng ký giải đấu"
    FE->>BE: POST /tournaments/:id/register { teamName }
    Note over BE: Tạo participant (teamStatus: PENDING)<br/>Tạo roster cho Leader<br/>Sinh teamInviteToken
    BE-->>FE: { participant, teamInviteLink }
    FE-->>Leader: Hiển thị link mời + QR Code

    Leader->>Partner: Gửi link mời (chat/SMS)
    Partner->>FE: Mở link /join-team?pid=...&token=...
    FE->>BE: POST /tournaments/:id/join-team { participantId, teamInviteToken }
    Note over BE: Validate token<br/>Check giới tính (nếu MIXED)<br/>Tạo roster cho Partner<br/>teamStatus → COMPLETE
    BE-->>FE: { participant, paymentUrl? }

    alt Có phí tham gia
        FE->>Partner: Redirect sang cổng thanh toán
    else Miễn phí
        FE->>Partner: Toast "Đã tham gia đội thành công!"
    end
```

---

## 6. Luồng Tính ELO Nâng Cao (Phase 5)
ELO tách thành 2 scope: Public (user_ranks) và Community (community_rankings). K-factor thông minh dựa trên số trận + chuỗi thắng.

```mermaid
sequenceDiagram
    participant MatchService
    participant EloEngine
    participant DB

    MatchService->>EloEngine: processMatchResult(match, tournament)
    Note over EloEngine: Xác định scope:<br/>PUBLIC → user_ranks<br/>CLUB → community_rankings

    EloEngine->>DB: BEGIN TRANSACTION
    EloEngine->>DB: SELECT ... FOR UPDATE (winner + loser ranks)

    Note over EloEngine: Tính K-Factor:<br/>< 10 trận → K=40<br/>10-30 trận → K=24<br/>> 30 trận → K=16

    Note over EloEngine: Win Streak Bonus:<br/>3 thắng → ×1.1<br/>5 thắng → ×1.2<br/>7+ thắng → ×1.3

    Note over EloEngine: Upset Bonus:<br/>Thắng ELO cao hơn 200+ → +5<br/>Thắng ELO cao hơn 400+ → +10

    EloEngine->>DB: UPDATE ranks (winner: +ELO, streak++)<br/>UPDATE ranks (loser: -ELO, streak=0)
    EloEngine->>DB: INSERT elo_history_logs (2 records)
    EloEngine->>DB: COMMIT
```

---

## 7. Luồng Đăng Ký Giải Private (Invite Link — Phase 5)
Giải PRIVATE ẩn khỏi tìm kiếm. Chỉ ai có link mời mới truy cập và đăng ký được.

```mermaid
sequenceDiagram
    participant BTC as Ban Tổ Chức
    participant User
    participant FE as Frontend
    participant BE as Backend API

    BTC->>FE: Setting giải đấu: visibility = PRIVATE
    FE->>BE: PATCH /tournaments/:id { visibility: 'PRIVATE' }
    BE-->>FE: Trả về inviteCode

    BTC->>User: Gửi link mời (copy từ manage page)

    User->>FE: Mở link /tournaments/:id/register?invite=ABC123
    FE->>BE: POST /tournaments/:id/validate-invite { inviteCode: 'ABC123' }

    alt Code hợp lệ
        BE-->>FE: Thông tin giải đấu
        FE-->>User: Hiển thị form đăng ký
        alt User chưa đăng nhập
            FE->>User: Redirect /login?redirect=...
            User->>FE: Đăng nhập xong → quay lại trang đăng ký
        end
        User->>FE: Nhấn "Đăng ký"
        FE->>BE: POST /tournaments/:id/register { inviteCode, teamName }
    else Code không hợp lệ
        BE-->>FE: 400 "Mã mời không hợp lệ"
        FE-->>User: Hiển thị lỗi
    end
```
