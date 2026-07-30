import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../schema';
import { createPostgresClientFromEnv } from '../postgres-client';
import { ilike } from 'drizzle-orm';

const sqlClient = createPostgresClientFromEnv({ ssl: undefined });
const db = drizzle(sqlClient, { schema });

async function main() {
  console.log('=== ĐANG CẬP NHẬT 2 GIẢI ĐẤU SEED TRẠNG THÁI REGISTRATION_OPEN & IN_PROGRESS ===\n');

  let [adminUser] = await db.select().from(schema.users).limit(1);
  if (!adminUser) {
    console.error('Không tìm thấy user admin để tạo giải!');
    process.exit(1);
  }

  let [pickleballCategory] = await db
    .select()
    .from(schema.categories)
    .where(ilike(schema.categories.slug, '%pickleball%'))
    .limit(1);

  const catId = pickleballCategory?.id;
  if (!catId) {
    console.error('Không tìm thấy category pickleball!');
    process.exit(1);
  }

  const now = new Date();
  const startDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
  const endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const regStart = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
  const regEnd = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

  // Chỉ xóa các giải seed cũ có tên chứa 'Banner Ẩn Chữ' để tránh đụng chạm giải khác
  await db
    .delete(schema.tournaments)
    .where(ilike(schema.tournaments.name, '%Banner Ẩn Chữ%'));

  // Tournament 1: Ẩn chữ đè Banner (REGISTRATION_OPEN)
  const [t1] = await db
    .insert(schema.tournaments)
    .values({
      name: '🏆 VNSPORT Master Cup (Banner Ẩn Chữ 1)',
      description: 'Giải đấu thử nghiệm tính năng Ẩn Chữ Đè Trên Banner.',
      categoryId: catId,
      createdBy: adminUser.id,
      tournamentType: 'PUBLIC',
      visibility: 'PUBLIC',
      status: 'REGISTRATION_OPEN',
      sportRules: { setsToWin: 2, pointsPerSet: 11 },
      tournamentConfig: { hideFeaturedCardText: true },
      entryFee: '150000.00',
      maxParticipants: 16,
      registrationStartDate: regStart,
      registrationEndDate: regEnd,
      startDate: startDate,
      endDate: endDate,
      bannerUrl: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?q=80&w=1200&auto=format&fit=crop',
      isRanked: true,
    })
    .returning();

  // Tạo division cho Giải 1
  await db.insert(schema.tournamentDivisions).values({
    tournamentId: t1.id,
    name: 'Đôi Nam Nữ Mở Rộng',
    matchType: 'MIXED_DOUBLES',
    genderRestriction: 'MIXED',
    entryFee: '150000.00',
    maxParticipants: 16,
    registrationStartDate: regStart,
    registrationEndDate: regEnd,
  });

  console.log(`✅ Đã tạo Giải đấu 1: "${t1.name}" (ID: ${t1.id}) - status: REGISTRATION_OPEN, hideFeaturedCardText: true`);

  // Tournament 2: Ẩn chữ đè Banner (IN_PROGRESS)
  const [t2] = await db
    .insert(schema.tournaments)
    .values({
      name: '⚡ Pickleball Super League 2026 (Banner Ẩn Chữ 2)',
      description: 'Giải đấu thử nghiệm tính năng Ẩn Chữ Đè Trên Banner số 2.',
      categoryId: catId,
      createdBy: adminUser.id,
      tournamentType: 'PUBLIC',
      visibility: 'PUBLIC',
      status: 'IN_PROGRESS',
      sportRules: { setsToWin: 2, pointsPerSet: 11 },
      tournamentConfig: { hideFeaturedCardText: true },
      entryFee: '200000.00',
      maxParticipants: 32,
      registrationStartDate: regStart,
      registrationEndDate: regEnd,
      startDate: startDate,
      endDate: endDate,
      bannerUrl: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?q=80&w=1200&auto=format&fit=crop',
      isRanked: true,
    })
    .returning();

  // Tạo division cho Giải 2
  await db.insert(schema.tournamentDivisions).values({
    tournamentId: t2.id,
    name: 'Đơn Nam Chuyên Nghiệp',
    matchType: 'SINGLES',
    genderRestriction: 'MALE',
    entryFee: '200000.00',
    maxParticipants: 32,
    registrationStartDate: regStart,
    registrationEndDate: regEnd,
  });

  console.log(`✅ Đã tạo Giải đấu 2: "${t2.name}" (ID: ${t2.id}) - status: IN_PROGRESS, hideFeaturedCardText: true`);

  console.log('\n=== TẠO SEED 2 GIẢI CHUẨN THÀNH CÔNG ===');
  await sqlClient.end();
}

main().catch(async (e) => {
  console.error('Lỗi khi chạy seed hide-banner:', e);
  await sqlClient.end();
  process.exit(1);
});
