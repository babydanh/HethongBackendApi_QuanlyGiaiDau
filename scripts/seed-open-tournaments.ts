import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../src/database/schema';
import { createPostgresClientFromEnv } from '../src/database/postgres-client';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';

import postgres from 'postgres';

async function getClient() {
  const host = process.env.DB_HOST || '127.0.0.1';
  const username = process.env.DB_USERNAME || 'postgres';
  const password = process.env.DB_PASSWORD || 'your_password';
  const database = process.env.DB_DATABASE || 'tournament_db';

  const ports = [parseInt(process.env.DB_PORT || '5433', 10), 5432, 5433];
  for (const port of Array.from(new Set(ports))) {
    try {
      const sqlClient = postgres({
        host,
        port,
        username,
        password,
        database,
        ssl: false,
        max: 5,
        connect_timeout: 3,
        onnotice: () => {},
      });
      // Test query
      await sqlClient`SELECT 1`;
      console.log(`🔌 Kết nối PostgreSQL thành công tại cổng: ${port}`);
      return sqlClient;
    } catch (e) {
      // try next port
    }
  }
  throw new Error('Không thể kết nối tới PostgreSQL trên cổng 5433 hoặc 5432. Vui lòng kiểm tra dịch vụ PostgreSQL.');
}

async function main() {
  console.log('🚀 Bắt đầu seed 3 Giải đấu đang MỞ ĐĂNG KÝ (Đơn Nam/Nữ, Đôi Nam/Nữ, Đôi Nam Nữ)...');
  const sql = await getClient();
  const db = drizzle(sql, { schema });

  // 1. Lấy hoặc tạo User Admin làm Organizer
  let [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, 'vndcsport@gmail.com'))
    .limit(1);

  if (!user) {
    console.log('Tạo mới user admin vndcsport@gmail.com...');
    [user] = await db
      .insert(schema.users)
      .values({
        email: 'vndcsport@gmail.com',
        isEmailVerified: true,
        isMock: false,
      })
      .returning();
    await db.insert(schema.profiles).values({
      userId: user.id,
      fullName: 'VNDC Sport Admin',
    });
  }

  // 2. Lấy Categories (Pickleball, Badminton, Tennis)
  const categories = await db.select().from(schema.categories);
  const findCat = (slug: string) =>
    categories.find((c) => c.slug.toLowerCase() === slug.toLowerCase()) || categories[0];

  const pickleballCat = findCat('pickleball');
  const badmintonCat = findCat('badminton');
  const tennisCat = findCat('tennis');

  if (!pickleballCat) {
    throw new Error('Chưa có danh mục thể thao nào trong Database!');
  }

  // 3. Lấy Venue
  let [venue] = await db.select().from(schema.tournamentVenues).limit(1);
  if (!venue) {
    [venue] = await db
      .insert(schema.tournamentVenues)
      .values({
        id: randomUUID(),
        name: 'Sân Thi Đấu Trung Tâm VNDC Sport',
        locationAddress: '154 Trần Não, Phường An Khánh, TP. Thủ Đức, TP. Hồ Chí Minh',
      })
      .returning();
  }

  const DAY_MS = 86400000;
  const NOW_TS = Date.now();
  const regStart = new Date(NOW_TS - 2 * DAY_MS);
  const regEnd = new Date(NOW_TS + 14 * DAY_MS);
  const tStart = new Date(NOW_TS + 15 * DAY_MS);
  const tEnd = new Date(NOW_TS + 20 * DAY_MS);

  // ───────────────────────────────────────────────────────────────────────────
  // GIẢI 1: ĐƠN (Đơn Nam & Đơn Nữ) - Pickleball
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 1. Seed Giải Đơn Mở Đăng Ký (Pickleball) ---');
  const tour1Id = randomUUID();
  await db.insert(schema.tournaments).values({
    id: tour1Id,
    name: 'Giải Pickleball Đơn Nam & Đơn Nữ Mở Rộng 2026',
    description: 'Giải đấu thi đấu Đơn Nam và Đơn Nữ dành cho tất cả vận động viên. Đang mở cổng đăng ký trực tuyến!',
    categoryId: pickleballCat.id,
    createdBy: user.id,
    venueId: venue.id,
    status: 'REGISTRATION_OPEN',
    matchType: 'SINGLES',
    genderRestriction: 'MALE',
    sportRules: { kind: 'PICKLEBALL', setsToWin: 2, pointsPerSet: 11 },
    tournamentConfig: { bracketType: 'SINGLE_ELIMINATION', maxTeams: 16 },
    entryFee: '100000.00',
    maxParticipants: 16,
    registrationStartDate: regStart,
    registrationEndDate: regEnd,
    startDate: tStart,
    endDate: tEnd,
    tournamentType: 'PUBLIC',
    visibility: 'PUBLIC',
    isRanked: true,
    prizeDescription: 'Cúp vô địch + 3.000.000đ tiền mặt',
    inviteCode: `SINGLE-${Date.now().toString().slice(-4)}`,
  });

  const div1_1Id = randomUUID();
  const div1_2Id = randomUUID();
  await db.insert(schema.tournamentDivisions).values([
    {
      id: div1_1Id,
      tournamentId: tour1Id,
      name: 'Nội dung Đơn Nam',
      matchType: 'SINGLES',
      genderRestriction: 'MALE',
      bracketType: 'SINGLE_ELIMINATION',
      entryFee: '100000.00',
      maxParticipants: 16,
      status: 'ACTIVE',
    },
    {
      id: div1_2Id,
      tournamentId: tour1Id,
      name: 'Nội dung Đơn Nữ',
      matchType: 'SINGLES',
      genderRestriction: 'FEMALE',
      bracketType: 'SINGLE_ELIMINATION',
      entryFee: '100000.00',
      maxParticipants: 16,
      status: 'ACTIVE',
    },
  ]);
  console.log(`✅ Đã tạo Tournament Đơn: ${tour1Id}`);

  // ───────────────────────────────────────────────────────────────────────────
  // GIẢI 2: ĐÔI (Đôi Nam & Đôi Nữ) - Cầu Lông
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Seed Giải Đôi Mở Đăng Ký (Cầu Lông) ---');
  const tour2Id = randomUUID();
  await db.insert(schema.tournaments).values({
    id: tour2Id,
    name: 'Giải Cầu Lông Đôi Nam & Đôi Nữ Mở Rộng 2026',
    description: 'Giải cầu lông quy mô đôi nam và đôi nữ toàn quốc. Đang nhận hồ sơ đăng ký thi đấu!',
    categoryId: badmintonCat.id,
    createdBy: user.id,
    venueId: venue.id,
    status: 'REGISTRATION_OPEN',
    matchType: 'DOUBLES',
    genderRestriction: 'MALE',
    sportRules: { kind: 'BADMINTON', setsToWin: 2, pointsPerSet: 21 },
    tournamentConfig: { bracketType: 'SINGLE_ELIMINATION', maxTeams: 16 },
    entryFee: '150000.00',
    maxParticipants: 16,
    registrationStartDate: regStart,
    registrationEndDate: regEnd,
    startDate: tStart,
    endDate: tEnd,
    tournamentType: 'PUBLIC',
    visibility: 'PUBLIC',
    isRanked: true,
    prizeDescription: 'Cúp đôi vô địch + 5.000.000đ tiền mặt',
    inviteCode: `DOUBLE-${Date.now().toString().slice(-4)}`,
  });

  const div2_1Id = randomUUID();
  const div2_2Id = randomUUID();
  await db.insert(schema.tournamentDivisions).values([
    {
      id: div2_1Id,
      tournamentId: tour2Id,
      name: 'Nội dung Đôi Nam',
      matchType: 'DOUBLES',
      genderRestriction: 'MALE',
      bracketType: 'SINGLE_ELIMINATION',
      entryFee: '150000.00',
      maxParticipants: 16,
      status: 'ACTIVE',
    },
    {
      id: div2_2Id,
      tournamentId: tour2Id,
      name: 'Nội dung Đôi Nữ',
      matchType: 'DOUBLES',
      genderRestriction: 'FEMALE',
      bracketType: 'SINGLE_ELIMINATION',
      entryFee: '150000.00',
      maxParticipants: 16,
      status: 'ACTIVE',
    },
  ]);
  console.log(`✅ Đã tạo Tournament Đôi: ${tour2Id}`);

  // ───────────────────────────────────────────────────────────────────────────
  // GIẢI 3: ĐÔI NAM NỮ (Mixed Doubles) - Tennis
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Seed Giải Đôi Nam Nữ Mở Đăng Ký (Tennis) ---');
  const tour3Id = randomUUID();
  await db.insert(schema.tournaments).values({
    id: tour3Id,
    name: 'Giải Tennis Đôi Nam Nữ Mở Rộng 2026',
    description: 'Giải đấu thi đấu Đôi Nam Nữ (Mixed Doubles). Mở đăng ký tự do trên toàn hệ thống!',
    categoryId: tennisCat.id,
    createdBy: user.id,
    venueId: venue.id,
    status: 'REGISTRATION_OPEN',
    matchType: 'MIXED_DOUBLES',
    genderRestriction: 'MIXED',
    sportRules: { kind: 'TENNIS', setsToWin: 2, pointsPerSet: 6 },
    tournamentConfig: { bracketType: 'SINGLE_ELIMINATION', maxTeams: 16 },
    entryFee: '200000.00',
    maxParticipants: 16,
    registrationStartDate: regStart,
    registrationEndDate: regEnd,
    startDate: tStart,
    endDate: tEnd,
    tournamentType: 'PUBLIC',
    visibility: 'PUBLIC',
    isRanked: true,
    prizeDescription: 'Cúp đôi vô địch + 6.000.000đ tiền mặt',
    inviteCode: `MIXED-${Date.now().toString().slice(-4)}`,
  });

  const div3_1Id = randomUUID();
  await db.insert(schema.tournamentDivisions).values([
    {
      id: div3_1Id,
      tournamentId: tour3Id,
      name: 'Nội dung Đôi Nam Nữ',
      matchType: 'MIXED_DOUBLES',
      genderRestriction: 'MIXED',
      bracketType: 'SINGLE_ELIMINATION',
      entryFee: '200000.00',
      maxParticipants: 16,
      status: 'ACTIVE',
    },
  ]);
  console.log(`✅ Đã tạo Tournament Đôi Nam Nữ: ${tour3Id}`);

  console.log('\n=======================================================');
  console.log('🎉 SEED HOÀN TẤT 3 GIẢI ĐẤU ĐANG MỞ ĐĂNG KÝ THÀNH CÔNG!');
  console.log('=======================================================');

  await sql.end();
}

main().catch(async (err) => {
  console.error('❌ Lỗi khi chạy seed-open-tournaments:', err);
  process.exit(1);
});
