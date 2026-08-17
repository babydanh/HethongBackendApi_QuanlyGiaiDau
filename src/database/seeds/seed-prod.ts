import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../schema';
import { eq, and, sql as dsql } from 'drizzle-orm';
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
    },
    {
      name: 'Bóng đá',
      slug: 'football',
      description: 'Môn thể thao vua bóng đá 11 người / 7 người / 5 người',
      categoryConfig: {
        ruleKind: 'FOOTBALL',
        allowedRuleKinds: ['FOOTBALL'],
        defaultSportRules: {
          // Thống nhất với categories.seed.ts: có key scoring để resolve không về BADMINTON.
          setsToWin: 1,
          pointsPerSet: 1,
          mustWinByTwo: false,
          maxPointsPerSet: 99,
          switchSidesBetweenSets: true,
          winPoints: 3,
          drawPoints: 1,
          lossPoints: 0,
          halfDurationMinutes: 45,
          extraTimeHalfMinutes: 15,
          penaltyShootout: true,
        },
        supportedMatchTypes: ['SINGLES', 'DOUBLES'],
        description: 'Môn thể thao vua bóng đá',
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
  console.log('\n3. Đang khởi tạo các phân hạng ELO Tiers (Tier S -> Low Tier D)...');
  for (const [slug, categoryId] of categoryMap.entries()) {
    const existingTiers = await db.select().from(schema.eloTiers).where(eq(schema.eloTiers.categoryId, categoryId));
    if (existingTiers.length === 0) {
      await db.insert(schema.eloTiers).values([
        { categoryId, name: 'Tier S', minElo: 1800, maxElo: 9999 },
        { categoryId, name: 'High Tier A', minElo: 1700, maxElo: 1799 },
        { categoryId, name: 'Low Tier A', minElo: 1600, maxElo: 1699 },
        { categoryId, name: 'High Tier B', minElo: 1500, maxElo: 1599 },
        { categoryId, name: 'Low Tier B', minElo: 1400, maxElo: 1499 },
        { categoryId, name: 'High Tier C', minElo: 1300, maxElo: 1399 },
        { categoryId, name: 'Low Tier C', minElo: 1200, maxElo: 1299 },
        { categoryId, name: 'High Tier D', minElo: 1100, maxElo: 1199 },
        { categoryId, name: 'Low Tier D', minElo: 0, maxElo: 1099 }
      ]);
      console.log(`   ➜ Đã tạo ELO Tiers cho môn: ${slug}`);
    } else {
      console.log(`   ➜ ELO Tiers môn ${slug} đã tồn tại`);
    }
  }

  // 4. Setup Tỉnh/Thành phố/Phường/Xã Việt Nam từ Open API v2 (2 cấp)
  console.log('\n4. Đang tải và khởi tạo dữ liệu hành chính Việt Nam v2 (Provinces/Wards)...');
  try {
    const res = await fetch('https://provinces.open-api.vn/api/v2/p/');
    const provincesList: any = await res.json();
    
    const provincesToInsert: any[] = [];
    const wardsToInsert: any[] = [];
    
    for (const p of provincesList) {
      provincesToInsert.push({
        code: String(p.code),
        name: p.name,
        nameEn: p.name_en || null,
        fullName: p.name,
        fullNameEn: p.name_en || null,
        codeName: p.codename,
      });

      try {
        const detailRes = await fetch(`https://provinces.open-api.vn/api/v2/p/${p.code}?depth=2`);
        if (detailRes.ok) {
          const detailData: any = await detailRes.json();
          if (detailData.wards && Array.isArray(detailData.wards)) {
            for (const w of detailData.wards) {
              wardsToInsert.push({
                code: String(w.code),
                name: w.name,
                nameEn: w.name_en || null,
                fullName: w.name,
                fullNameEn: w.name_en || null,
                codeName: w.codename,
                provinceCode: String(p.code),
                districtCode: null,
              });
            }
          }
        }
      } catch (err) {
        console.warn(`   ⚠️ Không thể lấy xã/phường của tỉnh ${p.name}:`, err);
      }
    }

    // Tiện ích bulk upsert theo chunk
    async function upsertInChunks(table: any, data: any[], targetCol: any, updateSet: any, chunkSize = 200) {
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        await db
          .insert(table)
          .values(chunk)
          .onConflictDoUpdate({
            target: targetCol,
            set: updateSet,
          });
      }
    }

    console.log(`   ➜ Đang lưu/cập nhật ${provincesToInsert.length} Tỉnh/Thành phố...`);
    await upsertInChunks(
      schema.provinces,
      provincesToInsert,
      schema.provinces.code,
      {
        name: dsql`EXCLUDED.name`,
        nameEn: dsql`EXCLUDED.name_en`,
        fullName: dsql`EXCLUDED.full_name`,
        fullNameEn: dsql`EXCLUDED.full_name_en`,
        codeName: dsql`EXCLUDED.code_name`,
      },
      100,
    );

    console.log(`   ➜ Đang lưu/cập nhật ${wardsToInsert.length} Phường/Xã...`);
    await upsertInChunks(
      schema.wards,
      wardsToInsert,
      schema.wards.code,
      {
        name: dsql`EXCLUDED.name`,
        nameEn: dsql`EXCLUDED.name_en`,
        fullName: dsql`EXCLUDED.full_name`,
        fullNameEn: dsql`EXCLUDED.full_name_en`,
        codeName: dsql`EXCLUDED.code_name`,
        provinceCode: dsql`EXCLUDED.province_code`,
      },
      300,
    );

    console.log('   ➜ Đã hoàn tất nạp địa giới hành chính Việt Nam v2 (Tỉnh -> Phường/Xã).');
  } catch (error) {
    console.error('   ❌ Lỗi khi tải dữ liệu địa giới từ API v2:', error);
  }

  // 5. Gán quyền ADMIN cho 2 tài khoản OAuth2 của hệ thống
  console.log('\n5. Đang gán quyền ADMIN cho tài khoản quản trị hệ thống...');
  const adminOAuthEmails = ['macter.970@gmail.com', 'hxlinh1683@gmail.com'];
  const adminRoleId = roleMap.get('admin');
  const organizerRoleId = roleMap.get('organizer');

  for (const email of adminOAuthEmails) {
    let [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
    
    // Nếu chưa tồn tại trong DB, tạo sẵn user
    if (!user) {
      [user] = await db.insert(schema.users).values({
        email: email,
        isEmailVerified: true,
      }).returning();
      console.log(`   ➜ Đã tạo sẵn tài khoản cho OAuth2: ${email}`);
    }

    // Gán ADMIN role
    if (adminRoleId) {
      const [existingAdminRole] = await db.select().from(schema.userToRoles)
        .where(and(eq(schema.userToRoles.userId, user.id), eq(schema.userToRoles.roleId, adminRoleId))).limit(1);
      if (!existingAdminRole) {
        await db.insert(schema.userToRoles).values({ userId: user.id, roleId: adminRoleId }).onConflictDoNothing();
        console.log(`   ➜ Đã gán ADMIN cho: ${email}`);
      } else {
        console.log(`   ➜ ${email} đã có quyền ADMIN.`);
      }
    }

    // Gán ORGANIZER role
    if (organizerRoleId) {
      await db.insert(schema.userToRoles).values({ userId: user.id, roleId: organizerRoleId }).onConflictDoNothing();
    }

    // Tạo sẵn Profile trống để đồng bộ khi login OAuth2
    const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, user.id)).limit(1);
    if (!profile) {
      await db.insert(schema.profiles).values({
        userId: user.id,
        fullName: email.split('@')[0], // Tạm thời lấy phần trước @ làm tên
      });
      console.log(`   ➜ Đã khởi tạo Profile mặc định cho: ${email}`);
    }
  }

  // Lấy ID của một admin làm người cập nhật cho System Configs
  const [defaultAdmin] = await db.select().from(schema.users).where(eq(schema.users.email, 'macter.970@gmail.com')).limit(1);

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
        updatedBy: defaultAdmin?.id // Gán người cập nhật là tài khoản Admin hệ thống
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
