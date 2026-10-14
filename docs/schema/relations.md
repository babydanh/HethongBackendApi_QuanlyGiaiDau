# Quan hệ khóa ngoại theo nhóm

> Tự sinh bởi `npm run db:docs` từ `src/database/schema/*.schema.ts`, không sửa tay. Kiểm tra còn khớp schema: `npm run db:docs:check`.

Mỗi cạnh: `bảng cha --o{ bảng con : cột FK`; `|o` là FK cho phép null.

## admin_tables

```mermaid
erDiagram
  users ||--o{ verification_tickets : "user_id"
  users |o--o{ verification_tickets : "reviewed_by"
  users ||--o{ user_bans : "user_id"
  users ||--o{ user_bans : "banned_by"
  users ||--o{ system_configs : "updated_by"
  users ||--o{ reports : "reporter_id"
  users |o--o{ reports : "assigned_to"
  users |o--o{ reports : "resolved_by"
  reports ||--o{ report_actions : "report_id"
  users |o--o{ report_actions : "actor_id"
```

## advertisements

```mermaid
erDiagram
  categories |o--o{ advertisements : "category_id"
```

## audit

```mermaid
erDiagram
  users |o--o{ audit_logs : "user_id"
```

## categories

```mermaid
erDiagram
  categories ||--o{ elo_tiers : "category_id"
  users ||--o{ user_ranks : "user_id"
  categories ||--o{ user_ranks : "category_id"
  communities |o--o{ user_ranks : "community_id"
  elo_tiers |o--o{ user_ranks : "tier_id"
  users ||--o{ elo_history_logs : "user_id"
  categories ||--o{ elo_history_logs : "category_id"
  users ||--o{ pair_ranks : "user1_id"
  users ||--o{ pair_ranks : "user2_id"
  categories ||--o{ pair_ranks : "category_id"
  communities |o--o{ pair_ranks : "community_id"
```

## club-match-sessions

```mermaid
erDiagram
  communities ||--o{ club_match_sessions : "community_id"
  categories ||--o{ club_match_sessions : "category_id"
  users ||--o{ club_match_sessions : "created_by"
  tournaments |o--o{ club_match_sessions : "bracket_tournament_id"
  tournament_venues |o--o{ club_match_sessions : "venue_id"
  venue_courts |o--o{ club_match_sessions : "court_id"
  club_match_sessions ||--o{ club_match_session_participants : "session_id"
  users ||--o{ club_match_session_participants : "user_id"
  users |o--o{ club_match_session_participants : "assigned_by"
  club_match_sessions ||--o{ club_match_preferences : "session_id"
  users ||--o{ club_match_preferences : "user_id"
  club_match_sessions ||--o{ club_match_session_matches : "session_id"
  users ||--o{ club_match_session_matches : "created_by"
  users |o--o{ club_match_session_matches : "score_confirmed_by"
  club_match_sessions ||--o{ club_match_session_commands : "session_id"
  users ||--o{ club_match_session_commands : "actor_id"
```

## club-standalone-matches

```mermaid
erDiagram
  communities ||--o{ club_standalone_matches : "community_id"
  categories ||--o{ club_standalone_matches : "category_id"
  users ||--o{ club_standalone_matches : "created_by"
  users |o--o{ club_standalone_matches : "score_confirmed_by"
```

## communities

```mermaid
erDiagram
  users ||--o{ communities : "creator_id"
  provinces |o--o{ communities : "province_code"
  wards |o--o{ communities : "ward_code"
  users |o--o{ communities : "approved_by"
  communities ||--o{ community_sports : "community_id"
  categories ||--o{ community_sports : "category_id"
  communities ||--o{ community_members : "community_id"
  users ||--o{ community_members : "user_id"
  users |o--o{ community_members : "invited_by"
  users |o--o{ community_members : "approved_by"
  communities ||--o{ community_follows : "community_id"
  users ||--o{ community_follows : "user_id"
  communities ||--o{ community_challenges : "challenger_id"
  communities ||--o{ community_challenges : "challenged_id"
  users ||--o{ community_challenges : "sender_user_id"
  tournaments |o--o{ community_challenges : "tournament_id"
```

## community_gallery

```mermaid
erDiagram
  communities ||--o{ community_gallery : "community_id"
  users |o--o{ community_gallery : "uploader_id"
```

## community_rankings

```mermaid
erDiagram
  communities ||--o{ community_rankings : "community_id"
  users ||--o{ community_rankings : "user_id"
  categories ||--o{ community_rankings : "category_id"
```

## community_social

```mermaid
erDiagram
  communities ||--o{ community_social_settings : "community_id"
  communities |o--o{ community_posts : "community_id"
  users |o--o{ community_posts : "author_id"
  tournaments |o--o{ community_posts : "tournament_id"
  club_match_sessions |o--o{ community_posts : "club_match_session_id"
  community_posts |o--o{ community_posts : "shared_post_id"
  club_match_sessions ||--o{ club_match_digest_items : "session_id"
  club_match_session_matches ||--o{ club_match_digest_items : "match_id"
  community_posts |o--o{ club_match_digest_items : "post_id"
  community_posts ||--o{ community_post_comments : "post_id"
  users |o--o{ community_post_comments : "author_id"
  community_post_comments ||--o{ community_comment_reactions : "comment_id"
  users ||--o{ community_comment_reactions : "user_id"
  community_posts ||--o{ community_post_reactions : "post_id"
  users ||--o{ community_post_reactions : "user_id"
  communities ||--o{ community_social_reports : "community_id"
  users ||--o{ community_social_reports : "reporter_id"
  community_posts |o--o{ community_social_reports : "post_id"
  community_post_comments |o--o{ community_social_reports : "comment_id"
  communities ||--o{ community_member_social_preferences : "community_id"
  users ||--o{ community_member_social_preferences : "user_id"
  communities ||--o{ community_polls : "community_id"
  community_posts |o--o{ community_polls : "post_id"
  users |o--o{ community_polls : "creator_id"
  community_polls ||--o{ community_poll_options : "poll_id"
  users |o--o{ community_poll_options : "creator_id"
  community_polls ||--o{ community_poll_votes : "poll_id"
  community_poll_options ||--o{ community_poll_votes : "option_id"
  users ||--o{ community_poll_votes : "user_id"
```

## community_tag_presets

```mermaid
erDiagram
  communities ||--o{ community_tag_presets : "community_id"
  users |o--o{ community_tag_presets : "created_by"
```

## football

```mermaid
erDiagram
  categories ||--o{ football_teams : "category_id"
  communities |o--o{ football_teams : "community_id"
  users ||--o{ football_teams : "created_by"
  football_teams ||--o{ football_team_members : "team_id"
  users ||--o{ football_team_members : "user_id"
  users |o--o{ football_team_members : "invited_by"
  football_teams ||--o{ football_team_invites : "team_id"
  users ||--o{ football_team_invites : "user_id"
  users ||--o{ football_team_invites : "invited_by"
  tournaments ||--o{ tournament_team_entries : "tournament_id"
  tournament_divisions ||--o{ tournament_team_entries : "division_id"
  football_teams ||--o{ tournament_team_entries : "team_id"
  users ||--o{ tournament_team_entries : "created_by"
  tournament_team_entries ||--o{ tournament_team_roster_snapshots : "entry_id"
  users ||--o{ tournament_team_roster_snapshots : "user_id"
  football_teams ||--o{ football_team_ranks : "team_id"
  categories ||--o{ football_team_ranks : "category_id"
  elo_tiers |o--o{ football_team_ranks : "tier_id"
  football_team_ranks ||--o{ football_elo_events : "team_rank_id"
  matches ||--o{ football_elo_events : "match_id"
```

## livestream

```mermaid
erDiagram
  tournaments ||--o{ livestream_cameras : "tournament_id"
  venue_courts |o--o{ livestream_cameras : "court_id"
  users |o--o{ livestream_cameras : "created_by"
  matches ||--o{ match_livestreams : "match_id"
  livestream_cameras |o--o{ match_livestreams : "camera_id"
  communities ||--o{ facebook_page_connections : "community_id"
  users |o--o{ facebook_page_connections : "connected_by"
  communities ||--o{ camera_devices : "community_id"
  venue_courts |o--o{ camera_devices : "default_court_id"
  users |o--o{ camera_devices : "assigned_operator_id"
  users |o--o{ camera_devices : "created_by"
  tournaments ||--o{ live_sessions : "tournament_id"
  venue_courts |o--o{ live_sessions : "court_id"
  matches ||--o{ live_sessions : "match_id"
  camera_devices |o--o{ live_sessions : "camera_device_id"
  users |o--o{ live_sessions : "created_by"
```

## matches

```mermaid
erDiagram
  tournament_groups ||--o{ group_standings : "group_id"
  tournament_participants ||--o{ group_standings : "participant_id"
  tournament_groups |o--o{ matches : "group_id"
  tournaments ||--o{ matches : "tournament_id"
  tournament_stages ||--o{ matches : "stage_id"
  tournament_participants |o--o{ matches : "participant1_id"
  tournament_participants |o--o{ matches : "participant2_id"
  tournament_participants |o--o{ matches : "winner_id"
  venue_courts |o--o{ matches : "court_id"
  users |o--o{ matches : "referee_id"
  users |o--o{ matches : "score_confirmed_by"
  matches ||--o{ match_players : "match_id"
  tournament_participants ||--o{ match_players : "participant_id"
  users ||--o{ match_players : "user_id"
  matches ||--o{ match_disputes : "match_id"
  users ||--o{ match_disputes : "filed_by"
  users |o--o{ match_disputes : "resolved_by"
  matches |o--o{ match_elo_outbox : "match_id"
  club_match_session_matches |o--o{ match_elo_outbox : "club_match_session_match_id"
  club_standalone_matches |o--o{ match_elo_outbox : "standalone_match_id"
```

## notifications

```mermaid
erDiagram
  users ||--o{ notifications : "receiver_id"
  users |o--o{ notifications : "sender_id"
  matches ||--o{ match_comments : "match_id"
  users |o--o{ match_comments : "user_id"
  matches ||--o{ match_muted_users : "match_id"
  users ||--o{ match_muted_users : "user_id"
  users |o--o{ match_muted_users : "muted_by"
  matches ||--o{ match_reactions : "match_id"
  users ||--o{ match_reactions : "user_id"
```

## otp_codes

```mermaid
erDiagram
  users ||--o{ otp_codes : "user_id"
```

## payments

```mermaid
erDiagram
  users ||--o{ payments : "user_id"
  tournament_participants |o--o{ payments : "participant_id"
  tournaments ||--o{ payments : "tournament_id"
  payments ||--o{ payment_refunds : "payment_id"
  users |o--o{ payment_refunds : "requested_by"
  users |o--o{ payment_refunds : "processed_by"
  payments ||--o{ payment_status_logs : "payment_id"
  users |o--o{ payment_status_logs : "changed_by"
  payments |o--o{ payment_webhook_events : "payment_id"
  payments ||--o{ payment_receipts : "payment_id"
  tournaments |o--o{ payment_receipts : "tournament_id"
  users |o--o{ payment_receipts : "buyer_user_id"
  tournaments ||--o{ organizer_payouts : "tournament_id"
  users ||--o{ organizer_payouts : "organizer_id"
  users |o--o{ organizer_payouts : "processed_by"
  tournaments ||--o{ financial_ledger_entries : "tournament_id"
  payments |o--o{ financial_ledger_entries : "payment_id"
  payment_refunds |o--o{ financial_ledger_entries : "refund_id"
  organizer_payouts |o--o{ financial_ledger_entries : "payout_id"
  users |o--o{ financial_ledger_entries : "created_by"
  organizer_payouts ||--o{ payout_status_logs : "payout_id"
  users |o--o{ payout_status_logs : "changed_by"
```

## ranking-admin

```mermaid
erDiagram
  users ||--o{ ranking_context_statuses : "user_id"
  categories ||--o{ ranking_context_statuses : "category_id"
  communities |o--o{ ranking_context_statuses : "community_id"
  users ||--o{ ranking_context_statuses : "changed_by"
  users ||--o{ admin_elo_operations : "admin_user_id"
  users ||--o{ admin_elo_operations : "user_id"
  categories ||--o{ admin_elo_operations : "category_id"
  communities |o--o{ admin_elo_operations : "community_id"
```

## regions

```mermaid
erDiagram
  provinces ||--o{ wards : "province_code"
```

## series

```mermaid
erDiagram
  users ||--o{ tournament_series : "organizer_id"
  tournament_series ||--o{ series_legs : "series_id"
  series_legs ||--o{ series_events : "leg_id"
  tournaments ||--o{ series_events : "tournament_id"
  series_legs ||--o{ series_standings : "leg_id"
  users ||--o{ series_standings : "user_id"
  categories ||--o{ series_standings : "category_id"
  series_events |o--o{ series_standings : "qualified_event_id"
  series_standings ||--o{ psr_point_logs : "standing_id"
  series_events ||--o{ psr_point_logs : "event_id"
  tournament_participants ||--o{ psr_point_logs : "participant_id"
  tournament_series ||--o{ series_invitations : "series_id"
  tournament_series ||--o{ series_managers : "series_id"
  users ||--o{ series_managers : "user_id"
```

## social-sessions

```mermaid
erDiagram
  communities |o--o{ social_sessions : "community_id"
  users ||--o{ social_sessions : "host_user_id"
  categories ||--o{ social_sessions : "category_id"
  tournament_venues |o--o{ social_sessions : "venue_id"
  venue_courts |o--o{ social_sessions : "court_id"
  social_sessions ||--o{ social_session_participants : "session_id"
  users |o--o{ social_session_participants : "user_id"
```

## social

```mermaid
erDiagram
  users ||--o{ friendships : "sender_id"
  users ||--o{ friendships : "receiver_id"
  communities |o--o{ chat_rooms : "community_id"
  social_sessions |o--o{ chat_rooms : "social_session_id"
  chat_rooms ||--o{ chat_room_members : "room_id"
  users ||--o{ chat_room_members : "user_id"
  chat_rooms ||--o{ chat_messages : "room_id"
  users |o--o{ chat_messages : "sender_id"
  users |o--o{ chat_messages : "revoked_by"
  users |o--o{ chat_messages : "pinned_by"
  chat_messages ||--o{ chat_message_reactions : "message_id"
  users ||--o{ chat_message_reactions : "user_id"
  chat_rooms ||--o{ chat_read_states : "room_id"
  users ||--o{ chat_read_states : "user_id"
  users ||--o{ chat_blocks : "blocker_id"
  users ||--o{ chat_blocks : "blocked_id"
```

## tournament-roster-import-batches

```mermaid
erDiagram
  tournaments ||--o{ tournament_roster_import_batches : "tournament_id"
  users ||--o{ tournament_roster_import_batches : "manager_user_id"
```

## tournament_divisions

```mermaid
erDiagram
  tournaments ||--o{ tournament_divisions : "tournament_id"
  tournament_venues |o--o{ tournament_divisions : "venue_id"
```

## tournament_sponsors

```mermaid
erDiagram
  tournaments ||--o{ tournament_sponsors : "tournament_id"
  users ||--o{ tournament_sponsors : "created_by"
  users ||--o{ tournament_sponsors : "updated_by"
```

## tournaments

```mermaid
erDiagram
  users ||--o{ parent_tournaments : "created_by"
  parent_tournaments |o--o{ tournaments : "parent_id"
  communities |o--o{ tournaments : "community_id"
  categories ||--o{ tournaments : "category_id"
  users ||--o{ tournaments : "created_by"
  tournament_venues |o--o{ tournaments : "venue_id"
  tournaments ||--o{ tournament_stages : "tournament_id"
  tournament_divisions |o--o{ tournament_stages : "tournament_division_id"
  tournament_venues |o--o{ tournament_stages : "venue_id"
  tournament_stages ||--o{ tournament_groups : "stage_id"
  tournaments ||--o{ tournament_participants : "tournament_id"
  tournament_divisions |o--o{ tournament_participants : "tournament_division_id"
  tournament_groups |o--o{ tournament_participants : "group_id"
  users ||--o{ tournament_participants : "registered_by"
  users |o--o{ tournament_participants : "partner_user_id"
  tournament_participants ||--o{ tournament_rosters : "participant_id"
  users ||--o{ tournament_rosters : "user_id"
  tournaments ||--o{ tournament_referees : "tournament_id"
  users ||--o{ tournament_referees : "user_id"
  users |o--o{ tournament_referees : "assigned_by"
  tournaments ||--o{ tournament_staff : "tournament_id"
  users ||--o{ tournament_staff : "user_id"
  users |o--o{ tournament_staff : "created_by"
  tournaments ||--o{ tournament_follows : "tournament_id"
  users ||--o{ tournament_follows : "user_id"
```

## user-devices

```mermaid
erDiagram
  users ||--o{ user_device_tokens : "user_id"
```

## users

```mermaid
erDiagram
  users ||--o{ auth_providers : "user_id"
  users ||--o{ user_to_roles : "user_id"
  roles ||--o{ user_to_roles : "role_id"
  users |o--o{ user_to_roles : "assigned_by"
  users ||--o{ profiles : "user_id"
  provinces |o--o{ profiles : "province_code"
  users ||--o{ sessions : "user_id"
  users ||--o{ organizer_reviews : "organizer_id"
  users ||--o{ organizer_reviews : "reviewer_id"
  tournaments ||--o{ organizer_reviews : "tournament_id"
  users ||--o{ user_change_requests : "user_id"
```

## venues

```mermaid
erDiagram
  users |o--o{ tournament_venues : "owner_user_id"
  tournament_venues ||--o{ venue_courts : "venue_id"
  tournament_venues ||--o{ venue_pricing_rules : "venue_id"
  venue_courts |o--o{ venue_pricing_rules : "court_id"
  tournament_venues ||--o{ court_bookings : "venue_id"
  venue_courts ||--o{ court_bookings : "court_id"
  users ||--o{ court_bookings : "user_id"
```

## zalo-notification

```mermaid
erDiagram
  users |o--o{ zalo_notification_outbox : "recipient_user_id"
```
