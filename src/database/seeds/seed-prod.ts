import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../schema';
import * as bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { createPostgresClientFromEnv } from '../postgres-client';

const sql = createPostgresClientFromEnv({
  ssl: undefined,
});
const db = drizzle(sql, { schema });

// Sẽ fetch động dữ liệu địa giới hành chính từ provinces.open-api.vn khi chạy seed

async function main() {
  console.log('=== KHỞI CHẠY SEED PRODUCTION DATABASE ===\n');

  // 1. Setup Roles
  console.log('1. Đang khởi tạo các vai trò (Roles)...');
  const rolesList = [
    { name: 'ADMIN', slug: 'admin', description: 'Quản trị viên tối cao hệ thống' },
    { name: 'ORGANIZER', slug: 'organizer', description: 'Ban tổ chức giải đấu' },
    { name: 'REFEREE', slug: 'referee', description: 'Trọng tài điều hành trận đấu' },
    { name: 'MODERATOR', slug: 'moderator', description: 'Điều hành viên hệ thống' },
    { name: 'PLAYER', slug: 'player', description: 'Người chơi / Vận động viên' }
  ];

  const roleMap = new Map<string, string>();
  for (const r of rolesList) {
    let [existing] = await db.select().from(schema.roles).where(eq(schema.roles.slug, r.slug)).limit(1);
    if (!existing) {
      [existing] = await db.insert(schema.roles).values(r).returning();
      console.log(`   ➜ Đã tạo role: ${r.name}`);
    } else {
      console.log(`   ➜ Role đã tồn tại: ${r.name}`);
    }
    roleMap.set(r.slug, existing.id);
  }

  // 2. Setup Categories (Bộ môn thi đấu)
  console.log('\n2. Đang khởi tạo các bộ môn thi đấu (Categories)...');
  const categoriesList = [
    {
      name: 'Pickleball',
      slug: 'pickleball',
      description: 'Môn thể thao dùng vợt, bóng nhựa đục lỗ',
      categoryConfig: {
        ruleKind: 'PICKLEBALL_RALLY',
        allowedRuleKinds: ['PICKLEBALL_RALLY', 'PICKLEBALL_SIDE_OUT'],
        defaultSportRules: {
          setsToWin: 2,
          pointsPerSet: 11,
          mustWinByTwo: true,
          maxPointsPerSet: 15,
          serveSwitchEvery: 1,
          switchSidesBetweenSets: true,
          switchSidesAtTiebreakPoints: 6,
        },
        supportedMatchTypes: ['SINGLES', 'DOUBLES', 'MIXED_DOUBLES'],
        description: 'Môn thể thao dùng vợt, bóng nhựa đục lỗ',
      },
    },
    {
      name: 'Tennis',
      slug: 'tennis',
      description: 'Môn thể thao quần vợt',
      categoryConfig: {
        ruleKind: 'TENNIS',
        allowedRuleKinds: ['TENNIS'],
        defaultSportRules: {
          setsToWin: 2,
          pointsPerSet: 6,
          mustWinByTwo: true,
          maxPointsPerSet: 7,
          tiebreakPoints: 7,
          switchSidesBetweenSets: true,
        },
        supportedMatchTypes: ['SINGLES', 'DOUBLES', 'MIXED_DOUBLES'],
        description: 'Môn thể thao quần vợt',
      },
    },
    {
      name: 'Cầu lông',
      slug: 'badminton',
      description: 'Môn thể thao dùng vợt và quả cầu lông',
      categoryConfig: {
        ruleKind: 'BADMINTON',
        allowedRuleKinds: ['BADMINTON'],
        defaultSportRules: {
          setsToWin: 2,
          pointsPerSet: 21,
          mustWinByTwo: true,
          maxPointsPerSet: 30,
          switchSidesBetweenSets: true,
          switchSidesAtTiebreakPoints: 11,
        },
        supportedMatchTypes: ['SINGLES', 'DOUBLES', 'MIXED_DOUBLES'],
        description: 'Môn thể thao dùng vợt và quả cầu lông',
      },
    },
    {
      name: 'Bóng bàn',
      slug: 'table_tennis',
      description: 'Môn thể thao dùng vợt gỗ và quả bóng bàn nhỏ',
      categoryConfig: {
        ruleKind: 'TABLE_TENNIS',
        allowedRuleKinds: ['TABLE_TENNIS'],
        defaultSportRules: {
          setsToWin: 3,
          pointsPerSet: 11,
          mustWinByTwo: true,
          maxPointsPerSet: 99,
          serveSwitchEvery: 2,
          switchSidesBetweenSets: true,
          switchSidesAtTiebreakPoints: 5,
        },
        supportedMatchTypes: ['SINGLES', 'DOUBLES'],
        description: 'Môn thể thao dùng vợt gỗ và quả bóng bàn nhỏ',
      },
    }
  ];

  const categoryMap = new Map<string, string>();
  for (const c of categoriesList) {
    let [existing] = await db.select().from(schema.categories).where(eq(schema.categories.slug, c.slug)).limit(1);
    if (!existing) {
      [existing] = await db.insert(schema.categories).values(c).returning();
      console.log(`   ➜ Đã tạo danh mục môn: ${c.name}`);
    } else {
      // Cập nhật lại config mới nhất nếu cần
      [existing] = await db.update(schema.categories).set({ categoryConfig: c.categoryConfig }).where(eq(schema.categories.id, existing.id)).returning();
      console.log(`   ➜ Cập nhật danh mục môn: ${c.name}`);
    }
    categoryMap.set(c.slug, existing.id);
  }

  // 3. Setup Elo Tiers mặc định
  console.log('\n3. Đang khởi tạo các phân hạng ELO Tiers (1000 - 1800)...');
  for (const [slug, categoryId] of categoryMap.entries()) {
    const existingTiers = await db.select().from(schema.eloTiers).where(eq(schema.eloTiers.categoryId, categoryId));
    if (existingTiers.length === 0) {
      await db.insert(schema.eloTiers).values([
        { categoryId, name: 'Phong trào (Beginner)', minElo: 0, maxElo: 1200 },
        { categoryId, name: 'Bán chuyên (Intermediate)', minElo: 1200, maxElo: 1600 },
        { categoryId, name: 'Chuyên nghiệp (Advanced)', minElo: 1600, maxElo: 2200 },
        { categoryId, name: 'Siêu cấp (Pro)', minElo: 2200, maxElo: 4000 }
      ]);
      console.log(`   ➜ Đã tạo ELO Tiers cho môn: ${slug}`);
    } else {
      console.log(`   ➜ ELO Tiers môn ${slug} đã tồn tại`);
    }
  }

  // 4. Setup Tỉnh/Thành phố/Quận/Huyện/Xã Việt Nam từ Open API
  console.log('\n4. Đang tải và khởi tạo dữ liệu hành chính Việt Nam (Provinces/Districts/Wards)...');
  try {
    const res = await fetch('https://provinces.open-api.vn/api/?depth=3');
    const provincesData: any = await res.json();
    
    const provincesToInsert: any[] = [];
    const districtsToInsert: any[] = [];
    const wardsToInsert: any[] = [];
    
    for (const p of provincesData) {
      provincesToInsert.push({
        code: String(p.code),
        name: p.name,
        nameEn: p.name_en || null,
        fullName: p.name,
        fullNameEn: p.name_en || null,
        codeName: p.codename,
      });
      
      if (p.districts) {
        for (const d of p.districts) {
          districtsToInsert.push({
            code: String(d.code),
            name: d.name,
            nameEn: d.name_en || null,
            fullName: d.name,
            fullNameEn: d.name_en || null,
            codeName: d.codename,
            provinceCode: String(p.code),
          });
          
          if (d.wards) {
            for (const w of d.wards) {
              wardsToInsert.push({
                code: String(w.code),
                name: w.name,
                nameEn: w.name_en || null,
                fullName: w.name,
                fullNameEn: w.name_en || null,
                codeName: w.codename,
                districtCode: String(d.code),
              });
            }
          }
        }
      }
    }

    // Tiện ích bulk insert theo chunk tránh quá tải query parameter
    async function insertInChunks(table: any, data: any[], chunkSize = 300) {
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        await db.insert(table).values(chunk).onConflictDoNothing();
      }
    }

    console.log(`   ➜ Đang lưu ${provincesToInsert.length} Tỉnh/Thành phố...`);
    await insertInChunks(schema.provinces, provincesToInsert, 100);

    console.log(`   ➜ Đang lưu ${districtsToInsert.length} Quận/Huyện...`);
    await insertInChunks(schema.districts, districtsToInsert, 300);

    console.log(`   ➜ Đang lưu ${wardsToInsert.length} Phường/Xã...`);
    await insertInChunks(schema.wards, wardsToInsert, 500);

    console.log('   ➜ Đã hoàn tất nạp địa giới hành chính Việt Nam.');
  } catch (error) {
    console.error('   ❌ Lỗi khi tải dữ liệu địa giới từ API:', error);
  }

  // 5. Setup Admin Account
  console.log('\n5. Đang khởi tạo tài khoản quản trị hệ thống (Admin)...');
  // 5. Setup Admin Account
  const adminEmail = 'vndcsport@gmail.com';

  let [adminUser] = await db.select().from(schema.users).where(eq(schema.users.email, adminEmail)).limit(1);
  if (!adminUser) {
    [adminUser] = await db.insert(schema.users).values({
      email: adminEmail,
      isEmailVerified: true
    }).returning();
    console.log(`   ➜ Đã tạo tài khoản Admin cho OAuth Google: ${adminEmail}`);
  } else {
    console.log(`   ➜ Tài khoản Admin đã tồn tại: ${adminEmail}`);
  }

  // Gán quyền ADMIN
  const adminRoleId = roleMap.get('admin');
  if (adminRoleId) {
    const [userRole] = await db.select().from(schema.userToRoles).where(eq(schema.userToRoles.userId, adminUser.id)).limit(1);
    if (!userRole) {
      await db.insert(schema.userToRoles).values({
        userId: adminUser.id,
        roleId: adminRoleId
      });
      console.log('   ➜ Đã gán vai trò quản trị (ADMIN) thành công.');
    }
  }

  // Tạo Profile Admin
  const [adminProfile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, adminUser.id)).limit(1);
  if (!adminProfile) {
    await db.insert(schema.profiles).values({
      userId: adminUser.id,
      fullName: 'Quản trị viên Hệ thống',
      bio: 'Administrator account'
    });
    console.log('   ➜ Đã khởi tạo Profile Admin.');
  }

  // 5. Setup System Configs
  console.log('\n5. Đang khởi tạo cấu hình hệ thống mặc định (System Configs)...');
  const systemConfigsList = [
    { key: 'TOURNAMENT_PUBLISH_FEE_PUBLIC_RANKED', value: '0', description: 'Lệ phí công bố giải đấu công khai có tính điểm xếp hạng ELO (VNĐ)' },
    { key: 'TOURNAMENT_PUBLISH_FEE_PUBLIC_UNRANKED', value: '0', description: 'Lệ phí công bố giải đấu công khai không tính điểm ELO (VNĐ)' },
    { key: 'TOURNAMENT_PUBLISH_FEE_CLUB', value: '0', description: 'Lệ phí công bố giải đấu nội bộ Câu lạc bộ (VNĐ)' },
    { key: 'PLATFORM_FEE_PERCENTAGE_PUBLIC_RANKED', value: '0.00', description: 'Tỷ lệ phí dịch vụ nền tảng thu trên lệ phí đăng ký giải đấu có xếp hạng (%)' },
    { key: 'PLATFORM_FEE_PERCENTAGE_PUBLIC_UNRANKED', value: '0.00', description: 'Tỷ lệ phí dịch vụ nền tảng thu trên lệ phí đăng ký giải đấu không xếp hạng (%)' },
    { key: 'PLATFORM_FEE_PERCENTAGE_CLUB', value: '0.00', description: 'Tỷ lệ phí dịch vụ nền tảng thu trên lệ phí đăng ký giải đấu Câu lạc bộ (%)' },
  ];

  for (const config of systemConfigsList) {
    const [existing] = await db.select().from(schema.systemConfigs).where(eq(schema.systemConfigs.key, config.key)).limit(1);
    if (!existing) {
      await db.insert(schema.systemConfigs).values({
        key: config.key,
        value: config.value,
        description: config.description,
        updatedBy: adminUser.id // Gán người cập nhật là tài khoản Admin hệ thống
      });
      console.log(`   ➜ Đã tạo cấu hình: ${config.key} = ${config.value}`);
    } else {
      console.log(`   ➜ Cấu hình đã tồn tại: ${config.key}`);
    }
  }

  console.log('\n=== HOÀN THÀNH SEED PRODUCTION DATABASE THÀNH CÔNG ===');
  await sql.end();
}

main().catch(async (err) => {
  console.error('Lỗi khi chạy seed database:', err);
  await sql.end();
  process.exit(1);
});
