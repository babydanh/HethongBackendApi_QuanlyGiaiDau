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
const sqlClient = (0, postgres_client_1.createPostgresClientFromEnv)({ ssl: undefined });
const db = (0, postgres_js_1.drizzle)(sqlClient, { schema });
async function deleteRoundRobinTournaments() {
    console.log('🔄 Bắt đầu tìm kiếm các giải đấu Round Robin để xóa...');
    const allTournaments = await db.select().from(schema.tournaments);
    const rrTournaments = allTournaments.filter(t => {
        const config = t.tournamentConfig;
        return config && config.bracketType === 'round_robin';
    });
    if (rrTournaments.length === 0) {
        console.log('✅ Không tìm thấy giải đấu Round Robin nào cũ cần xóa.');
        await sqlClient.end();
        return;
    }
    const rrIds = rrTournaments.map(t => t.id);
    console.log(`🔍 Tìm thấy ${rrIds.length} giải đấu Round Robin cũ cần xóa:`);
    rrTournaments.forEach(t => console.log(`  - [${t.id}] ${t.name}`));
    console.log('🗑️ Đang xóa dữ liệu liên quan từ các trận đấu...');
    const matches = await db.select()
        .from(schema.matches)
        .where((0, drizzle_orm_1.inArray)(schema.matches.tournamentId, rrIds));
    if (matches.length > 0) {
        const matchIds = matches.map(m => m.id);
        await db.delete(schema.matchDisputes)
            .where((0, drizzle_orm_1.inArray)(schema.matchDisputes.matchId, matchIds));
        await db.delete(schema.matchPlayers)
            .where((0, drizzle_orm_1.inArray)(schema.matchPlayers.matchId, matchIds));
        await db.delete(schema.matches)
            .where((0, drizzle_orm_1.inArray)(schema.matches.tournamentId, rrIds));
        console.log(`  - Đã xóa ${matches.length} trận đấu.`);
    }
    const participants = await db.select()
        .from(schema.tournamentParticipants)
        .where((0, drizzle_orm_1.inArray)(schema.tournamentParticipants.tournamentId, rrIds));
    if (participants.length > 0) {
        const participantIds = participants.map(p => p.id);
        await db.delete(schema.tournamentRosters)
            .where((0, drizzle_orm_1.inArray)(schema.tournamentRosters.participantId, participantIds));
        await db.delete(schema.groupStandings)
            .where((0, drizzle_orm_1.inArray)(schema.groupStandings.participantId, participantIds));
    }
    await db.delete(schema.tournamentParticipants)
        .where((0, drizzle_orm_1.inArray)(schema.tournamentParticipants.tournamentId, rrIds));
    console.log('  - Đã xóa thông tin người tham gia giải đấu (Participants & Rosters).');
    await db.delete(schema.tournamentFollows)
        .where((0, drizzle_orm_1.inArray)(schema.tournamentFollows.tournamentId, rrIds));
    await db.delete(schema.tournamentStaff)
        .where((0, drizzle_orm_1.inArray)(schema.tournamentStaff.tournamentId, rrIds));
    await db.delete(schema.tournamentReferees)
        .where((0, drizzle_orm_1.inArray)(schema.tournamentReferees.tournamentId, rrIds));
    const stages = await db.select()
        .from(schema.tournamentStages)
        .where((0, drizzle_orm_1.inArray)(schema.tournamentStages.tournamentId, rrIds));
    if (stages.length > 0) {
        const stageIds = stages.map(s => s.id);
        await db.delete(schema.tournamentGroups)
            .where((0, drizzle_orm_1.inArray)(schema.tournamentGroups.stageId, stageIds));
    }
    await db.delete(schema.tournamentStages)
        .where((0, drizzle_orm_1.inArray)(schema.tournamentStages.tournamentId, rrIds));
    console.log('  - Đã xóa các vòng đấu (Stages) và Bảng đấu (Groups).');
    await db.delete(schema.tournamentDivisions)
        .where((0, drizzle_orm_1.inArray)(schema.tournamentDivisions.tournamentId, rrIds));
    console.log('  - Đã xóa các phân hạng (Divisions) giải đấu.');
    await db.delete(schema.tournaments)
        .where((0, drizzle_orm_1.inArray)(schema.tournaments.id, rrIds));
    console.log(`🎉 Đã xóa hoàn toàn thành công ${rrIds.length} giải đấu Round Robin cũ!`);
    await sqlClient.end();
}
deleteRoundRobinTournaments().catch(err => {
    console.error('❌ Lỗi khi thực hiện xóa giải đấu:', err);
    sqlClient.end();
});
//# sourceMappingURL=delete-old-rr.js.map