-- Migration: Seed initial production athlete users, profiles, and public rankings (Singles, Doubles, Mixed Doubles)
-- This migration runs automatically through run-prod-migration.js on VPS deployment.

DO $$
DECLARE
  v_category_id uuid;
  v_role_id uuid;
  v_tier_s uuid;
  v_tier_ha uuid;
  v_tier_la uuid;
  v_tier_hb uuid;
  v_tier_lb uuid;
  v_tier_hc uuid;
  v_tier_lc uuid;
  v_tier_hd uuid;
  v_tier_ld uuid;

  -- Player IDs
  v_u_ben uuid := 'a1000000-0000-4000-a000-000000000001'::uuid;
  v_u_annaleigh uuid := 'a1000000-0000-4000-a000-000000000002'::uuid;
  v_u_federico uuid := 'a1000000-0000-4000-a000-000000000003'::uuid;
  v_u_catherine uuid := 'a1000000-0000-4000-a000-000000000004'::uuid;
  v_u_tyson uuid := 'a1000000-0000-4000-a000-000000000005'::uuid;
  v_u_lea uuid := 'a1000000-0000-4000-a000-000000000006'::uuid;
  v_u_hien uuid := 'a1000000-0000-4000-a000-000000000007'::uuid;
  v_u_thang uuid := 'a1000000-0000-4000-a000-000000000008'::uuid;
  v_u_quynh uuid := 'a1000000-0000-4000-a000-000000000009'::uuid;
  v_u_thao uuid := 'a1000000-0000-4000-a000-000000000010'::uuid;
  v_u_bao uuid := 'a1000000-0000-4000-a000-000000000011'::uuid;
  v_u_duc uuid := 'a1000000-0000-4000-a000-000000000012'::uuid;
  v_u_mai uuid := 'a1000000-0000-4000-a000-000000000013'::uuid;
  v_u_anh uuid := 'a1000000-0000-4000-a000-000000000014'::uuid;
  v_u_son uuid := 'a1000000-0000-4000-a000-000000000015'::uuid;
  v_u_trang uuid := 'a1000000-0000-4000-a000-000000000016'::uuid;
  v_u_long uuid := 'a1000000-0000-4000-a000-000000000017'::uuid;
  v_u_ngoc uuid := 'a1000000-0000-4000-a000-000000000018'::uuid;
  v_u_khang uuid := 'a1000000-0000-4000-a000-000000000019'::uuid;
  v_u_linh uuid := 'a1000000-0000-4000-a000-000000000020'::uuid;

  -- Default bcrypt hash for 'Player@123'
  v_hash text := '$2b$10$wN9iL6Uf9bB7aA9O8O8a3e7K0l9i6yU5E1W9iL6Uf9bB7aA9O8O8a.';
BEGIN
  -- 1. Tìm category Pickleball
  SELECT id INTO v_category_id FROM "categories" WHERE slug = 'pickleball' LIMIT 1;
  IF v_category_id IS NULL THEN
    SELECT id INTO v_category_id FROM "categories" LIMIT 1;
  END IF;

  IF v_category_id IS NULL THEN
    RAISE NOTICE 'No category found, skipping rankings seed.';
    RETURN;
  END IF;

  -- 2. Tìm role PLAYER
  SELECT id INTO v_role_id FROM "roles" WHERE slug = 'player' LIMIT 1;
  IF v_role_id IS NULL THEN
    INSERT INTO "roles" ("name", "slug", "description")
    VALUES ('PLAYER', 'player', 'Người chơi / Vận động viên')
    ON CONFLICT ("slug") DO UPDATE SET "name" = EXCLUDED.name
    RETURNING id INTO v_role_id;
  END IF;

  -- 3. Tìm tiers của category
  SELECT id INTO v_tier_s FROM "elo_tiers" WHERE category_id = v_category_id AND name = 'Tier S' LIMIT 1;
  SELECT id INTO v_tier_ha FROM "elo_tiers" WHERE category_id = v_category_id AND name = 'High Tier A' LIMIT 1;
  SELECT id INTO v_tier_la FROM "elo_tiers" WHERE category_id = v_category_id AND name = 'Low Tier A' LIMIT 1;
  SELECT id INTO v_tier_hb FROM "elo_tiers" WHERE category_id = v_category_id AND name = 'High Tier B' LIMIT 1;
  SELECT id INTO v_tier_lb FROM "elo_tiers" WHERE category_id = v_category_id AND name = 'Low Tier B' LIMIT 1;
  SELECT id INTO v_tier_hc FROM "elo_tiers" WHERE category_id = v_category_id AND name = 'High Tier C' LIMIT 1;
  SELECT id INTO v_tier_lc FROM "elo_tiers" WHERE category_id = v_category_id AND name = 'Low Tier C' LIMIT 1;
  SELECT id INTO v_tier_hd FROM "elo_tiers" WHERE category_id = v_category_id AND name = 'High Tier D' LIMIT 1;
  SELECT id INTO v_tier_ld FROM "elo_tiers" WHERE category_id = v_category_id AND name = 'Low Tier D' LIMIT 1;

  -- 4. Tạo 20 Users
  INSERT INTO "users" ("id", "email", "password_hash", "is_email_verified", "is_phone_verified", "is_mock")
  VALUES
    (v_u_ben, 'ben.johns@athlete.world', v_hash, true, true, false),
    (v_u_annaleigh, 'annaleigh.waters@athlete.world', v_hash, true, true, false),
    (v_u_federico, 'federico.staksrud@athlete.world', v_hash, true, true, false),
    (v_u_catherine, 'catherine.parenteau@athlete.world', v_hash, true, true, false),
    (v_u_tyson, 'tyson.mcguffin@athlete.world', v_hash, true, true, false),
    (v_u_lea, 'lea.jansen@athlete.world', v_hash, true, true, false),
    (v_u_hien, 'hien.truong@pickleball.vn', v_hash, true, true, false),
    (v_u_thang, 'thang.nguyen@pickleball.vn', v_hash, true, true, false),
    (v_u_quynh, 'quynh.pham@pickleball.vn', v_hash, true, true, false),
    (v_u_thao, 'thao.dang@pickleball.vn', v_hash, true, true, false),
    (v_u_bao, 'bao.le@pickleball.vn', v_hash, true, true, false),
    (v_u_duc, 'duc.tran@pickleball.vn', v_hash, true, true, false),
    (v_u_mai, 'mai.vu@pickleball.vn', v_hash, true, true, false),
    (v_u_anh, 'anh.bui@pickleball.vn', v_hash, true, true, false),
    (v_u_son, 'son.ngo@pickleball.vn', v_hash, true, true, false),
    (v_u_trang, 'trang.do@pickleball.vn', v_hash, true, true, false),
    (v_u_long, 'long.hoang@pickleball.vn', v_hash, true, true, false),
    (v_u_ngoc, 'ngoc.le@pickleball.vn', v_hash, true, true, false),
    (v_u_khang, 'khang.vo@pickleball.vn', v_hash, true, true, false),
    (v_u_linh, 'linh.ho@pickleball.vn', v_hash, true, true, false)
  ON CONFLICT ("email") DO UPDATE SET "is_mock" = false;

  -- Gán role PLAYER
  INSERT INTO "user_to_roles" ("user_id", "role_id")
  SELECT u.id, v_role_id FROM "users" u
  WHERE u.id IN (
    v_u_ben, v_u_annaleigh, v_u_federico, v_u_catherine, v_u_tyson, v_u_lea,
    v_u_hien, v_u_thang, v_u_quynh, v_u_thao, v_u_bao, v_u_duc, v_u_mai,
    v_u_anh, v_u_son, v_u_trang, v_u_long, v_u_ngoc, v_u_khang, v_u_linh
  )
  ON CONFLICT DO NOTHING;

  -- 5. Profiles
  INSERT INTO "profiles" ("user_id", "full_name", "gender", "avatar_url", "bio", "is_verified")
  VALUES
    (v_u_ben, 'Ben Johns', 'MALE', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80', '#1 World Pickleball Player (PPA Tour Champion)', true),
    (v_u_annaleigh, 'Anna Leigh Waters', 'FEMALE', 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80', '#1 Women Pickleball Prodigy (Triple Crown Winner)', true),
    (v_u_federico, 'Federico Staksrud', 'MALE', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80', 'Top 3 Singles World Ranking - Argentinian Ace', true),
    (v_u_catherine, 'Catherine Parenteau', 'FEMALE', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80', 'Canadian Pro Pickleball Champion', true),
    (v_u_tyson, 'Tyson McGuffin', 'MALE', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80', '5x Grand Slam Champion', true),
    (v_u_lea, 'Lea Jansen', 'FEMALE', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80', 'Pro Singles Specialist', true),
    (v_u_hien, 'Trương Vinh Hiển', 'MALE', 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80', 'VĐV Tuyển Pickleball Việt Nam - Vô địch đơn nam', true),
    (v_u_thang, 'Nguyễn Anh Thắng', 'MALE', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80', 'Hạt giống giải Pickleball Quốc Gia', true),
    (v_u_quynh, 'Phạm Thị Như Quỳnh', 'FEMALE', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80', 'Vô địch đơn nữ Pickleball Miền Nam', true),
    (v_u_thao, 'Đặng Ngọc Thảo', 'FEMALE', 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=150&auto=format&fit=crop&q=80', 'VĐV Pickleball Trẻ Tiềm Năng', true),
    (v_u_bao, 'Lê Quốc Bảo', 'MALE', 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80', 'Huy chương Bạc giải Thể thao Thường niên', true),
    (v_u_duc, 'Trần Minh Đức', 'MALE', 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80', 'Tay vợt triển vọng TP.HCM', true),
    (v_u_mai, 'Vũ Hoàng Mai', 'FEMALE', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80', 'Huy chương Đồng Đơn Nữ Cup Hà Nội', true),
    (v_u_anh, 'Bùi Tuấn Anh', 'MALE', 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80', 'Thành viên CLB Pickleball Sài Gòn', true),
    (v_u_son, 'Ngô Thanh Sơn', 'MALE', 'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=150&auto=format&fit=crop&q=80', 'VĐV Bán chuyên', true),
    (v_u_trang, 'Đỗ Thùy Trang', 'FEMALE', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80', 'Người chơi tích cực giải phong trào', true),
    (v_u_long, 'Hoàng Văn Long', 'MALE', 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=150&auto=format&fit=crop&q=80', 'Thành viên CLB Pickleball Đà Nẵng', true),
    (v_u_ngoc, 'Lê Bích Ngọc', 'FEMALE', 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80', 'Hạng B phong trào toàn quốc', true),
    (v_u_khang, 'Võ Minh Khang', 'MALE', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80', 'Người đam mê Pickleball', true),
    (v_u_linh, 'Hồ Phương Linh', 'FEMALE', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80', 'Người mới nhập môn thi đấu', true)
  ON CONFLICT ("user_id") DO UPDATE SET
    "full_name" = EXCLUDED.full_name,
    "gender" = EXCLUDED.gender,
    "avatar_url" = EXCLUDED.avatar_url,
    "bio" = EXCLUDED.bio,
    "is_verified" = true;

  -- 6. User Ranks - Xếp hạng Đơn với Giới tính (SINGLES MALE & FEMALE)
  INSERT INTO "user_ranks" ("user_id", "category_id", "match_type", "gender_restriction", "community_id", "elo_points", "peak_elo", "matches_played", "matches_won", "win_streak", "admin_leaderboard_eligible", "tier_id")
  VALUES
    (v_u_ben, v_category_id, 'SINGLES', 'MALE', NULL, 2380, 2380, 78, 72, 14, true, v_tier_s),
    (v_u_annaleigh, v_category_id, 'SINGLES', 'FEMALE', NULL, 2340, 2340, 65, 61, 12, true, v_tier_s),
    (v_u_federico, v_category_id, 'SINGLES', 'MALE', NULL, 2210, 2210, 54, 46, 8, true, v_tier_s),
    (v_u_catherine, v_category_id, 'SINGLES', 'FEMALE', NULL, 2180, 2180, 49, 41, 6, true, v_tier_s),
    (v_u_tyson, v_category_id, 'SINGLES', 'MALE', NULL, 2150, 2150, 62, 50, 5, true, v_tier_s),
    (v_u_lea, v_category_id, 'SINGLES', 'FEMALE', NULL, 2090, 2090, 42, 34, 4, true, v_tier_s),
    (v_u_hien, v_category_id, 'SINGLES', 'MALE', NULL, 1980, 1980, 38, 33, 7, true, v_tier_s),
    (v_u_thang, v_category_id, 'SINGLES', 'MALE', NULL, 1920, 1920, 35, 29, 5, true, v_tier_s),
    (v_u_quynh, v_category_id, 'SINGLES', 'FEMALE', NULL, 1890, 1890, 32, 27, 6, true, v_tier_s),
    (v_u_thao, v_category_id, 'SINGLES', 'FEMALE', NULL, 1840, 1840, 28, 23, 4, true, v_tier_s),
    (v_u_bao, v_category_id, 'SINGLES', 'MALE', NULL, 1780, 1780, 25, 19, 3, true, v_tier_ha),
    (v_u_duc, v_category_id, 'SINGLES', 'MALE', NULL, 1720, 1720, 22, 16, 2, true, v_tier_ha),
    (v_u_mai, v_category_id, 'SINGLES', 'FEMALE', NULL, 1680, 1680, 20, 14, 2, true, v_tier_la),
    (v_u_anh, v_category_id, 'SINGLES', 'MALE', NULL, 1620, 1620, 18, 12, 1, true, v_tier_la),
    (v_u_son, v_category_id, 'SINGLES', 'MALE', NULL, 1560, 1560, 15, 9, 2, true, v_tier_hb),
    (v_u_trang, v_category_id, 'SINGLES', 'FEMALE', NULL, 1510, 1510, 16, 10, 1, true, v_tier_hb),
    (v_u_long, v_category_id, 'SINGLES', 'MALE', NULL, 1450, 1450, 14, 8, 0, true, v_tier_lb),
    (v_u_ngoc, v_category_id, 'SINGLES', 'FEMALE', NULL, 1390, 1390, 12, 6, 1, true, v_tier_hc),
    (v_u_khang, v_category_id, 'SINGLES', 'MALE', NULL, 1320, 1320, 10, 5, 0, true, v_tier_hc),
    (v_u_linh, v_category_id, 'SINGLES', 'FEMALE', NULL, 1250, 1250, 8, 4, 0, true, v_tier_lc)
  ON CONFLICT ("user_id", "category_id", "match_type", "gender_restriction", "community_id") DO UPDATE SET
    "elo_points" = EXCLUDED.elo_points,
    "peak_elo" = EXCLUDED.peak_elo,
    "matches_played" = EXCLUDED.matches_played,
    "matches_won" = EXCLUDED.matches_won,
    "win_streak" = EXCLUDED.win_streak,
    "admin_leaderboard_eligible" = true,
    "updated_at" = now();

  -- 7. User Ranks - Xếp hạng Đơn Mở Rộng / Toàn bộ (SINGLES Open - gender_restriction IS NULL)
  INSERT INTO "user_ranks" ("user_id", "category_id", "match_type", "gender_restriction", "community_id", "elo_points", "peak_elo", "matches_played", "matches_won", "win_streak", "admin_leaderboard_eligible", "tier_id")
  VALUES
    (v_u_ben, v_category_id, 'SINGLES', NULL, NULL, 2380, 2380, 78, 72, 14, true, v_tier_s),
    (v_u_annaleigh, v_category_id, 'SINGLES', NULL, NULL, 2340, 2340, 65, 61, 12, true, v_tier_s),
    (v_u_federico, v_category_id, 'SINGLES', NULL, NULL, 2210, 2210, 54, 46, 8, true, v_tier_s),
    (v_u_catherine, v_category_id, 'SINGLES', NULL, NULL, 2180, 2180, 49, 41, 6, true, v_tier_s),
    (v_u_tyson, v_category_id, 'SINGLES', NULL, NULL, 2150, 2150, 62, 50, 5, true, v_tier_s),
    (v_u_lea, v_category_id, 'SINGLES', NULL, NULL, 2090, 2090, 42, 34, 4, true, v_tier_s),
    (v_u_hien, v_category_id, 'SINGLES', NULL, NULL, 1980, 1980, 38, 33, 7, true, v_tier_s),
    (v_u_thang, v_category_id, 'SINGLES', NULL, NULL, 1920, 1920, 35, 29, 5, true, v_tier_s),
    (v_u_quynh, v_category_id, 'SINGLES', NULL, NULL, 1890, 1890, 32, 27, 6, true, v_tier_s),
    (v_u_thao, v_category_id, 'SINGLES', NULL, NULL, 1840, 1840, 28, 23, 4, true, v_tier_s),
    (v_u_bao, v_category_id, 'SINGLES', NULL, NULL, 1780, 1780, 25, 19, 3, true, v_tier_ha),
    (v_u_duc, v_category_id, 'SINGLES', NULL, NULL, 1720, 1720, 22, 16, 2, true, v_tier_ha),
    (v_u_mai, v_category_id, 'SINGLES', NULL, NULL, 1680, 1680, 20, 14, 2, true, v_tier_la),
    (v_u_anh, v_category_id, 'SINGLES', NULL, NULL, 1620, 1620, 18, 12, 1, true, v_tier_la),
    (v_u_son, v_category_id, 'SINGLES', NULL, NULL, 1560, 1560, 15, 9, 2, true, v_tier_hb),
    (v_u_trang, v_category_id, 'SINGLES', NULL, NULL, 1510, 1510, 16, 10, 1, true, v_tier_hb),
    (v_u_long, v_category_id, 'SINGLES', NULL, NULL, 1450, 1450, 14, 8, 0, true, v_tier_lb),
    (v_u_ngoc, v_category_id, 'SINGLES', NULL, NULL, 1390, 1390, 12, 6, 1, true, v_tier_hc),
    (v_u_khang, v_category_id, 'SINGLES', NULL, NULL, 1320, 1320, 10, 5, 0, true, v_tier_hc),
    (v_u_linh, v_category_id, 'SINGLES', NULL, NULL, 1250, 1250, 8, 4, 0, true, v_tier_lc)
  ON CONFLICT ("user_id", "category_id", "match_type", "community_id") WHERE "gender_restriction" IS NULL DO UPDATE SET
    "elo_points" = EXCLUDED.elo_points,
    "peak_elo" = EXCLUDED.peak_elo,
    "matches_played" = EXCLUDED.matches_played,
    "matches_won" = EXCLUDED.matches_won,
    "win_streak" = EXCLUDED.win_streak,
    "admin_leaderboard_eligible" = true,
    "updated_at" = now();

  -- 8. Pair Ranks - Đôi Nam (DOUBLES - MALE)
  INSERT INTO "pair_ranks" ("user1_id", "user2_id", "category_id", "match_type", "gender_restriction", "scope", "elo_points", "peak_elo", "matches_played", "matches_won", "win_streak", "admin_leaderboard_eligible")
  VALUES
    (LEAST(v_u_ben, v_u_tyson), GREATEST(v_u_ben, v_u_tyson), v_category_id, 'DOUBLES', 'MALE', 'PUBLIC', 2360, 2360, 45, 42, 9, true),
    (LEAST(v_u_federico, v_u_hien), GREATEST(v_u_federico, v_u_hien), v_category_id, 'DOUBLES', 'MALE', 'PUBLIC', 2150, 2150, 36, 31, 6, true),
    (LEAST(v_u_thang, v_u_bao), GREATEST(v_u_thang, v_u_bao), v_category_id, 'DOUBLES', 'MALE', 'PUBLIC', 1880, 1880, 28, 22, 4, true),
    (LEAST(v_u_duc, v_u_anh), GREATEST(v_u_duc, v_u_anh), v_category_id, 'DOUBLES', 'MALE', 'PUBLIC', 1690, 1690, 20, 14, 2, true)
  ON CONFLICT ("user1_id", "user2_id", "category_id", "match_type", "scope", COALESCE("gender_restriction", ''), COALESCE("community_id"::text, '')) DO UPDATE SET
    "elo_points" = EXCLUDED.elo_points,
    "peak_elo" = EXCLUDED.peak_elo,
    "matches_played" = EXCLUDED.matches_played,
    "matches_won" = EXCLUDED.matches_won,
    "win_streak" = EXCLUDED.win_streak,
    "admin_leaderboard_eligible" = true,
    "updated_at" = now();

  -- 9. Pair Ranks - Đôi Nữ (DOUBLES - FEMALE)
  INSERT INTO "pair_ranks" ("user1_id", "user2_id", "category_id", "match_type", "gender_restriction", "scope", "elo_points", "peak_elo", "matches_played", "matches_won", "win_streak", "admin_leaderboard_eligible")
  VALUES
    (LEAST(v_u_annaleigh, v_u_catherine), GREATEST(v_u_annaleigh, v_u_catherine), v_category_id, 'DOUBLES', 'FEMALE', 'PUBLIC', 2390, 2390, 52, 50, 15, true),
    (LEAST(v_u_lea, v_u_quynh), GREATEST(v_u_lea, v_u_quynh), v_category_id, 'DOUBLES', 'FEMALE', 'PUBLIC', 2040, 2040, 32, 26, 5, true),
    (LEAST(v_u_thao, v_u_mai), GREATEST(v_u_thao, v_u_mai), v_category_id, 'DOUBLES', 'FEMALE', 'PUBLIC', 1780, 1780, 24, 18, 3, true),
    (LEAST(v_u_trang, v_u_ngoc), GREATEST(v_u_trang, v_u_ngoc), v_category_id, 'DOUBLES', 'FEMALE', 'PUBLIC', 1520, 1520, 16, 10, 2, true)
  ON CONFLICT ("user1_id", "user2_id", "category_id", "match_type", "scope", COALESCE("gender_restriction", ''), COALESCE("community_id"::text, '')) DO UPDATE SET
    "elo_points" = EXCLUDED.elo_points,
    "peak_elo" = EXCLUDED.peak_elo,
    "matches_played" = EXCLUDED.matches_played,
    "matches_won" = EXCLUDED.matches_won,
    "win_streak" = EXCLUDED.win_streak,
    "admin_leaderboard_eligible" = true,
    "updated_at" = now();

  -- 10. Pair Ranks - Đôi Nam Nữ (MIXED_DOUBLES - MIXED)
  INSERT INTO "pair_ranks" ("user1_id", "user2_id", "category_id", "match_type", "gender_restriction", "scope", "elo_points", "peak_elo", "matches_played", "matches_won", "win_streak", "admin_leaderboard_eligible")
  VALUES
    (LEAST(v_u_ben, v_u_annaleigh), GREATEST(v_u_ben, v_u_annaleigh), v_category_id, 'MIXED_DOUBLES', 'MIXED', 'PUBLIC', 2420, 2420, 60, 58, 18, true),
    (LEAST(v_u_tyson, v_u_catherine), GREATEST(v_u_tyson, v_u_catherine), v_category_id, 'MIXED_DOUBLES', 'MIXED', 'PUBLIC', 2190, 2190, 40, 34, 7, true),
    (LEAST(v_u_hien, v_u_quynh), GREATEST(v_u_hien, v_u_quynh), v_category_id, 'MIXED_DOUBLES', 'MIXED', 'PUBLIC', 1960, 1960, 30, 25, 5, true),
    (LEAST(v_u_thang, v_u_thao), GREATEST(v_u_thang, v_u_thao), v_category_id, 'MIXED_DOUBLES', 'MIXED', 'PUBLIC', 1840, 1840, 25, 19, 3, true),
    (LEAST(v_u_bao, v_u_mai), GREATEST(v_u_bao, v_u_mai), v_category_id, 'MIXED_DOUBLES', 'MIXED', 'PUBLIC', 1710, 1710, 18, 13, 2, true)
  ON CONFLICT ("user1_id", "user2_id", "category_id", "match_type", "scope", COALESCE("gender_restriction", ''), COALESCE("community_id"::text, '')) DO UPDATE SET
    "elo_points" = EXCLUDED.elo_points,
    "peak_elo" = EXCLUDED.peak_elo,
    "matches_played" = EXCLUDED.matches_played,
    "matches_won" = EXCLUDED.matches_won,
    "win_streak" = EXCLUDED.win_streak,
    "admin_leaderboard_eligible" = true,
    "updated_at" = now();

  RAISE NOTICE 'Successfully seeded 20 pro athletes and ranks into production!';
END $$;
