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
