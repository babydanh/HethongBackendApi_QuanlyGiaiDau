import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../schema';
import { eq, and, sql as dsql } from 'drizzle-orm';
import { createPostgresClientFromEnv } from '../postgres-client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

const uuidv4 = () => crypto.randomUUID();
const sql = createPostgresClientFromEnv({
  ssl: undefined,
});
const db = drizzle(sql, { schema });

// Danh sách VĐV nổi tiếng và người chơi mẫu chuyên nghiệp & phong trào
interface SeedPlayerInfo {
  name: string;
  email: string;
  gender: 'MALE' | 'FEMALE';
  avatarUrl?: string;
  bio?: string;
  singlesElo: number;
  matchesPlayed: number;
  matchesWon: number;
  winStreak: number;
}

const ATHLETES_PICKLEBALL: SeedPlayerInfo[] = [
  // Top Quốc Tế & Hàng Đầu
  {
    name: 'Ben Johns',
    email: 'ben.johns@athlete.world',
    gender: 'MALE',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    bio: '#1 World Pickleball Player (PPA Tour Champion)',
    singlesElo: 2380,
    matchesPlayed: 78,
    matchesWon: 72,
    winStreak: 14,
  },
  {
    name: 'Anna Leigh Waters',
    email: 'annaleigh.waters@athlete.world',
    gender: 'FEMALE',
    avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
    bio: '#1 Women Pickleball Prodigy (Triple Crown Winner)',
    singlesElo: 2340,
    matchesPlayed: 65,
    matchesWon: 61,
    winStreak: 12,
  },
  {
    name: 'Federico Staksrud',
    email: 'federico.staksrud@athlete.world',
    gender: 'MALE',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    bio: 'Top 3 Singles World Ranking - Argentinian Ace',
    singlesElo: 2210,
    matchesPlayed: 54,
    matchesWon: 46,
    winStreak: 8,
  },
  {
    name: 'Catherine Parenteau',
    email: 'catherine.parenteau@athlete.world',
    gender: 'FEMALE',
    avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
    bio: 'Canadian Pro Pickleball Champion',
    singlesElo: 2180,
    matchesPlayed: 49,
    matchesWon: 41,
    winStreak: 6,
  },
  {
    name: 'Tyson McGuffin',
    email: 'tyson.mcguffin@athlete.world',
    gender: 'MALE',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    bio: '5x Grand Slam Champion',
    singlesElo: 2150,
    matchesPlayed: 62,
    matchesWon: 50,
    winStreak: 5,
  },
  {
    name: 'Lea Jansen',
    email: 'lea.jansen@athlete.world',
    gender: 'FEMALE',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    bio: 'Pro Singles Specialist',
    singlesElo: 2090,
    matchesPlayed: 42,
    matchesWon: 34,
    winStreak: 4,
  },
  // Top Việt Nam & Khu Vực
  {
    name: 'Trương Vinh Hiển',
    email: 'hien.truong@pickleball.vn',
    gender: 'MALE',
    avatarUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80',
    bio: 'VĐV Tuyển Pickleball Việt Nam - Vô địch đơn nam giải Mở rộng',
    singlesElo: 1980,
    matchesPlayed: 38,
    matchesWon: 33,
    winStreak: 7,
  },
  {
    name: 'Nguyễn Anh Thắng',
    email: 'thang.nguyen@pickleball.vn',
    gender: 'MALE',
    avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80',
    bio: 'Hạt giống giải Pickleball Quốc Gia',
    singlesElo: 1920,
    matchesPlayed: 35,
    matchesWon: 29,
    winStreak: 5,
  },
  {
    name: 'Phạm Thị Như Quỳnh',
    email: 'quynh.pham@pickleball.vn',
    gender: 'FEMALE',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    bio: 'Vô địch đơn nữ Pickleball Miền Nam',
    singlesElo: 1890,
    matchesPlayed: 32,
    matchesWon: 27,
    winStreak: 6,
  },
  {
    name: 'Đặng Ngọc Thảo',
    email: 'thao.dang@pickleball.vn',
    gender: 'FEMALE',
    avatarUrl: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=150&auto=format&fit=crop&q=80',
    bio: 'VĐV Pickleball Trẻ Tiềm Năng',
    singlesElo: 1840,
    matchesPlayed: 28,
    matchesWon: 23,
    winStreak: 4,
  },
  {
    name: 'Lê Quốc Bảo',
    email: 'bao.le@pickleball.vn',
    gender: 'MALE',
    avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
    bio: 'Huy chương Bạc giải Thể thao Thường niên',
    singlesElo: 1780,
    matchesPlayed: 25,
    matchesWon: 19,
    winStreak: 3,
  },
  {
    name: 'Trần Minh Đức',
    email: 'duc.tran@pickleball.vn',
    gender: 'MALE',
    avatarUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80',
    bio: 'Tay vợt triển vọng TP.HCM',
    singlesElo: 1720,
    matchesPlayed: 22,
    matchesWon: 16,
    winStreak: 2,
  },
  {
    name: 'Vũ Hoàng Mai',
    email: 'mai.vu@pickleball.vn',
    gender: 'FEMALE',
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    bio: 'Huy chương Đồng Đơn Nữ Cup Hà Nội',
    singlesElo: 1680,
    matchesPlayed: 20,
    matchesWon: 14,
    winStreak: 2,
  },
  {
    name: 'Bùi Tuấn Anh',
    email: 'anh.bui@pickleball.vn',
    gender: 'MALE',
    avatarUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
    bio: 'Thành viên CLB Pickleball Sài Gòn',
    singlesElo: 1620,
    matchesPlayed: 18,
    matchesWon: 12,
    winStreak: 1,
  },
  {
    name: 'Ngô Thanh Sơn',
    email: 'son.ngo@pickleball.vn',
    gender: 'MALE',
    avatarUrl: 'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=150&auto=format&fit=crop&q=80',
    bio: 'VĐV Bán chuyên',
    singlesElo: 1560,
    matchesPlayed: 15,
    matchesWon: 9,
    winStreak: 2,
  },
  {
    name: 'Đỗ Thùy Trang',
    email: 'trang.do@pickleball.vn',
    gender: 'FEMALE',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    bio: 'Người chơi tích cực giải phong trào',
    singlesElo: 1510,
    matchesPlayed: 16,
    matchesWon: 10,
    winStreak: 1,
  },
  {
    name: 'Hoàng Văn Long',
    email: 'long.hoang@pickleball.vn',
    gender: 'MALE',
    avatarUrl: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=150&auto=format&fit=crop&q=80',
    bio: 'Thành viên CLB Pickleball Đà Nẵng',
    singlesElo: 1450,
    matchesPlayed: 14,
    matchesWon: 8,
    winStreak: 0,
  },
  {
    name: 'Lê Bích Ngọc',
    email: 'ngoc.le@pickleball.vn',
    gender: 'FEMALE',
    avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
    bio: 'Hạng B phong trào toàn quốc',
    singlesElo: 1390,
    matchesPlayed: 12,
    matchesWon: 6,
    winStreak: 1,
  },
  {
    name: 'Võ Minh Khang',
    email: 'khang.vo@pickleball.vn',
    gender: 'MALE',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    bio: 'Người đam mê Pickleball',
    singlesElo: 1320,
    matchesPlayed: 10,
    matchesWon: 5,
    winStreak: 0,
  },
  {
    name: 'Hồ Phương Linh',
    email: 'linh.ho@pickleball.vn',
    gender: 'FEMALE',
    avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
    bio: 'Người mới nhập môn thi đấu',
    singlesElo: 1250,
    matchesPlayed: 8,
    matchesWon: 4,
    winStreak: 0,
  },
];

async function main() {
  console.log('=== BẮT ĐẦU SEED DỮ LIỆU BẢNG XẾP HẠNG ĐƠN & ĐÔI (PRODUCTION READY) ===\n');

  // 1. Lấy role 'player'
  let [playerRole] = await db.select().from(schema.roles).where(eq(schema.roles.slug, 'player')).limit(1);
  if (!playerRole) {
    [playerRole] = await db.insert(schema.roles).values({
      name: 'PLAYER',
      slug: 'player',
      description: 'Người chơi / Vận động viên',
    }).returning();
  }

  // 2. Lấy bộ môn Pickleball
  const targetCategories = await db.select().from(schema.categories);
  const pickleball = targetCategories.find((c) => c.slug === 'pickleball') || targetCategories[0];
  if (!pickleball) {
    throw new Error('Chưa tìm thấy danh mục thể thao nào trong Database. Vui lòng chạy seed:categories trước!');
  }
  console.log(`➜ Đang dùng bộ môn: ${pickleball.name} (${pickleball.id})`);

  // Lấy ELO Tiers của pickleball
  const tiers = await db.select().from(schema.eloTiers).where(eq(schema.eloTiers.categoryId, pickleball.id));
  const sortedTiers = [...tiers].sort((a, b) => b.minElo - a.minElo);

  const getTierForElo = (elo: number) => {
    for (const t of sortedTiers) {
      if (t.minElo !== null && elo >= t.minElo) {
        return t.id;
      }
    }
    return sortedTiers[sortedTiers.length - 1]?.id ?? null;
  };

  // 3. Tạo hoặc lấy User + Profile cho từng vận động viên
  console.log('\n3. Khởi tạo/cập nhật danh sách vận động viên & Xếp hạng Đơn (Singles)...');
  const createdUserIds: { id: string; player: SeedPlayerInfo }[] = [];
  const defaultPassword = 'Player@123';
  const passwordHash = bcrypt.hashSync(defaultPassword, 10);

  for (const item of ATHLETES_PICKLEBALL) {
    let [user] = await db.select().from(schema.users).where(eq(schema.users.email, item.email)).limit(1);

    if (!user) {
      [user] = await db.insert(schema.users).values({
        id: uuidv4(),
        email: item.email,
        passwordHash,
        isEmailVerified: true,
        isPhoneVerified: true,
        isMock: false, // Để hiển thị lên bảng xếp hạng thật
      }).returning();
      console.log(`   + Tạo User: ${item.name} (${item.email})`);
    } else {
      // Đảm bảo isMock = false để hiển thị trên BXH
      await db.update(schema.users).set({ isMock: false }).where(eq(schema.users.id, user.id));
    }

    // Role
    await db.insert(schema.userToRoles).values({
      userId: user.id,
      roleId: playerRole.id,
    }).onConflictDoNothing();

    // Profile
    const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, user.id)).limit(1);
    if (!profile) {
      await db.insert(schema.profiles).values({
        userId: user.id,
        fullName: item.name,
        avatarUrl: item.avatarUrl,
        bio: item.bio,
        gender: item.gender,
        isVerified: true,
      });
    } else {
      await db.update(schema.profiles).set({
        fullName: item.name,
        avatarUrl: item.avatarUrl || profile.avatarUrl,
        bio: item.bio || profile.bio,
        gender: item.gender,
        isVerified: true,
      }).where(eq(schema.profiles.userId, user.id));
    }

    createdUserIds.push({ id: user.id, player: item });

    // 4. Tạo User Rank Đơn (Singles - Nam/Nữ và Open)
    const tierId = getTierForElo(item.singlesElo);

    // Xếp hạng Đơn với Gender tương ứng
    const [existingGenderRank] = await db
      .select()
      .from(schema.userRanks)
      .where(
        and(
          eq(schema.userRanks.userId, user.id),
          eq(schema.userRanks.categoryId, pickleball.id),
          eq(schema.userRanks.matchType, 'SINGLES'),
          eq(schema.userRanks.genderRestriction, item.gender),
          dsql`${schema.userRanks.communityId} IS NULL`,
        ),
      )
      .limit(1);

    if (!existingGenderRank) {
      await db.insert(schema.userRanks).values({
        userId: user.id,
        categoryId: pickleball.id,
        matchType: 'SINGLES',
        genderRestriction: item.gender,
        eloPoints: item.singlesElo,
        peakElo: item.singlesElo,
        tierId,
        matchesPlayed: item.matchesPlayed,
        matchesWon: item.matchesWon,
        winStreak: item.winStreak,
        adminLeaderboardEligible: true,
      });
    } else {
      await db
        .update(schema.userRanks)
        .set({
          eloPoints: item.singlesElo,
          peakElo: Math.max(existingGenderRank.peakElo, item.singlesElo),
          tierId,
          matchesPlayed: Math.max(existingGenderRank.matchesPlayed, item.matchesPlayed),
          matchesWon: Math.max(existingGenderRank.matchesWon, item.matchesWon),
          winStreak: item.winStreak,
          adminLeaderboardEligible: true,
          updatedAt: new Date(),
        })
        .where(eq(schema.userRanks.id, existingGenderRank.id));
    }

    // Xếp hạng Đơn Open (genderRestriction = null để hiện ở bộ lọc All/Tất cả giới tính)
    const [existingOpenRank] = await db
      .select()
      .from(schema.userRanks)
      .where(
        and(
          eq(schema.userRanks.userId, user.id),
          eq(schema.userRanks.categoryId, pickleball.id),
          eq(schema.userRanks.matchType, 'SINGLES'),
          dsql`${schema.userRanks.genderRestriction} IS NULL`,
          dsql`${schema.userRanks.communityId} IS NULL`,
        ),
      )
      .limit(1);

    if (!existingOpenRank) {
      await db.insert(schema.userRanks).values({
        userId: user.id,
        categoryId: pickleball.id,
        matchType: 'SINGLES',
        genderRestriction: null,
        eloPoints: item.singlesElo,
        peakElo: item.singlesElo,
        tierId,
        matchesPlayed: item.matchesPlayed,
        matchesWon: item.matchesWon,
        winStreak: item.winStreak,
        adminLeaderboardEligible: true,
      });
    } else {
      await db
        .update(schema.userRanks)
        .set({
          eloPoints: item.singlesElo,
          peakElo: Math.max(existingOpenRank.peakElo, item.singlesElo),
          tierId,
          matchesPlayed: Math.max(existingOpenRank.matchesPlayed, item.matchesPlayed),
          matchesWon: Math.max(existingOpenRank.matchesWon, item.matchesWon),
          winStreak: item.winStreak,
          adminLeaderboardEligible: true,
          updatedAt: new Date(),
        })
        .where(eq(schema.userRanks.id, existingOpenRank.id));
    }
  }

  // 5. Khởi tạo dữ liệu Xếp hạng Đôi (Pair Ranks - Đôi Nam, Đôi Nữ, Đôi Nam Nữ)
  console.log('\n5. Khởi tạo danh sách Cặp đôi & Xếp hạng Đôi (Doubles / Mixed Doubles)...');
  const malePlayers = createdUserIds.filter((p) => p.player.gender === 'MALE');
  const femalePlayers = createdUserIds.filter((p) => p.player.gender === 'FEMALE');

  interface SeedPairConfig {
    user1: { id: string; player: SeedPlayerInfo };
    user2: { id: string; player: SeedPlayerInfo };
    matchType: 'DOUBLES' | 'MIXED_DOUBLES';
    genderRestriction: 'MALE' | 'FEMALE' | 'MIXED';
    eloPoints: number;
    matchesPlayed: number;
    matchesWon: number;
    winStreak: number;
  }

  const samplePairs: SeedPairConfig[] = [];

  // Tạo các cặp Đôi Nam (DOUBLES - MALE)
  if (malePlayers.length >= 4) {
    samplePairs.push(
      {
        user1: malePlayers[0], // Ben Johns
        user2: malePlayers[2], // Tyson McGuffin
        matchType: 'DOUBLES',
        genderRestriction: 'MALE',
        eloPoints: 2360,
        matchesPlayed: 45,
        matchesWon: 42,
        winStreak: 9,
      },
      {
        user1: malePlayers[1], // Federico Staksrud
        user2: malePlayers[3], // Trương Vinh Hiển
        matchType: 'DOUBLES',
        genderRestriction: 'MALE',
        eloPoints: 2150,
        matchesPlayed: 36,
        matchesWon: 31,
        winStreak: 6,
      },
      {
        user1: malePlayers[4], // Nguyễn Anh Thắng
        user2: malePlayers[5], // Lê Quốc Bảo
        matchType: 'DOUBLES',
        genderRestriction: 'MALE',
        eloPoints: 1880,
        matchesPlayed: 28,
        matchesWon: 22,
        winStreak: 4,
      },
      {
        user1: malePlayers[6], // Trần Minh Đức
        user2: malePlayers[7], // Bùi Tuấn Anh
        matchType: 'DOUBLES',
        genderRestriction: 'MALE',
        eloPoints: 1690,
        matchesPlayed: 20,
        matchesWon: 14,
        winStreak: 2,
      },
    );
  }

  // Tạo các cặp Đôi Nữ (DOUBLES - FEMALE)
  if (femalePlayers.length >= 4) {
    samplePairs.push(
      {
        user1: femalePlayers[0], // Anna Leigh Waters
        user2: femalePlayers[1], // Catherine Parenteau
        matchType: 'DOUBLES',
        genderRestriction: 'FEMALE',
        eloPoints: 2390,
        matchesPlayed: 52,
        matchesWon: 50,
        winStreak: 15,
      },
      {
        user1: femalePlayers[2], // Lea Jansen
        user2: femalePlayers[3], // Phạm Thị Như Quỳnh
        matchType: 'DOUBLES',
        genderRestriction: 'FEMALE',
        eloPoints: 2040,
        matchesPlayed: 32,
        matchesWon: 26,
        winStreak: 5,
      },
      {
        user1: femalePlayers[4], // Đặng Ngọc Thảo
        user2: femalePlayers[5], // Vũ Hoàng Mai
        matchType: 'DOUBLES',
        genderRestriction: 'FEMALE',
        eloPoints: 1780,
        matchesPlayed: 24,
        matchesWon: 18,
        winStreak: 3,
      },
      {
        user1: femalePlayers[6], // Đỗ Thùy Trang
        user2: femalePlayers[7], // Lê Bích Ngọc
        matchType: 'DOUBLES',
        genderRestriction: 'FEMALE',
        eloPoints: 1520,
        matchesPlayed: 16,
        matchesWon: 10,
        winStreak: 2,
      },
    );
  }

  // Tạo các cặp Đôi Nam Nữ (MIXED_DOUBLES - MIXED)
  if (malePlayers.length >= 4 && femalePlayers.length >= 4) {
    samplePairs.push(
      {
        user1: malePlayers[0], // Ben Johns
        user2: femalePlayers[0], // Anna Leigh Waters (Bộ đôi số 1 thế giới)
        matchType: 'MIXED_DOUBLES',
        genderRestriction: 'MIXED',
        eloPoints: 2420,
        matchesPlayed: 60,
        matchesWon: 58,
        winStreak: 18,
      },
      {
        user1: malePlayers[2], // Tyson McGuffin
        user2: femalePlayers[1], // Catherine Parenteau
        matchType: 'MIXED_DOUBLES',
        genderRestriction: 'MIXED',
        eloPoints: 2190,
        matchesPlayed: 40,
        matchesWon: 34,
        winStreak: 7,
      },
      {
        user1: malePlayers[3], // Trương Vinh Hiển
        user2: femalePlayers[3], // Phạm Thị Như Quỳnh (Cặp đôi số 1 VN)
        matchType: 'MIXED_DOUBLES',
        genderRestriction: 'MIXED',
        eloPoints: 1960,
        matchesPlayed: 30,
        matchesWon: 25,
        winStreak: 5,
      },
      {
        user1: malePlayers[4], // Nguyễn Anh Thắng
        user2: femalePlayers[4], // Đặng Ngọc Thảo
        matchType: 'MIXED_DOUBLES',
        genderRestriction: 'MIXED',
        eloPoints: 1840,
        matchesPlayed: 25,
        matchesWon: 19,
        winStreak: 3,
      },
      {
        user1: malePlayers[5], // Lê Quốc Bảo
        user2: femalePlayers[5], // Vũ Hoàng Mai
        matchType: 'MIXED_DOUBLES',
        genderRestriction: 'MIXED',
        eloPoints: 1710,
        matchesPlayed: 18,
        matchesWon: 13,
        winStreak: 2,
      },
    );
  }

  for (const pair of samplePairs) {
    // Sắp xếp ID để bảo đảm tính duy nhất hoặc tìm kiếm
    const u1 = pair.user1.id < pair.user2.id ? pair.user1.id : pair.user2.id;
    const u2 = pair.user1.id < pair.user2.id ? pair.user2.id : pair.user1.id;

    const [existingPair] = await db
      .select()
      .from(schema.pairRanks)
      .where(
        and(
          eq(schema.pairRanks.user1Id, u1),
          eq(schema.pairRanks.user2Id, u2),
          eq(schema.pairRanks.categoryId, pickleball.id),
          eq(schema.pairRanks.matchType, pair.matchType),
          eq(schema.pairRanks.genderRestriction, pair.genderRestriction),
          eq(schema.pairRanks.scope, 'PUBLIC'),
          dsql`${schema.pairRanks.communityId} IS NULL`,
        ),
      )
      .limit(1);

    if (!existingPair) {
      await db.insert(schema.pairRanks).values({
        user1Id: u1,
        user2Id: u2,
        categoryId: pickleball.id,
        matchType: pair.matchType,
        genderRestriction: pair.genderRestriction,
        scope: 'PUBLIC',
        eloPoints: pair.eloPoints,
        peakElo: pair.eloPoints,
        matchesPlayed: pair.matchesPlayed,
        matchesWon: pair.matchesWon,
        winStreak: pair.winStreak,
        adminLeaderboardEligible: true,
      });
      console.log(`   + Đã tạo Cặp: ${pair.user1.player.name} & ${pair.user2.player.name} (${pair.matchType} - ${pair.eloPoints} ELO)`);
    } else {
      await db
        .update(schema.pairRanks)
        .set({
          eloPoints: pair.eloPoints,
          peakElo: Math.max(existingPair.peakElo, pair.eloPoints),
          matchesPlayed: Math.max(existingPair.matchesPlayed, pair.matchesPlayed),
          matchesWon: Math.max(existingPair.matchesWon, pair.matchesWon),
          winStreak: pair.winStreak,
          adminLeaderboardEligible: true,
          updatedAt: new Date(),
        })
        .where(eq(schema.pairRanks.id, existingPair.id));
      console.log(`   ~ Cập nhật Cặp: ${pair.user1.player.name} & ${pair.user2.player.name} (${pair.eloPoints} ELO)`);
    }
  }

  console.log('\n=== HOÀN THÀNH SEED DỮ LIỆU BẢNG XẾP HẠNG ĐƠN & ĐÔI THÀNH CÔNG ===');
  await sql.end();
}

main().catch(async (err) => {
  console.error('❌ Lỗi khi chạy seed ranking:', err);
  await sql.end();
  process.exit(1);
});
