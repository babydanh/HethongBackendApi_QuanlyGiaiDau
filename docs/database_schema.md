```sql
-- KÍCH HOẠT EXTENSION
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

/* =========================================================================
   DATABASE SCHEMA REVIEW & AUDIT REPORT (UPDATED ALIGNED WITH DRIZZLE SCHEMAS)
   -------------------------------------------------------------------------
   Bản phân tích Schema này đã được cập nhật chính xác theo các định nghĩa Drizzle ORM
   trong backend-api_qlgiaidau/src/database/schema/.
   ========================================================================= */

-- ==========================================
-- 1. TẦNG AUTHENTICATION, PHÂN QUYỀN & AUDIT LOG
-- ==========================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT,
    is_email_verified BOOLEAN DEFAULT FALSE NOT NULL,
    is_mock BOOLEAN DEFAULT FALSE NOT NULL,
    accepted_tos_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE auth_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    provider VARCHAR(50) NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    provider_email VARCHAR(255),
    provider_avatar_url TEXT,
    provider_display_name VARCHAR(255),
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    CONSTRAINT provider_user_unique UNIQUE (provider, provider_user_id)
);

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE user_to_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE NOT NULL,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT user_role_unique_idx UNIQUE (user_id, role_id)
);

CREATE TABLE profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    cover_url TEXT,
    phone_number VARCHAR(20),
    date_of_birth DATE,
    gender VARCHAR(20),
    address TEXT,
    bio TEXT,
    province_code VARCHAR(20) REFERENCES provinces(code) ON DELETE SET NULL,
    is_verified BOOLEAN DEFAULT FALSE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    refresh_token TEXT NOT NULL UNIQUE,
    user_agent TEXT,
    ip_address VARCHAR(45),
    is_revoked BOOLEAN DEFAULT FALSE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);


-- ==========================================
-- 2. TẦNG ĐA MÔN THỂ THAO & RANKING (ELO TIERS)
-- ==========================================
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    slug VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    category_config JSONB DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE elo_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) NOT NULL,
    min_elo INTEGER NOT NULL,
    max_elo INTEGER NOT NULL,
    icon_url TEXT,
    CONSTRAINT category_tier_name_unique UNIQUE (category_id, name),
    CONSTRAINT elo_range_valid CHECK (min_elo < max_elo)
);

CREATE TABLE user_ranks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE NOT NULL,
    elo_points INTEGER DEFAULT 1200 NOT NULL,
    tier_id UUID REFERENCES elo_tiers(id) ON DELETE SET NULL,
    matches_played INTEGER DEFAULT 0 NOT NULL,
    matches_won INTEGER DEFAULT 0 NOT NULL,
    win_streak INTEGER DEFAULT 0 NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    CONSTRAINT user_category_rank_unique_idx UNIQUE (user_id, category_id),
    CONSTRAINT elo_non_negative CHECK (elo_points >= 0),
    CONSTRAINT wins_lte_played CHECK (matches_won <= matches_played)
);

CREATE TABLE elo_history_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE NOT NULL,
    match_id UUID, -- NULL nếu do admin chỉnh tay
    reason VARCHAR(100), -- 'MATCH_WIN', 'MATCH_LOSS', 'ADMIN_ADJUSTMENT', 'SEASON_RESET'
    previous_elo INTEGER NOT NULL,
    new_elo INTEGER NOT NULL,
    changed_points INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);


-- ==========================================
-- 3. TẦNG CỘNG ĐỒNG & ĐỊNH VỊ GIS
-- ==========================================
CREATE TABLE communities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    logo_url TEXT,
    banner_url TEXT,
    creator_id UUID REFERENCES users(id) ON DELETE RESTRICT NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING' NOT NULL,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    rejected_reason TEXT,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    location_geolocation GEOGRAPHY(Point, 4326),
    location_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE community_sports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE NOT NULL,
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE NOT NULL,
    CONSTRAINT community_sport_unique UNIQUE (community_id, category_id)
);

CREATE TABLE community_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    role VARCHAR(50) DEFAULT 'MEMBER' NOT NULL, -- 'MEMBER' | 'MODERATOR' | 'OWNER'
    status VARCHAR(50) DEFAULT 'JOINED' NOT NULL, -- 'JOINED' | 'PENDING' | 'INVITED' | 'REJECTED' | 'BANNED'
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    CONSTRAINT community_user_unique_idx UNIQUE (community_id, user_id)
);

-- Ghi chú nghiệp vụ community_members:
-- 'JOINED'   : thành viên chính thức, có thể được phân quyền theo role.
-- 'PENDING'  : đã gửi đơn xin vào cộng đồng, chờ OWNER/MODERATOR duyệt.
-- 'INVITED'  : đã được mời nhưng chưa chấp nhận lời mời.
-- 'REJECTED' : đơn xin tham gia đã bị từ chối.
-- 'BANNED'   : bị cấm khỏi cộng đồng, không thể tự tham gia lại cho đến khi được gỡ cấm.

CREATE TABLE community_rankings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE NOT NULL,
    elo_points INTEGER DEFAULT 1000 NOT NULL,
    matches_played INTEGER DEFAULT 0 NOT NULL,
    matches_won INTEGER DEFAULT 0 NOT NULL,
    win_streak INTEGER DEFAULT 0 NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    CONSTRAINT community_user_category_unique UNIQUE (community_id, user_id, category_id),
    CONSTRAINT community_elo_non_negative CHECK (elo_points >= 0)
);


-- ==========================================
-- 4. TẦNG ĐỊA ĐIỂM SÂN THI ĐẤU (VENUES)
-- ==========================================
CREATE TABLE tournament_venues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    location_address TEXT NOT NULL,
    location_geolocation GEOGRAPHY(Point, 4326),
    images_urls TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE venue_courts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID REFERENCES tournament_venues(id) ON DELETE CASCADE NOT NULL,
    court_name VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'AVAILABLE' NOT NULL
);


-- ==========================================
-- 5. TẦNG GIẢI ĐẤU (TOURNAMENTS & DIVISIONS)
-- ==========================================
CREATE TABLE parent_tournaments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    banner_url TEXT,
    logo_url TEXT,
    sports JSONB DEFAULT '[]'::jsonb NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE RESTRICT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE tournaments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES parent_tournaments(id) ON DELETE CASCADE,
    community_id UUID REFERENCES communities(id) ON DELETE SET NULL,
    category_id UUID REFERENCES categories(id) NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE RESTRICT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'DRAFT' NOT NULL,
    match_type VARCHAR(50) DEFAULT 'DOUBLES' NOT NULL,
    sport_rules JSONB NOT NULL,
    tournament_config JSONB NOT NULL,
    entry_fee NUMERIC(12, 2) DEFAULT 0.00 NOT NULL,
    platform_fee_percentage NUMERIC(5, 2) DEFAULT 5.00 NOT NULL,
    registration_start_date TIMESTAMP WITH TIME ZONE,
    registration_end_date TIMESTAMP WITH TIME ZONE,
    max_participants INTEGER,
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    venue_id UUID REFERENCES tournament_venues(id) ON DELETE SET NULL,
    tournament_type VARCHAR(50) DEFAULT 'CLUB' NOT NULL,
    banner_url TEXT,
    logo_url TEXT,
    gallery_images TEXT[] DEFAULT '{}'::text[] NOT NULL,
    prize_description TEXT,
    prizes JSONB DEFAULT '[]'::jsonb,
    invite_code VARCHAR(20) UNIQUE,
    visibility VARCHAR(50) DEFAULT 'PUBLIC' NOT NULL,
    gender_restriction VARCHAR(20),
    contact_info JSONB,
    city VARCHAR(100),
    reserved_slots_count INTEGER DEFAULT 0 NOT NULL,
    is_ranked BOOLEAN DEFAULT TRUE NOT NULL,
    is_registration_locked BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT entry_fee_non_negative CHECK (entry_fee >= 0.00),
    CONSTRAINT platform_fee_valid CHECK (platform_fee_percentage >= 0.00 AND platform_fee_percentage <= 100.00)
);

CREATE TABLE tournament_divisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    match_type VARCHAR(50) NOT NULL,
    gender_restriction VARCHAR(20),
    max_participants INTEGER,
    entry_fee NUMERIC(12, 2) DEFAULT 0.00 NOT NULL,
    status VARCHAR(50) DEFAULT 'DRAFT' NOT NULL,
    is_config_override BOOLEAN DEFAULT FALSE NOT NULL,
    venue_id UUID REFERENCES tournament_venues(id) ON DELETE SET NULL,
    bracket_type VARCHAR(50),
    round_config JSONB,
    start_date TIMESTAMP WITH TIME ZONE,
    registration_end_date TIMESTAMP WITH TIME ZONE,
    min_elo INTEGER,
    max_elo INTEGER,
    prize_description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    CONSTRAINT tournament_division_unique_idx UNIQUE (tournament_id, match_type, gender_restriction)
);

CREATE TABLE tournament_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE NOT NULL,
    tournament_division_id UUID REFERENCES tournament_divisions(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    "order" INTEGER NOT NULL,
    round_config JSONB,
    venue_id UUID REFERENCES tournament_venues(id) ON DELETE SET NULL,
    scheduled_date DATE,
    notification_note TEXT,
    match_settings JSONB
);

CREATE TABLE tournament_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage_id UUID REFERENCES tournament_stages(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL
);

CREATE TABLE tournament_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE NOT NULL,
    tournament_division_id UUID REFERENCES tournament_divisions(id) ON DELETE CASCADE,
    group_id UUID REFERENCES tournament_groups(id) ON DELETE SET NULL,
    registered_by UUID REFERENCES users(id) ON DELETE RESTRICT NOT NULL,
    team_name VARCHAR(255) NOT NULL,
    seed INTEGER,
    points INTEGER DEFAULT 0 NOT NULL,
    is_paid BOOLEAN DEFAULT FALSE NOT NULL,
    team_invite_token VARCHAR(50) UNIQUE,
    team_status VARCHAR(50) DEFAULT 'PENDING' NOT NULL,
    is_mock BOOLEAN DEFAULT FALSE NOT NULL,
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE tournament_rosters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID REFERENCES tournament_participants(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE RESTRICT NOT NULL,
    role VARCHAR(50) DEFAULT 'MAIN' NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    CONSTRAINT participant_user_unique UNIQUE (participant_id, user_id)
);

CREATE TABLE tournament_referees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE RESTRICT NOT NULL,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'INVITED' NOT NULL, -- 'INVITED' | 'ACCEPTED' | 'DECLINED'
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE organizer_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizer_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    reviewer_id UUID REFERENCES users(id) ON DELETE RESTRICT NOT NULL,
    tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE NOT NULL,
    rating INTEGER NOT NULL,
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);


-- ==========================================
-- 6. TẦNG TRẬN ĐẤU & KẾT QUẢ (MATCHES)
-- ==========================================
CREATE TABLE group_standings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID REFERENCES tournament_groups(id) ON DELETE CASCADE NOT NULL,
    participant_id UUID REFERENCES tournament_participants(id) ON DELETE CASCADE NOT NULL,
    played INTEGER DEFAULT 0 NOT NULL,
    won INTEGER DEFAULT 0 NOT NULL,
    lost INTEGER DEFAULT 0 NOT NULL,
    draws INTEGER DEFAULT 0 NOT NULL,
    points_for INTEGER DEFAULT 0 NOT NULL,
    points_against INTEGER DEFAULT 0 NOT NULL,
    total_points INTEGER DEFAULT 0 NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    CONSTRAINT group_participant_unique UNIQUE (group_id, participant_id)
);

CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID REFERENCES tournament_groups(id) ON DELETE CASCADE,
    tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE NOT NULL,
    stage_id UUID REFERENCES tournament_stages(id) ON DELETE CASCADE NOT NULL,
    participant1_id UUID REFERENCES tournament_participants(id),
    participant2_id UUID REFERENCES tournament_participants(id),
    winner_id UUID REFERENCES tournament_participants(id),
    status VARCHAR(50) DEFAULT 'SCHEDULED' NOT NULL,
    score_details JSONB DEFAULT '{}'::jsonb NOT NULL,
    p1_sets_won INTEGER DEFAULT 0 NOT NULL,
    p2_sets_won INTEGER DEFAULT 0 NOT NULL,
    total_sets_played INTEGER DEFAULT 0 NOT NULL,
    round_number INTEGER NOT NULL,
    match_order INTEGER NOT NULL,
    bracket_branch VARCHAR(50) DEFAULT 'MAIN' NOT NULL,
    is_bye BOOLEAN DEFAULT FALSE NOT NULL,
    next_match_id UUID, -- Khóa ngoại trỏ đến matches(id) thiết lập bổ sung
    loser_next_match_id UUID, -- Khóa ngoại trỏ đến matches(id) thiết lập bổ sung
    court_id UUID REFERENCES venue_courts(id) ON DELETE SET NULL,
    court_name TEXT,
    court_address TEXT,
    referee_id UUID REFERENCES users(id) ON DELETE SET NULL,
    score_confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    score_confirmed_at TIMESTAMP WITH TIME ZONE,
    match_evidence_images TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,
    scheduled_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT sets_non_negative CHECK (p1_sets_won >= 0 AND p2_sets_won >= 0),
    CONSTRAINT different_participants CHECK (participant1_id IS NULL OR participant2_id IS NULL OR participant1_id <> participant2_id)
);

CREATE TABLE match_players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID REFERENCES matches(id) ON DELETE CASCADE NOT NULL,
    participant_id UUID REFERENCES tournament_participants(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE RESTRICT NOT NULL,
    status VARCHAR(50) DEFAULT 'PLAYED' NOT NULL,
    CONSTRAINT match_user_unique UNIQUE (match_id, user_id)
);

CREATE TABLE match_disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID REFERENCES matches(id) ON DELETE RESTRICT NOT NULL,
    filed_by UUID REFERENCES users(id) ON DELETE RESTRICT NOT NULL,
    reason TEXT NOT NULL,
    evidence_urls TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,
    status VARCHAR(50) DEFAULT 'OPEN' NOT NULL,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolution_note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    resolved_at TIMESTAMP WITH TIME ZONE
);


-- ==========================================
-- 7. TẦNG TÀI CHÍNH & THANH TOÁN (PAYMENTS & PAYOUTS)
-- ==========================================
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE RESTRICT NOT NULL,
    participant_id UUID REFERENCES tournament_participants(id) ON DELETE RESTRICT,
    tournament_id UUID REFERENCES tournaments(id) ON DELETE RESTRICT NOT NULL,
    division_id UUID REFERENCES tournament_divisions(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL,
    platform_fee_amount NUMERIC(12, 2),
    status VARCHAR(50) DEFAULT 'PENDING' NOT NULL,
    refund_status VARCHAR(50),
    refunded_amount NUMERIC(12, 2) DEFAULT 0.00,
    payment_gateway VARCHAR(50),
    transaction_reference VARCHAR(255) UNIQUE,
    gateway_response JSONB,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    CONSTRAINT amount_positive CHECK (amount > 0)
);

CREATE TABLE payment_status_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID REFERENCES payments(id) ON DELETE RESTRICT NOT NULL,
    previous_status VARCHAR(50) NOT NULL,
    new_status VARCHAR(50) NOT NULL,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE organizer_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID REFERENCES tournaments(id) ON DELETE RESTRICT NOT NULL,
    organizer_id UUID REFERENCES users(id) ON DELETE RESTRICT NOT NULL,
    total_collected NUMERIC(12, 2) NOT NULL,
    amount_requested NUMERIC(12, 2) NOT NULL,
    platform_fee_retained NUMERIC(12, 2) NOT NULL,
    bank_name VARCHAR(100),
    bank_account_number VARCHAR(50),
    bank_account_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'PENDING' NOT NULL,
    hold_until TIMESTAMP WITH TIME ZONE,
    payout_trigger VARCHAR(50) DEFAULT 'MANUAL' NOT NULL,
    disbursed_at TIMESTAMP WITH TIME ZONE,
    transaction_proof_url TEXT,
    processed_by UUID REFERENCES users(id),
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    CONSTRAINT payout_amounts_valid CHECK (
        amount_requested > 0 
        AND platform_fee_retained >= 0 
        AND total_collected >= amount_requested + platform_fee_retained
    )
);

CREATE TABLE payout_status_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_id UUID REFERENCES organizer_payouts(id) ON DELETE RESTRICT NOT NULL,
    previous_status VARCHAR(50) NOT NULL,
    new_status VARCHAR(50) NOT NULL,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    note TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);


-- ==========================================
-- 8. TẦNG LIÊN KẾT XÃ HỘI & CHAT
-- ==========================================
CREATE TABLE friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    receiver_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    CONSTRAINT friendship_pair_unique UNIQUE (sender_id, receiver_id),
    CONSTRAINT no_self_friend CHECK (sender_id != receiver_id)
);

CREATE TABLE chat_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255),
    type VARCHAR(50) DEFAULT 'DIRECT' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE chat_room_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES chat_rooms(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    CONSTRAINT room_user_unique UNIQUE (room_id, user_id)
);

CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES chat_rooms(id) ON DELETE CASCADE NOT NULL,
    sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
    message_text TEXT,
    attachments_urls TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,
    is_read BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receiver_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
    type VARCHAR(100) NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    redirect_url TEXT,
    is_read BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE match_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID REFERENCES matches(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    comment_text TEXT NOT NULL,
    parent_id UUID REFERENCES match_comments(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE match_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID REFERENCES matches(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    type VARCHAR(50) DEFAULT 'LIKE' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    CONSTRAINT user_match_reaction_unique UNIQUE (match_id, user_id)
);


-- ==========================================
-- 9. HỆ THỐNG QUẢNG CÁO KIẾM TIỀN (ADS SYSTEM)
-- ==========================================
CREATE TABLE advertisements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    image_url TEXT NOT NULL,
    target_url TEXT NOT NULL,
    placement_slot VARCHAR(100) NOT NULL,
    views_count INTEGER DEFAULT 0 NOT NULL,
    clicks_count INTEGER DEFAULT 0 NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    CONSTRAINT ads_date_valid CHECK (start_date < end_date)
);


-- ==========================================
-- 10. THIẾT LẬP RÀNG BUỘC & INDEXES TỐI ƯU
-- ==========================================
ALTER TABLE elo_history_logs ADD CONSTRAINT fk_elo_match FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE SET NULL;
ALTER TABLE matches ADD CONSTRAINT fk_matches_next_match FOREIGN KEY (next_match_id) REFERENCES matches(id) ON DELETE SET NULL;
ALTER TABLE matches ADD CONSTRAINT fk_matches_loser_next_match FOREIGN KEY (loser_next_match_id) REFERENCES matches(id) ON DELETE SET NULL;

-- Performance indexes
CREATE INDEX idx_matches_tournament_status ON matches(tournament_id, status);
CREATE INDEX idx_matches_stage_round_order ON matches(stage_id, round_number, match_order);
CREATE INDEX idx_matches_referee_status ON matches(referee_id, status);
CREATE INDEX idx_communities_geo ON communities USING gist(location_geolocation);
CREATE INDEX idx_venues_geo ON tournament_venues USING gist(location_geolocation);
CREATE INDEX idx_chat_messages_timestamp ON chat_messages(room_id, created_at DESC);
CREATE INDEX idx_ads_active ON advertisements(is_active, start_date, end_date);
CREATE INDEX idx_payouts_status ON organizer_payouts(status);

-- Audit & Legal indexes
CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_table ON audit_logs(table_name, record_id);
CREATE INDEX idx_payments_status ON payments(status, created_at DESC);
CREATE INDEX idx_payments_user ON payments(user_id, created_at DESC);
CREATE INDEX idx_payment_logs ON payment_status_logs(payment_id, created_at DESC);
CREATE INDEX idx_disputes_match ON match_disputes(match_id, status);
CREATE INDEX idx_community_rankings_leaderboard ON community_rankings(community_id, category_id, elo_points DESC);
```
