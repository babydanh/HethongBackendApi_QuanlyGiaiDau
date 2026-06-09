```sql
-- KÍCH HOẠT EXTENSION
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

/* =========================================================================
   DATABASE SCHEMA REVIEW & AUDIT REPORT (2026-06-08)
   -------------------------------------------------------------------------
   Bản phân tích Schema này đã được rà soát với `skills.md` và nghiệp vụ thực tế.
   Các điểm [FIX] là những thay đổi nhằm bịt lỗ hổng nghiệp vụ:
   1. Pháp lý: Bổ sung `accepted_tos_at` (Chấp nhận điều khoản).
   2. Tổ chức giải: Bổ sung `registration_start_date`, `registration_end_date`, `max_participants`.
   3. Hoàn tiền: Bổ sung `refund_status`, `refunded_amount` vào thanh toán.
   4. Đặc cách (Bye): Thêm `is_bye` vào trận đấu.
   5. Soft Delete: Thêm `deleted_at` cho Địa điểm thi đấu.
   ========================================================================= */

-- ==========================================
-- 1. TẦNG AUTHENTICATION, PHÂN QUYỀN & AUDIT LOG
-- ==========================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_email_verified BOOLEAN DEFAULT FALSE NOT NULL,  -- [FIX] Xác minh email (pháp lý: chứng minh user đồng ý)
    accepted_tos_at TIMESTAMP WITH TIME ZONE,          -- [FIX] Lưu vết: Thời điểm user đồng ý Điều khoản sử dụng (Pháp lý)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE -- SOFT DELETE
);

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE user_to_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE NOT NULL,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,  -- [FIX] Pháp lý: Ai gán quyền này?
    CONSTRAINT user_role_unique_idx UNIQUE (user_id, role_id)
);

CREATE TABLE profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    phone_number VARCHAR(20),
    date_of_birth DATE,  -- [FIX] Pháp lý: Xác minh tuổi tham gia giải
    bio TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    refresh_token TEXT NOT NULL UNIQUE,
    user_agent TEXT,
    ip_address VARCHAR(45),
    is_revoked BOOLEAN DEFAULT FALSE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,  -- [FIX] Lưu vết: Khi nào token bị thu hồi
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- BẢNG NHẬT KÝ HỆ THỐNG (AUDIT LOGS) - BẢO MẬT & ĐỐI SOÁT
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,  -- [FIX] Lưu vết thiết bị (điện thoại hay máy tính)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- BẢNG LIÊN KẾT ĐĂNG NHẬP BÊN THỨ 3 (OAuth 2.0 Providers)
CREATE TABLE auth_providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    provider VARCHAR(50) NOT NULL,              -- 'GOOGLE', 'FACEBOOK', 'GITHUB'
    provider_user_id VARCHAR(255) NOT NULL,      -- ID của user bên provider (ví dụ: Google sub)
    provider_email VARCHAR(255),                 -- Email từ provider
    provider_avatar_url TEXT,                    -- Avatar từ provider
    provider_display_name VARCHAR(255),          -- Tên hiển thị từ provider
    access_token TEXT,                           -- Access token từ provider (optional)
    refresh_token TEXT,                          -- Refresh token từ provider (optional)
    token_expires_at TIMESTAMP WITH TIME ZONE,   -- Thời gian hết hạn token provider
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT provider_user_unique UNIQUE (provider, provider_user_id)
);

CREATE INDEX idx_auth_providers_user ON auth_providers(user_id);
CREATE INDEX idx_auth_providers_lookup ON auth_providers(provider, provider_user_id);



-- ==========================================
-- 2. TẦNG ĐA MÔN THỂ THAO & RANKING (ELO TIERS)
-- ==========================================
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    slug VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    category_config JSONB DEFAULT '{}'::jsonb NOT NULL
);

-- HỆ THỐNG PHÂN HẠNG (TIERS) - VD: Low Tier D, High Tier D, Tier C, High Tier A
CREATE TABLE elo_tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) NOT NULL,
    min_elo INTEGER NOT NULL,
    max_elo INTEGER NOT NULL,
    icon_url TEXT,
    CONSTRAINT category_tier_name_unique UNIQUE (category_id, name),
    CONSTRAINT elo_range_valid CHECK (min_elo < max_elo)  -- [FIX] Ngăn nhập sai: min phải nhỏ hơn max
);

-- HỆ THỐNG TÍNH ELO THEO TỪNG CÁ NHÂN NGƯỜI CHƠI
CREATE TABLE user_ranks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE NOT NULL,
    elo_points INTEGER DEFAULT 1200 NOT NULL,
    tier_id UUID REFERENCES elo_tiers(id) ON DELETE SET NULL,
    matches_played INTEGER DEFAULT 0 NOT NULL,
    matches_won INTEGER DEFAULT 0 NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT user_category_rank_unique_idx UNIQUE (user_id, category_id),
    CONSTRAINT elo_non_negative CHECK (elo_points >= 0),  -- [FIX] ELO không thể âm
    CONSTRAINT wins_lte_played CHECK (matches_won <= matches_played)  -- [FIX] Thắng không thể nhiều hơn số trận đã chơi
);

-- LƯU LỊCH SỬ BIẾN ĐỘNG ELO CÁ NHÂN ĐỂ VẼ BIỂU ĐỒ PHONG ĐỘ
CREATE TABLE elo_history_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE NOT NULL,
    match_id UUID, -- NULL nếu do admin chỉnh tay
    reason VARCHAR(100),  -- [FIX] Lưu vết: 'MATCH_WIN', 'MATCH_LOSS', 'ADMIN_ADJUSTMENT', 'SEASON_RESET'
    previous_elo INTEGER NOT NULL,
    new_elo INTEGER NOT NULL,
    changed_points INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ==========================================
-- 3. TẦNG CỘNG ĐỒNG & ĐỊNH VỊ GIS
-- ==========================================
CREATE TABLE communities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE community_sports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE NOT NULL,
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE NOT NULL,
    CONSTRAINT community_sport_unique UNIQUE (community_id, category_id)
);

CREATE TABLE community_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    role VARCHAR(50) DEFAULT 'MEMBER' NOT NULL,
    status VARCHAR(50) DEFAULT 'JOINED' NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT community_user_unique_idx UNIQUE (community_id, user_id)
);

-- ==========================================
-- 4. TẦNG ĐỊA ĐIỂM SÂN THI ĐẤU (VENUES)
-- ==========================================
CREATE TABLE tournament_venues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    location_address TEXT NOT NULL,
    location_geolocation GEOGRAPHY(Point, 4326),
    images_urls TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE                -- [FIX] Skill 2: Soft delete bắt buộc cho các bảng chính
);

CREATE TABLE venue_courts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    venue_id UUID REFERENCES tournament_venues(id) ON DELETE CASCADE NOT NULL,
    court_name VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'AVAILABLE' NOT NULL
);

-- ==========================================
-- 5. TẦNG GIẢI ĐẤU & KINH DOANH (TOURNAMENTS & MONETIZATION)
-- ==========================================
CREATE TABLE tournaments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_id UUID REFERENCES communities(id) ON DELETE SET NULL,
    category_id UUID REFERENCES categories(id) NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE RESTRICT NOT NULL,  -- [FIX] Pháp lý: Ai tạo giải này?
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'UPCOMING' NOT NULL,
    sport_rules JSONB NOT NULL,
    tournament_config JSONB NOT NULL,
    -- TẦNG TÀI CHÍNH & HOA HỒNG NỀN TẢNG
    entry_fee NUMERIC(12, 2) DEFAULT 0.00 NOT NULL,
    platform_fee_percentage NUMERIC(5, 2) DEFAULT 5.00 NOT NULL,
    registration_start_date TIMESTAMP WITH TIME ZONE,  -- [FIX] Ngày mở đăng ký tham gia giải
    registration_end_date TIMESTAMP WITH TIME ZONE,    -- [FIX] Ngày đóng cổng đăng ký (Chốt sổ)
    max_participants INTEGER,                          -- [FIX] Giới hạn số lượng đội tối đa tham gia
    start_date TIMESTAMP WITH TIME ZONE,  -- [FIX] Ngày bắt đầu giải (pháp lý: xác nhận cam kết thời gian)
    end_date TIMESTAMP WITH TIME ZONE,    -- [FIX] Ngày kết thúc giải
    venue_id UUID REFERENCES tournament_venues(id) ON DELETE SET NULL,  -- [FIX] Sân đấu chính của giải
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT entry_fee_non_negative CHECK (entry_fee >= 0),  -- [FIX] Phí không thể âm
    CONSTRAINT platform_fee_valid CHECK (platform_fee_percentage >= 0 AND platform_fee_percentage <= 100)
);

CREATE TABLE tournament_stages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    "order" INTEGER NOT NULL
);

CREATE TABLE tournament_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stage_id UUID REFERENCES tournament_stages(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL
);

-- ĐẠI DIỆN ĐỘI / CÁ NHÂN ĐĂNG KÝ
CREATE TABLE tournament_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE NOT NULL,
    group_id UUID REFERENCES tournament_groups(id) ON DELETE SET NULL,
    registered_by UUID REFERENCES users(id) ON DELETE RESTRICT NOT NULL,  -- [FIX] Pháp lý: Ai đăng ký đội này?
    team_name VARCHAR(255) NOT NULL,
    seed INTEGER,
    points INTEGER DEFAULT 0 NOT NULL,
    is_paid BOOLEAN DEFAULT FALSE NOT NULL,
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL  -- [FIX] Lưu vết: Thời điểm đăng ký
);

-- DANH SÁCH THÀNH VIÊN ĐỘI (có Khóa ngoại, không dùng JSONB)
CREATE TABLE tournament_rosters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    participant_id UUID REFERENCES tournament_participants(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE RESTRICT NOT NULL,
    role VARCHAR(50) DEFAULT 'MAIN' NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT participant_user_unique UNIQUE (participant_id, user_id)
);

-- BẢNG THEO DÕI THANH TOÁN (PAYMENTS)
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE RESTRICT NOT NULL,  -- [FIX] RESTRICT: Không xóa user có giao dịch tài chính
    participant_id UUID REFERENCES tournament_participants(id) ON DELETE RESTRICT, -- [FIX] Link trực tiếp tới đội đã đăng ký
    tournament_id UUID REFERENCES tournaments(id) ON DELETE RESTRICT NOT NULL,  -- [FIX] RESTRICT: Bảo toàn sổ sách
    amount NUMERIC(12, 2) NOT NULL,
    platform_fee_amount NUMERIC(12, 2),  -- [FIX] Lưu số tiền thực tế nền tảng giữ lại (tại thời điểm thanh toán)
    status VARCHAR(50) DEFAULT 'PENDING' NOT NULL,
    refund_status VARCHAR(50),                        -- [FIX] Nghiệp vụ: Trạng thái hoàn tiền (nếu giải bị hủy)
    refunded_amount NUMERIC(12, 2) DEFAULT 0.00,      -- [FIX] Nghiệp vụ: Số tiền đã hoàn lại cho user
    payment_gateway VARCHAR(50),
    transaction_reference VARCHAR(255) UNIQUE,  -- [FIX] Mã giao dịch phải duy nhất (chống duplicate webhook)
    gateway_response JSONB,  -- [FIX] Lưu nguyên response từ VNPay/MoMo (bằng chứng pháp lý)
    paid_at TIMESTAMP WITH TIME ZONE,  -- [FIX] Thời điểm thanh toán thành công (khác với created_at)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT amount_positive CHECK (amount > 0)  -- [FIX] Số tiền phải dương
);

-- [NEW] BẢNG LỊCH SỬ THAY ĐỔI TRẠNG THÁI THANH TOÁN (Pháp lý bắt buộc)
CREATE TABLE payment_status_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id UUID REFERENCES payments(id) ON DELETE RESTRICT NOT NULL,
    previous_status VARCHAR(50) NOT NULL,
    new_status VARCHAR(50) NOT NULL,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,  -- NULL nếu do webhook tự động
    reason TEXT,  -- 'WEBHOOK_CALLBACK', 'ADMIN_MANUAL_CONFIRM', 'EXPIRED', 'USER_CANCEL'
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE group_standings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES tournament_groups(id) ON DELETE CASCADE NOT NULL,
    participant_id UUID REFERENCES tournament_participants(id) ON DELETE CASCADE NOT NULL,
    played INTEGER DEFAULT 0 NOT NULL,
    won INTEGER DEFAULT 0 NOT NULL,
    lost INTEGER DEFAULT 0 NOT NULL,
    draws INTEGER DEFAULT 0 NOT NULL,
    points_for INTEGER DEFAULT 0 NOT NULL,
    points_against INTEGER DEFAULT 0 NOT NULL,
    total_points INTEGER DEFAULT 0 NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT group_participant_unique UNIQUE (group_id, participant_id)
);

-- BẢNG TRẬN ĐẤU CẬP NHẬT CỘT SỐ CỨNG ĐỂ TÍNH TOÁN ACID
CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES tournament_groups(id) ON DELETE CASCADE NOT NULL,
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
    is_bye BOOLEAN DEFAULT FALSE NOT NULL,            -- [FIX] Nghiệp vụ: Đánh dấu đội được đặc cách vào thẳng (không cần thi đấu)
    next_match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
    loser_next_match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
    court_id UUID REFERENCES venue_courts(id) ON DELETE SET NULL,
    referee_id UUID REFERENCES users(id) ON DELETE SET NULL,
    score_confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,  -- [FIX] Pháp lý: Ai xác nhận tỷ số cuối cùng
    score_confirmed_at TIMESTAMP WITH TIME ZONE,  -- [FIX] Khi nào xác nhận
    match_evidence_images TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,
    scheduled_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,  -- [FIX] Lưu vết: Trận bắt đầu lúc nào
    completed_at TIMESTAMP WITH TIME ZONE,  -- [FIX] Lưu vết: Trận kết thúc lúc nào
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT sets_non_negative CHECK (p1_sets_won >= 0 AND p2_sets_won >= 0),  -- [FIX] Số set không thể âm
    CONSTRAINT different_participants CHECK (participant1_id IS DISTINCT FROM participant2_id)  -- [FIX] Không tự đánh với chính mình
);

-- BẢNG AI THỰC SỰ RA SÂN (Dùng để tính ELO riêng cho từng người)
CREATE TABLE match_players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID REFERENCES matches(id) ON DELETE CASCADE NOT NULL,
    participant_id UUID REFERENCES tournament_participants(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE RESTRICT NOT NULL,
    status VARCHAR(50) DEFAULT 'PLAYED' NOT NULL,
    CONSTRAINT match_user_unique UNIQUE (match_id, user_id)
);

-- [NEW] BẢNG KHIẾU NẠI KẾT QUẢ (DISPUTES - PHÁP LÝ)
CREATE TABLE match_disputes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID REFERENCES matches(id) ON DELETE RESTRICT NOT NULL,
    filed_by UUID REFERENCES users(id) ON DELETE RESTRICT NOT NULL,  -- Ai khiếu nại
    reason TEXT NOT NULL,  -- Lý do khiếu nại
    evidence_urls TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,  -- Ảnh/video chứng cứ
    status VARCHAR(50) DEFAULT 'OPEN' NOT NULL,  -- 'OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED'
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolution_note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- ==========================================
-- 6. TẦNG MẠNG XÃ HỘI & TƯƠNG TÁC
-- ==========================================
CREATE TABLE friendships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    receiver_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT friendship_pair_unique UNIQUE (sender_id, receiver_id),
    CONSTRAINT no_self_friend CHECK (sender_id != receiver_id)  -- [FIX] Không thể kết bạn với chính mình
);

CREATE TABLE chat_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255),
    type VARCHAR(50) DEFAULT 'DIRECT' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE chat_room_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES chat_rooms(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT room_user_unique UNIQUE (room_id, user_id)
);

CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES chat_rooms(id) ON DELETE CASCADE NOT NULL,
    sender_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- [FIX] SET NULL: Giữ tin nhắn khi user bị xóa (nullable vì user có thể bị xóa)
    message_text TEXT,
    attachments_urls TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,
    is_read BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    receiver_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
    type VARCHAR(100) NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    redirect_url TEXT,
    is_read BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE match_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID REFERENCES matches(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- [FIX] Giữ comment khi user bị xóa (nullable vì user có thể bị xóa)
    comment_text TEXT NOT NULL,
    parent_id UUID REFERENCES match_comments(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE match_reactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID REFERENCES matches(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    type VARCHAR(50) DEFAULT 'LIKE' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT user_match_reaction_unique UNIQUE (match_id, user_id)
);

-- ==========================================
-- 7. HỆ THỐNG QUẢNG CÁO KIẾM TIỀN (ADS SYSTEM)
-- ==========================================
CREATE TABLE advertisements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    image_url TEXT NOT NULL,
    target_url TEXT NOT NULL,
    placement_slot VARCHAR(100) NOT NULL,
    views_count INTEGER DEFAULT 0 NOT NULL,
    clicks_count INTEGER DEFAULT 0 NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ads_date_valid CHECK (start_date < end_date)  -- [FIX] Ngày bắt đầu phải trước ngày kết thúc
);

-- ==========================================
-- 8. QUẢN LÝ DÒNG TIỀN RA / RÚT TIỀN (PAYOUTS)
-- ==========================================
CREATE TABLE organizer_payouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID REFERENCES tournaments(id) ON DELETE RESTRICT NOT NULL,
    organizer_id UUID REFERENCES users(id) ON DELETE RESTRICT NOT NULL,
    total_collected NUMERIC(12, 2) NOT NULL,  -- [FIX] Tổng tiền thu được từ giải (để đối soát)
    amount_requested NUMERIC(12, 2) NOT NULL,
    platform_fee_retained NUMERIC(12, 2) NOT NULL,
    bank_name VARCHAR(100) NOT NULL,
    bank_account_number VARCHAR(50) NOT NULL,
    bank_account_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING' NOT NULL,
    transaction_proof_url TEXT,
    processed_by UUID REFERENCES users(id),
    processed_at TIMESTAMP WITH TIME ZONE,  -- [FIX] Lưu vết: Admin xử lý lúc nào
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT payout_amounts_valid CHECK (
        amount_requested > 0 
        AND platform_fee_retained >= 0 
        AND total_collected >= amount_requested + platform_fee_retained
    )  -- [FIX] ACID: Tổng thu phải >= số rút + phí nền tảng
);

-- [NEW] LỊCH SỬ THAY ĐỔI TRẠNG THÁI PAYOUT (Đối soát pháp lý)
CREATE TABLE payout_status_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payout_id UUID REFERENCES organizer_payouts(id) ON DELETE RESTRICT NOT NULL,
    previous_status VARCHAR(50) NOT NULL,
    new_status VARCHAR(50) NOT NULL,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    note TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ==========================================
-- 9. THIẾT LẬP KHÓA NGOẠI BỔ SUNG & INDEXES TỐI ƯU
-- ==========================================
ALTER TABLE elo_history_logs ADD CONSTRAINT fk_elo_match FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE SET NULL;

-- Performance indexes
CREATE INDEX idx_match_coordination ON matches(group_id, round_number, match_order);
CREATE INDEX idx_communities_geo ON communities USING gist(location_geolocation);
CREATE INDEX idx_venues_geo ON tournament_venues USING gist(location_geolocation);
CREATE INDEX idx_chat_messages_timestamp ON chat_messages(room_id, created_at DESC);
CREATE INDEX idx_ads_active ON advertisements(is_active, start_date, end_date);
CREATE INDEX idx_payouts_status ON organizer_payouts(status);

-- Audit & Legal indexes (query nhanh khi cần đối soát)
CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_table ON audit_logs(table_name, record_id);
CREATE INDEX idx_payments_status ON payments(status, created_at DESC);
CREATE INDEX idx_payments_user ON payments(user_id, created_at DESC);
CREATE INDEX idx_payment_logs ON payment_status_logs(payment_id, created_at DESC);
CREATE INDEX idx_disputes_match ON match_disputes(match_id, status);

```
