import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../schema';
import { createPostgresClientFromEnv } from '../postgres-client';
import { ilike, or } from 'drizzle-orm';
import Redis from 'ioredis';

const sqlClient = createPostgresClientFromEnv({ ssl: undefined });
const db = drizzle(sqlClient, { schema });

async function main() {
  console.log('=== ĐANG CẬP NHẬT 2 GIẢI ĐẤU SEED MÔN BÓNG BÀN (BÁN NỔI BẬT & BANNER ẨN CHỮ) ===\n');

  let [adminUser] = await db.select().from(schema.users).limit(1);
  if (!adminUser) {
    console.error('Không tìm thấy user admin để tạo giải!');
    process.exit(1);
  }

  // Lấy danh mục môn Bóng bàn (Table Tennis)
  let [tableTennisCat] = await db
    .select()
    .from(schema.categories)
    .where(
      or(
        ilike(schema.categories.slug, '%table%'),
        ilike(schema.categories.slug, '%table-tennis%'),
        ilike(schema.categories.name, '%bóng bàn%'),
        ilike(schema.categories.name, '%table tennis%')
      )
    )
    .limit(1);

  if (!tableTennisCat) {
    [tableTennisCat] = await db.select().from(schema.categories).limit(1);
  }

  const catId = tableTennisCat?.id;
  if (!catId) {
    console.error('Không tìm thấy danh mục thể thao nào!');
    process.exit(1);
  }

  console.log(`📌 Sử dụng danh mục: "${tableTennisCat.name}" (ID: ${catId})`);

  const now = new Date();
  const startDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
  const endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const regStart = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
  const regEnd = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

  // Chỉ xóa các giải seed cũ có tên chứa 'Banner Ẩn Chữ' để tránh đụng chạm giải khác
  await db
    .delete(schema.tournaments)
    .where(ilike(schema.tournaments.name, '%Banner Ẩn Chữ%'));

  // Tournament 1: Bóng bàn - Ẩn chữ đè Banner (REGISTRATION_OPEN)
  const [t1] = await db
    .insert(schema.tournaments)
    .values({
      name: '🏓 VNSPORT Table Tennis Open (Banner Ẩn Chữ 1)',
      description: 'Giải đấu Bóng bàn mở rộng thử nghiệm tính năng Ẩn Chữ Đè Trên Banner.',
      categoryId: catId,
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

  // Tạo division cho Giải 1
  await db.insert(schema.tournamentDivisions).values({
    tournamentId: t1.id,
    name: 'Đơn Nam Chuyên Nghiệp Bóng Bàn',
    matchType: 'SINGLES',
    genderRestriction: 'MALE',
    entryFee: '150000.00',
    maxParticipants: 16,
    registrationStartDate: regStart,
    registrationEndDate: regEnd,
  });

  console.log(`✅ Đã tạo Giải đấu Bóng bàn 1: "${t1.name}" (ID: ${t1.id}) - status: REGISTRATION_OPEN, hideFeaturedCardText: true`);

  // Tournament 2: Bóng bàn - Ẩn chữ đè Banner (IN_PROGRESS)
  const [t2] = await db
    .insert(schema.tournaments)
    .values({
      name: '⚡ Table Tennis Super League 2026 (Banner Ẩn Chữ 2)',
      description: 'Giải đấu Bóng bàn chuyên nghiệp thử nghiệm tính năng Ẩn Chữ Đè Trên Banner số 2.',
      categoryId: catId,
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

  // Tạo division cho Giải 2
  await db.insert(schema.tournamentDivisions).values({
    tournamentId: t2.id,
    name: 'Đôi Nam Nữ Bóng Bàn',
    matchType: 'MIXED_DOUBLES',
    genderRestriction: 'MIXED',
    entryFee: '200000.00',
    maxParticipants: 32,
    registrationStartDate: regStart,
    registrationEndDate: regEnd,
  });

  console.log(`✅ Đã tạo Giải đấu Bóng bàn 2: "${t2.name}" (ID: ${t2.id}) - status: IN_PROGRESS, hideFeaturedCardText: true`);

  // Invalidate Redis cache
  try {
    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
    const redisPass = process.env.REDIS_PASSWORD || undefined;
    const redis = new Redis({ host: redisHost, port: redisPort, password: redisPass });
    await redis.flushall();
    console.log('🧹 Đã xóa sạch Redis cache thành công!');
    await redis.quit();
  } catch (err) {
    console.warn('Lỗi khi xóa Redis cache trong seed (bỏ qua):', err);
  }

  console.log('\n=== TẠO SEED 2 GIẢI BÓNG BÀN CHUẨN THÀNH CÔNG ===');
  await sqlClient.end();
}

main().catch(async (e) => {
  console.error('Lỗi khi chạy seed hide-banner bóng bàn:', e);
  await sqlClient.end();
  process.exit(1);
});
