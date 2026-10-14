# Bản đồ database

> Tự sinh bởi `npm run db:docs` từ `src/database/schema/*.schema.ts`, không sửa tay. Kiểm tra còn khớp schema: `npm run db:docs:check`.

113 bảng · 281 khóa ngoại · 30 nhóm nghiệp vụ (mỗi file `src/database/schema/<nhóm>.schema.ts` là một nhóm) · 31/113 bảng có mô tả.

- Cột, kiểu, mô tả từng cột: mở file schema của nhóm (JSDoc nằm ngay trên bảng/cột).
- Quan hệ khóa ngoại từng nhóm (Mermaid): [relations.md](./relations.md).
- Audit: [audit.md](./audit.md) (183 khóa ngoại chưa có index, 0 bảng thiếu khóa chính, 82 bảng chưa có mô tả).

## admin_tables

- `verification_tickets`
- `user_bans`
- `system_configs`
- `reports`
- `report_actions`

## advertisements

- `advertisements`

## audit

- `audit_logs`

## categories

- `categories`: Môn thi đấu, ví dụ Pickleball, Tennis, Badminton, Table Tennis, Football (categories.seed.ts). Giải, ELO và bảng xếp hạng đều gắn với một môn qua categoryId.
- `elo_tiers`: Bậc ELO của một môn (ví dụ "Tier S", "High Tier A"), có khoảng minElo–maxElo và icon. Ngưỡng gán bậc cho người chơi nằm cứng trong code (rankings.service.ts:1520-1529), không lấy từ minElo/maxElo.
- `user_ranks`
- `elo_history_logs`: Nhật ký mỗi lần ELO của một người chơi thay đổi: ELO trước, sau và chênh lệch. Với trận đấu có matchId, unique index (matchId, userId) chặn tính trùng (categories.schema.ts:129-133).
- `pair_ranks`

## club-match-sessions

- `club_match_sessions`
- `club_match_session_participants`
- `club_match_preferences`
- `club_match_session_matches`
- `club_match_session_commands`

## club-standalone-matches

- `club_standalone_matches`: A club activity match that is not owned by a social session or tournament.

## communities

- `communities`: Câu lạc bộ (CLB). Trong code, "community" nghĩa là CLB. Mỗi CLB có đúng một môn thể thao (community_sports),
- `community_sports`
- `community_members`
- `community_follows`
- `community_challenges`

## community_gallery

- `community_gallery`

## community_rankings

- `community_rankings`

## community_social

- `community_social_settings`
- `community_posts`: Bài đăng mạng xã hội. communityId có giá trị là bài của CLB; NULL là bài cá nhân (profile post).
- `club_match_digest_items`
- `community_post_comments`: Bình luận trên bài đăng. parentId trỏ tới bình luận cha khi đây là trả lời.
- `community_comment_reactions`: One persisted reaction per member and comment. Viewer details are joined
- `community_post_reactions`
- `community_social_reports`
- `community_member_social_preferences`
- `community_polls`: Bình chọn (poll) gắn với một bài đăng. Poll đóng khi isClosed = true hoặc đã quá expiresAt,
- `community_poll_options`
- `community_poll_votes`

## community_tag_presets

- `community_tag_presets`

## football

- `football_teams`: Đội bóng trong module bóng đá. Thuộc một danh mục (category) và có thể gắn cộng đồng.
- `football_team_members`
- `football_team_invites`
- `tournament_team_entries`
- `tournament_team_roster_snapshots`
- `football_team_ranks`
- `football_elo_events`

## livestream

- `livestream_cameras`
- `match_livestreams`
- `facebook_page_connections`
- `camera_devices`
- `live_sessions`

## matches

- `group_standings`
- `matches`
- `match_players`
- `match_disputes`
- `match_elo_outbox`

## notifications

- `notifications`
- `match_comments`
- `match_muted_users`
- `match_reactions`

## otp_codes

- `otp_codes`

## payments

- `payments`: Thanh toán PayOS cho một khoản của giải đấu: lệ phí đăng ký, phí đăng bài giải hoặc phí nền tảng.
- `payment_refunds`: Yêu cầu hoàn tiền cho một payment. Tạo ở REQUESTED cùng lúc payment chuyển refundStatus sang PENDING_REFUND.
- `payment_status_logs`
- `payment_webhook_events`
- `payment_receipts`
- `organizer_payouts`: Yêu cầu chi trả cho BTC (organizer) từ lệ phí đăng ký của một giải.
- `financial_ledger_entries`: Sổ cái tài chính theo giải đấu. Số dư khả dụng của BTC = tổng CREDIT − tổng DEBIT (dùng khi BTC yêu cầu rút).
- `payout_status_logs`

## ranking-admin

- `ranking_context_statuses`
- `admin_elo_operations`

## regions

- `provinces`: Tỉnh/thành phố (cấp 1). `code` là mã duy nhất; `wards.province_code` tham chiếu tới `provinces.code`.
- `wards`

## series

- `tournament_series`: Chuỗi giải (series): nhóm các chặng (series_legs) và giải con (series_events) để cộng điểm PSR vào bảng xếp hạng chung của chuỗi. Thể thức tính điểm nằm trong cột rules.
- `series_legs`: Chặng của series, có khoảng thời gian và trạng thái riêng. Số suất vào thẳng/wildcard và thể thức PSR có thể cấu hình theo chặng.
- `series_events`: Gắn một giải vào một chặng của series, kèm hệ số điểm. Mỗi giải chỉ thuộc tối đa một series event (unique tournamentId).
- `series_standings`
- `psr_point_logs`: Nhật ký điểm PSR: mỗi dòng là điểm một VĐV nhận được từ một giải của chuỗi, kèm hạng đạt được, điểm gốc, hệ số và điểm cuối (series.service.ts:265-274).
- `series_invitations`
- `series_managers`

## social-sessions

- `social_sessions`: Social Session (Kèo giao lưu thể thao — Social của Flutter).
- `social_session_participants`: Social Session Participant (1 row = 1 participant/request identity).

## social

- `friendships`
- `chat_rooms`: Phòng chat. type quyết định loại phòng: DIRECT (mặc định, chat 1-1), GROUP, SUPPORT (hỗ trợ), CLUB (chat của một CLB),
- `chat_room_members`
- `chat_messages`
- `chat_message_reactions`
- `chat_read_states`
- `chat_blocks`: User-level chat block. A block is symmetric for access checks, but the

## tournament-roster-import-batches

- `tournament_roster_import_batches`

## tournament_divisions

- `tournament_divisions`: Hạng mục (nội dung thi đấu) của một giải, ví dụ đơn, đôi, đôi nam nữ. Có thể ghi đè phí, sơ đồ thi đấu và khoảng ELO so với giải. Xóa giải sẽ xóa các hạng mục (onDelete cascade).

## tournament_sponsors

- `tournament_sponsors`

## tournaments

- `parent_tournaments`
- `tournaments`: Giải đấu do người tổ chức tạo. Là gốc của hạng mục (tournament_divisions), đăng ký (tournament_participants), vòng đấu (tournament_stages), nhân sự, trọng tài và lượt theo dõi.
- `tournament_stages`: Vòng thi đấu của giải, hoặc của một hạng mục khi tournamentDivisionId có giá trị. Thứ tự hiển thị theo cột order.
- `tournament_groups`: Bảng (nhóm) thi đấu thuộc một vòng (tournament_stages). Không có FK trực tiếp tới giải; truy cập giải qua stageId.
- `tournament_participants`: Đăng ký tham gia một hạng mục của giải: một đội, một cặp đôi hoặc một VĐV đơn. Trạng thái xử lý nằm ở teamStatus; người chơi thực tế nằm ở tournament_rosters.
- `tournament_rosters`
- `tournament_referees`
- `tournament_staff`
- `tournament_follows`

## user-devices

- `user_device_tokens`

## users

- `users`: Tài khoản đăng nhập (email, mật khẩu hoặc OAuth). Thông tin hiển thị nằm ở profiles (quan hệ 1-1).
- `auth_providers`
- `roles`
- `user_to_roles`
- `profiles`
- `sessions`
- `organizer_reviews`
- `user_change_requests`

## venues

- `tournament_venues`: Địa điểm thi đấu (sân) của người dùng. Người sở hữu lưu ở `owner_user_id`.
- `venue_courts`: Sân con (court) thuộc một địa điểm (`tournament_venues`).
- `venue_pricing_rules`
- `court_bookings`

## zalo-notification

- `zalo_notification_outbox`
