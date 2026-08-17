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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const postgres_js_1 = require("drizzle-orm/postgres-js");
const schema = __importStar(require("../schema"));
const postgres_client_1 = require("../postgres-client");
const drizzle_orm_1 = require("drizzle-orm");
const ioredis_1 = __importDefault(require("ioredis"));
const sqlClient = (0, postgres_client_1.createPostgresClientFromEnv)({ ssl: undefined });
const db = (0, postgres_js_1.drizzle)(sqlClient, { schema });
async function main() {
    console.log('=== ĐANG TẠO SEED GIẢI ĐẤU (BÓNG BÀN & CẦU LÔNG - BANNER ẨN CHỮ) ===\n');
    let [adminUser] = await db.select().from(schema.users).limit(1);
    if (!adminUser) {
        console.error('Không tìm thấy user admin để tạo giải!');
        process.exit(1);
    }
    const allCategories = await db.select().from(schema.categories);
    const badmintonCat = allCategories.find((c) => c.slug.toLowerCase().includes('badminton') ||
        c.slug.toLowerCase().includes('cau-long') ||
        c.name.toLowerCase().includes('cầu lông'));
    const tableTennisCat = allCategories.find((c) => c.slug.toLowerCase().includes('table') ||
        c.slug.toLowerCase().includes('bong-ban') ||
        c.name.toLowerCase().includes('bóng bàn'));
    const badmintonCatId = badmintonCat?.id;
    const tableTennisCatId = tableTennisCat?.id;
    if (!badmintonCatId || !tableTennisCatId) {
        throw new Error(`Không tìm thấy category cần seed: badminton=${badmintonCatId ?? 'missing'}, tableTennis=${tableTennisCatId ?? 'missing'}`);
    }
    const seededTournamentIds = [];
    const existingTournaments = [];
    console.log(`📌 Danh mục Cầu lông: "${badmintonCat?.name || 'N/A'}" (ID: ${badmintonCatId})`);
    console.log(`📌 Danh mục Bóng bàn: "${tableTennisCat?.name || 'N/A'}" (ID: ${tableTennisCatId})\n`);
    const now = new Date();
    const startDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    const endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const regStart = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    const regEnd = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
    await db
        .delete(schema.tournaments)
        .where((0, drizzle_orm_1.ilike)(schema.tournaments.name, '%Banner Ẩn Chữ%'));
    console.log(`✅ Đã cập nhật ${existingTournaments.length} giải đấu hiện có -> hideFeaturedCardText: true`);
    if (badmintonCatId) {
        const [b1] = await db
            .insert(schema.tournaments)
            .values({
            name: '🏸 Sporto Badminton Championship (Banner Ẩn Chữ 1)',
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
    if (tableTennisCatId) {
        const [t1] = await db
            .insert(schema.tournaments)
            .values({
            name: '🏓 Sporto Table Tennis Open (Banner Ẩn Chữ 3)',
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
        .where((0, drizzle_orm_1.or)(...seededTournamentIds.map((id) => (0, drizzle_orm_1.eq)(schema.tournaments.id, id))));
    const invalidRows = verificationRows.filter((row) => {
        const config = row.tournamentConfig;
        return !(typeof config === 'object' && config !== null && !Array.isArray(config) &&
            config.hideFeaturedCardText === true);
    });
    if (verificationRows.length !== seededTournamentIds.length || invalidRows.length > 0) {
        throw new Error(`Seed verification failed: ${verificationRows.length}/${seededTournamentIds.length} rows contain hideFeaturedCardText=true`);
    }
    console.log(`✅ Verified ${verificationRows.length} tournament records with hideFeaturedCardText=true`);
    try {
        const redisHost = process.env.REDIS_HOST || 'localhost';
        const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
        const redisPass = process.env.REDIS_PASSWORD || undefined;
        const redis = new ioredis_1.default({ host: redisHost, port: redisPort, password: redisPass });
        await redis.flushall();
        console.log('\n🧹 Đã xóa sạch Redis cache thành công!');
        await redis.quit();
    }
    catch (err) {
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
//# sourceMappingURL=seed-hide-banner-tournaments.js.map