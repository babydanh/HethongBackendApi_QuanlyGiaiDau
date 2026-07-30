import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../schema';
import { createPostgresClientFromEnv } from '../postgres-client';
import { eq, ilike, or } from 'drizzle-orm';
import Redis from 'ioredis';

const sqlClient = createPostgresClientFromEnv({ ssl: undefined });
const db = drizzle(sqlClient, { schema });

async function main() {
  console.log('=== ĐANG TẠO SEED GIẢI ĐẤU (BÓNG BÀN & CẦU LÔNG - BANNER ẨN CHỮ) ===\n');

  let [adminUser] = await db.select().from(schema.users).limit(1);
  if (!adminUser) {
    console.error('Không tìm thấy user admin để tạo giải!');
    process.exit(1);
  }

  // 1. Lấy tất cả danh mục để match chính xác
  const allCategories = await db.select().from(schema.categories);
  const badmintonCat = allCategories.find((c) =>
    c.slug.toLowerCase().includes('badminton') ||
    c.slug.toLowerCase().includes('cau-long') ||
    c.name.toLowerCase().includes('cầu lông'),
  );
  const tableTennisCat = allCategories.find((c) =>
    c.slug.toLowerCase().includes('table') ||
    c.slug.toLowerCase().includes('bong-ban') ||
    c.name.toLowerCase().includes('bóng bàn'),
  );

  const badmintonCatId = badmintonCat?.id;
  const tableTennisCatId = tableTennisCat?.id;

  if (!badmintonCatId || !tableTennisCatId) {
    throw new Error(
      `Không tìm thấy category cần seed: badminton=${badmintonCatId ?? 'missing'}, tableTennis=${tableTennisCatId ?? 'missing'}`,
    );
  }

  const seededTournamentIds: string[] = [];

  console.log(`📌 Danh mục Cầu lông: "${badmintonCat?.name || 'N/A'}" (ID: ${badmintonCatId})`);
  console.log(`📌 Danh mục Bóng bàn: "${tableTennisCat?.name || 'N/A'}" (ID: ${tableTennisCatId})\n`);

  const now = new Date();
  const startDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
  const endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const regStart = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
  const regEnd = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

  // Xóa các giải seed thử nghiệm cũ có tên 'Banner Ẩn Chữ'
  await db
    .delete(schema.tournaments)
    .where(ilike(schema.tournaments.name, '%Banner Ẩn Chữ%'));

  // Cập nhật tất cả các giải đấu hiện có trong DB đặt hideFeaturedCardText = true
  const existingTournaments = await db.select().from(schema.tournaments);
  for (const tourney of existingTournaments) {
    const currentConfig = (tourney.tournamentConfig as Record<string, unknown>) || {};
    await db
      .update(schema.tournaments)
      .set({
        tournamentConfig: {
          ...currentConfig,
          hideFeaturedCardText: true,
        },
      })
      .where(eq(schema.tournaments.id, tourney.id));
  }
  console.log(`✅ Đã cập nhật ${existingTournaments.length} giải đấu hiện có -> hideFeaturedCardText: true`);

  // --- MÔN CẦU LÔNG ---
  if (badmintonCatId) {
    // Giải Cầu Lông 1 (REGISTRATION_OPEN)
    const [b1] = await db
      .insert(schema.tournaments)
      .values({
        name: '🏸 VNSPORT Badminton Championship (Banner Ẩn Chữ 1)',
        description: 'Giải đấu Cầu lông mở rộng thử nghiệm tính năng Ẩn Chữ Đè Trên Banner.',
        categoryId: badmintonCatId,
        createdBy: adminUser.id,
        tournamentType: 'PUBLIC',
        visibility: 'PUBLIC',
        status: 'REGISTRATION_OPEN',
        sportRules: { setsToWin: 2, pointsPerSet: 21 },
        tournamentConfig: { hideFeaturedCardText: true },
        entryFee: '150000.00',
        maxParticipants: 16,
        registrationStartDate: regStart,
        registrationEndDate: regEnd,
        startDate: startDate,
        endDate: endDate,
        bannerUrl: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?q=80&w=1200&auto=format&fit=crop',
        isRanked: true,
      })
      .returning();

    await db.insert(schema.tournamentDivisions).values({
      tournamentId: b1.id,
      name: 'Đôi Nam Nữ Cầu Lông',
      matchType: 'MIXED_DOUBLES',
      genderRestriction: 'MIXED',
      entryFee: '150000.00',
      maxParticipants: 16,
      registrationEndDate: regEnd,
    });
    console.log(`✅ Đã tạo Giải Cầu lông 1: "${b1.name}" (ID: ${b1.id}) - status: REGISTRATION_OPEN, hideFeaturedCardText: true`);
    seededTournamentIds.push(b1.id);

    // Giải Cầu Lông 2 (IN_PROGRESS)
    const [b2] = await db
      .insert(schema.tournaments)
      .values({
        name: '⚡ Badminton Super League 2026 (Banner Ẩn Chữ 2)',
        description: 'Giải đấu Cầu lông chuyên nghiệp thử nghiệm tính năng Ẩn Chữ Đè Trên Banner số 2.',
        categoryId: badmintonCatId,
        createdBy: adminUser.id,
        tournamentType: 'PUBLIC',
        visibility: 'PUBLIC',
        status: 'IN_PROGRESS',
        sportRules: { setsToWin: 2, pointsPerSet: 21 },
        tournamentConfig: { hideFeaturedCardText: true },
        entryFee: '200000.00',
        maxParticipants: 32,
        registrationStartDate: regStart,
        registrationEndDate: regEnd,
        startDate: startDate,
        endDate: endDate,
        bannerUrl: 'https://images.unsplash.com/photo-1521537634581-0ddea2eed2b0?q=80&w=1200&auto=format&fit=crop',
        isRanked: true,
      })
      .returning();

    await db.insert(schema.tournamentDivisions).values({
      tournamentId: b2.id,
      name: 'Đơn Nam Cầu Lông',
      matchType: 'SINGLES',
      genderRestriction: 'MALE',
      entryFee: '200000.00',
      maxParticipants: 32,
      registrationEndDate: regEnd,
    });
    console.log(`✅ Đã tạo Giải Cầu lông 2: "${b2.name}" (ID: ${b2.id}) - status: IN_PROGRESS, hideFeaturedCardText: true`);
    seededTournamentIds.push(b2.id);
  }

  // --- MÔN BÓNG BÀN ---
  if (tableTennisCatId) {
    // Giải Bóng Bàn 1 (REGISTRATION_OPEN)
    const [t1] = await db
      .insert(schema.tournaments)
      .values({
        name: '🏓 VNSPORT Table Tennis Open (Banner Ẩn Chữ 3)',
        description: 'Giải đấu Bóng bàn mở rộng thử nghiệm tính năng Ẩn Chữ Đè Trên Banner.',
        categoryId: tableTennisCatId,
        createdBy: adminUser.id,
        tournamentType: 'PUBLIC',
        visibility: 'PUBLIC',
        status: 'REGISTRATION_OPEN',
        sportRules: { setsToWin: 3, pointsPerSet: 11 },
        tournamentConfig: { hideFeaturedCardText: true },
        entryFee: '150000.00',
        maxParticipants: 16,
        registrationStartDate: regStart,
        registrationEndDate: regEnd,
        startDate: startDate,
        endDate: endDate,
        bannerUrl: 'https://images.unsplash.com/photo-1534158914592-062992fbe900?q=80&w=1200&auto=format&fit=crop',
        isRanked: true,
      })
      .returning();

    await db.insert(schema.tournamentDivisions).values({
      tournamentId: t1.id,
      name: 'Đơn Nam Chuyên Nghiệp Bóng Bàn',
      matchType: 'SINGLES',
      genderRestriction: 'MALE',
      entryFee: '150000.00',
      maxParticipants: 16,
      registrationEndDate: regEnd,
    });
    console.log(`✅ Đã tạo Giải Bóng bàn 1: "${t1.name}" (ID: ${t1.id}) - status: REGISTRATION_OPEN, hideFeaturedCardText: true`);
    seededTournamentIds.push(t1.id);

    // Giải Bóng Bàn 2 (IN_PROGRESS)
    const [t2] = await db
      .insert(schema.tournaments)
      .values({
        name: '⚡ Table Tennis Super League 2026 (Banner Ẩn Chữ 4)',
        description: 'Giải đấu Bóng bàn chuyên nghiệp thử nghiệm tính năng Ẩn Chữ Đè Trên Banner số 4.',
        categoryId: tableTennisCatId,
        createdBy: adminUser.id,
        tournamentType: 'PUBLIC',
        visibility: 'PUBLIC',
        status: 'IN_PROGRESS',
        sportRules: { setsToWin: 3, pointsPerSet: 11 },
        tournamentConfig: { hideFeaturedCardText: true },
        entryFee: '200000.00',
        maxParticipants: 32,
        registrationStartDate: regStart,
        registrationEndDate: regEnd,
        startDate: startDate,
        endDate: endDate,
        bannerUrl: 'https://images.unsplash.com/photo-1609710228159-0fa9bd7c0827?q=80&w=1200&auto=format&fit=crop',
        isRanked: true,
      })
      .returning();

    await db.insert(schema.tournamentDivisions).values({
      tournamentId: t2.id,
      name: 'Đôi Nam Nữ Bóng Bàn',
      matchType: 'MIXED_DOUBLES',
      genderRestriction: 'MIXED',
      entryFee: '200000.00',
      maxParticipants: 32,
      registrationEndDate: regEnd,
    });
    console.log(`✅ Đã tạo Giải Bóng bàn 2: "${t2.name}" (ID: ${t2.id}) - status: IN_PROGRESS, hideFeaturedCardText: true`);
    seededTournamentIds.push(t2.id);
  }

  const verificationRows = await db
    .select({ id: schema.tournaments.id, name: schema.tournaments.name, tournamentConfig: schema.tournaments.tournamentConfig })
    .from(schema.tournaments)
    .where(or(...seededTournamentIds.map((id) => eq(schema.tournaments.id, id))));

  const invalidRows = verificationRows.filter((row) => {
    const config = row.tournamentConfig;
    return !(typeof config === 'object' && config !== null && !Array.isArray(config) &&
      (config as Record<string, unknown>).hideFeaturedCardText === true);
  });
  if (verificationRows.length !== seededTournamentIds.length || invalidRows.length > 0) {
    throw new Error(`Seed verification failed: ${verificationRows.length}/${seededTournamentIds.length} rows contain hideFeaturedCardText=true`);
  }
  console.log(`✅ Verified ${verificationRows.length} tournament records with hideFeaturedCardText=true`);

  // Invalidate Redis cache
  try {
    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
    const redisPass = process.env.REDIS_PASSWORD || undefined;
    const redis = new Redis({ host: redisHost, port: redisPort, password: redisPass });
    await redis.flushall();
    console.log('\n🧹 Đã xóa sạch Redis cache thành công!');
    await redis.quit();
  } catch (err) {
    console.warn('Lỗi khi xóa Redis cache trong seed (bỏ qua):', err);
  }

  console.log('\n=== TẠO SEED CÁC GIẢI BANNER ẨN CHỮ CHUẨN THÀNH CÔNG ===');
  await sqlClient.end();
}

main().catch(async (e) => {
  console.error('Lỗi khi chạy seed hide-banner:', e);
  await sqlClient.end();
  process.exit(1);
});
