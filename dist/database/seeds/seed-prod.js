"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const postgres_js_1 = require("drizzle-orm/postgres-js");
const schema = __importStar(require("../schema"));
const drizzle_orm_1 = require("drizzle-orm");
const postgres_client_1 = require("../postgres-client");
const sql = (0, postgres_client_1.createPostgresClientFromEnv)({
    ssl: undefined,
});
const db = (0, postgres_js_1.drizzle)(sql, { schema });
async function main() {
    console.log('=== KHỞI CHẠY SEED PRODUCTION DATABASE ===\n');
    console.log('1. Đang khởi tạo các vai trò (Roles)...');
    const rolesList = [
        { name: 'ADMIN', slug: 'admin', description: 'Quản trị viên tối cao hệ thống' },
        { name: 'ORGANIZER', slug: 'organizer', description: 'Ban tổ chức giải đấu' },
        { name: 'REFEREE', slug: 'referee', description: 'Trọng tài điều hành trận đấu' },
        { name: 'MODERATOR', slug: 'moderator', description: 'Điều hành viên hệ thống' },
        { name: 'PLAYER', slug: 'player', description: 'Người chơi / Vận động viên' }
    ];
    const roleMap = new Map();
    for (const r of rolesList) {
        let [existing] = await db.select().from(schema.roles).where((0, drizzle_orm_1.eq)(schema.roles.slug, r.slug)).limit(1);
        if (!existing) {
            [existing] = await db.insert(schema.roles).values(r).returning();
            console.log(`   ➜ Đã tạo role: ${r.name}`);
        }
        else {
            console.log(`   ➜ Role đã tồn tại: ${r.name}`);
        }
        roleMap.set(r.slug, existing.id);
    }
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
    const categoryMap = new Map();
    for (const c of categoriesList) {
        let [existing] = await db.select().from(schema.categories).where((0, drizzle_orm_1.eq)(schema.categories.slug, c.slug)).limit(1);
        if (!existing) {
            [existing] = await db.insert(schema.categories).values(c).returning();
            console.log(`   ➜ Đã tạo danh mục môn: ${c.name}`);
        }
        else {
            [existing] = await db.update(schema.categories).set({ categoryConfig: c.categoryConfig }).where((0, drizzle_orm_1.eq)(schema.categories.id, existing.id)).returning();
            console.log(`   ➜ Cập nhật danh mục môn: ${c.name}`);
        }
        categoryMap.set(c.slug, existing.id);
    }
    console.log('\n3. Đang khởi tạo các phân hạng ELO Tiers (Tier S -> Low Tier D)...');
    for (const [slug, categoryId] of categoryMap.entries()) {
        const existingTiers = await db.select().from(schema.eloTiers).where((0, drizzle_orm_1.eq)(schema.eloTiers.categoryId, categoryId));
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
        }
        else {
            console.log(`   ➜ ELO Tiers môn ${slug} đã tồn tại`);
        }
    }
    console.log('\n4. Đang tải và khởi tạo dữ liệu hành chính Việt Nam v2 (Provinces/Wards)...');
    try {
        const res = await fetch('https://provinces.open-api.vn/api/v2/p/');
        const provincesList = (await res.json());
        const provincesToInsert = [];
        const wardsToInsert = [];
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
                    const detailData = (await detailRes.json());
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
                            });
                        }
                    }
                }
            }
            catch (err) {
                console.warn(`   ⚠️ Không thể lấy xã/phường của tỉnh ${p.name}:`, err);
            }
        }
        console.log('   🧹 Đang làm sạch dữ liệu đơn vị hành chính cũ v1 (Quận/Huyện)...');
        try {
            await db.execute((0, drizzle_orm_1.sql) `UPDATE "communities" SET "district_code" = NULL WHERE "district_code" IS NOT NULL`);
            await db.execute((0, drizzle_orm_1.sql) `DELETE FROM "wards" WHERE "district_code" IS NOT NULL`);
            await db.execute((0, drizzle_orm_1.sql) `DELETE FROM "districts"`);
            console.log('   ✅ Đã xóa sạch dữ liệu Quận/Huyện cũ thành công.');
        }
        catch (cleanErr) {
            console.warn('   ⚠️ Ghi chú làm sạch dữ liệu cũ:', cleanErr);
        }
        async function upsertProvinces(data, chunkSize = 100) {
            for (let i = 0; i < data.length; i += chunkSize) {
                const chunk = data.slice(i, i + chunkSize);
                await db
                    .insert(schema.provinces)
                    .values(chunk)
                    .onConflictDoUpdate({
                    target: schema.provinces.code,
                    set: {
                        name: (0, drizzle_orm_1.sql) `EXCLUDED.name`,
                        nameEn: (0, drizzle_orm_1.sql) `EXCLUDED.name_en`,
                        fullName: (0, drizzle_orm_1.sql) `EXCLUDED.full_name`,
                        fullNameEn: (0, drizzle_orm_1.sql) `EXCLUDED.full_name_en`,
                        codeName: (0, drizzle_orm_1.sql) `EXCLUDED.code_name`,
                    },
                });
            }
        }
        async function upsertWards(data, chunkSize = 300) {
            for (let i = 0; i < data.length; i += chunkSize) {
                const chunk = data.slice(i, i + chunkSize);
                await db
                    .insert(schema.wards)
                    .values(chunk)
                    .onConflictDoUpdate({
                    target: schema.wards.code,
                    set: {
                        name: (0, drizzle_orm_1.sql) `EXCLUDED.name`,
                        nameEn: (0, drizzle_orm_1.sql) `EXCLUDED.name_en`,
                        fullName: (0, drizzle_orm_1.sql) `EXCLUDED.full_name`,
                        fullNameEn: (0, drizzle_orm_1.sql) `EXCLUDED.full_name_en`,
                        codeName: (0, drizzle_orm_1.sql) `EXCLUDED.code_name`,
                        provinceCode: (0, drizzle_orm_1.sql) `EXCLUDED.province_code`,
                    },
                });
            }
        }
        console.log(`   ➜ Đang lưu/cập nhật ${provincesToInsert.length} Tỉnh/Thành phố...`);
        await upsertProvinces(provincesToInsert, 100);
        console.log(`   ➜ Đang lưu/cập nhật ${wardsToInsert.length} Phường/Xã...`);
        await upsertWards(wardsToInsert, 300);
        console.log('   ➜ Đã hoàn tất nạp địa giới hành chính Việt Nam v2 (Tỉnh -> Phường/Xã).');
    }
    catch (error) {
        console.error('   ❌ Lỗi khi tải dữ liệu địa giới từ API v2:', error);
    }
    console.log('\n5. Đang gán quyền ADMIN cho tài khoản quản trị hệ thống...');
    const adminOAuthEmails = ['macter.970@gmail.com', 'hxlinh1683@gmail.com'];
    const adminRoleId = roleMap.get('admin');
    const organizerRoleId = roleMap.get('organizer');
    for (const email of adminOAuthEmails) {
        let [user] = await db.select().from(schema.users).where((0, drizzle_orm_1.eq)(schema.users.email, email)).limit(1);
        if (!user) {
            [user] = await db.insert(schema.users).values({
                email: email,
                isEmailVerified: true,
            }).returning();
            console.log(`   ➜ Đã tạo sẵn tài khoản cho OAuth2: ${email}`);
        }
        if (adminRoleId) {
            const [existingAdminRole] = await db.select().from(schema.userToRoles)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.userToRoles.userId, user.id), (0, drizzle_orm_1.eq)(schema.userToRoles.roleId, adminRoleId))).limit(1);
            if (!existingAdminRole) {
                await db.insert(schema.userToRoles).values({ userId: user.id, roleId: adminRoleId }).onConflictDoNothing();
                console.log(`   ➜ Đã gán ADMIN cho: ${email}`);
            }
            else {
                console.log(`   ➜ ${email} đã có quyền ADMIN.`);
            }
        }
        if (organizerRoleId) {
            await db.insert(schema.userToRoles).values({ userId: user.id, roleId: organizerRoleId }).onConflictDoNothing();
        }
        const [profile] = await db.select().from(schema.profiles).where((0, drizzle_orm_1.eq)(schema.profiles.userId, user.id)).limit(1);
        if (!profile) {
            await db.insert(schema.profiles).values({
                userId: user.id,
                fullName: email.split('@')[0],
            });
            console.log(`   ➜ Đã khởi tạo Profile mặc định cho: ${email}`);
        }
    }
    const [defaultAdmin] = await db.select().from(schema.users).where((0, drizzle_orm_1.eq)(schema.users.email, 'macter.970@gmail.com')).limit(1);
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
        const [existing] = await db.select().from(schema.systemConfigs).where((0, drizzle_orm_1.eq)(schema.systemConfigs.key, config.key)).limit(1);
        if (!existing) {
            await db.insert(schema.systemConfigs).values({
                key: config.key,
                value: config.value,
                description: config.description,
                updatedBy: defaultAdmin?.id
            });
            console.log(`   ➜ Đã tạo cấu hình: ${config.key} = ${config.value}`);
        }
        else {
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
//# sourceMappingURL=seed-prod.js.map