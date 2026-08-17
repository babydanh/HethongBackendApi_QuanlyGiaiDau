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
const crypto = __importStar(require("crypto"));
const uuidv4 = () => crypto.randomUUID();
const sqlClient = (0, postgres_client_1.createPostgresClientFromEnv)({ ssl: undefined });
const db = (0, postgres_js_1.drizzle)(sqlClient, { schema });
const BASE_URL = 'http://localhost:3000/api/v1';
async function api(path, options) {
    const res = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, body, headers: res.headers };
}
const VIETNAMESE_NAMES = [
    'Nguyễn Văn An', 'Trần Thị Bình', 'Lê Hoàng Cường', 'Phạm Minh Duy',
    'Hoàng Xuân Em', 'Vũ Quốc Phong', 'Ngô Gia Huy', 'Đặng Khánh Linh',
    'Bùi Minh Trí', 'Phan Văn Nam', 'Đỗ Thùy Trang', 'Hồ Đức Hải',
    'Nguyễn Minh Quân', 'Phạm Hồng Đăng', 'Trần Bảo Long', 'Lê Quỳnh Anh',
    'Trịnh Công Sơn', 'Lý Tự Trọng', 'Võ Thị Sáu', 'Phan Bội Châu',
    'Nguyễn Du', 'Hồ Xuân Hương', 'Đoàn Thị Điểm', 'Bà Huyện Thanh Quan',
    'Tô Hiến Thành', 'Trần Hưng Đạo', 'Lý Thường Kiệt', 'Lê Lợi',
    'Nguyễn Trãi', 'Quang Trung', 'Nguyễn Huệ', 'Trần Quốc Toản',
    'Kim Đồng', 'Bùi Thị Xuân', 'Nguyễn Thái Học', 'Võ Nguyên Giáp'
];
function generateBadmintonScore(winner) {
    const isThreeSets = Math.random() > 0.5;
    const sets = [];
    if (winner === 1) {
        if (isThreeSets) {
            sets.push({ team1Score: 21, team2Score: 15, isFinished: true });
            sets.push({ team1Score: 18, team2Score: 21, isFinished: true });
            sets.push({ team1Score: 21, team2Score: 16, isFinished: true });
            return { p1SetsWon: 2, p2SetsWon: 1, scoreDetails: { sets } };
        }
        else {
            sets.push({ team1Score: 21, team2Score: 15, isFinished: true });
            sets.push({ team1Score: 21, team2Score: 17, isFinished: true });
            return { p1SetsWon: 2, p2SetsWon: 0, scoreDetails: { sets } };
        }
    }
    else {
        if (isThreeSets) {
            sets.push({ team1Score: 15, team2Score: 21, isFinished: true });
            sets.push({ team1Score: 21, team2Score: 18, isFinished: true });
            sets.push({ team1Score: 16, team2Score: 21, isFinished: true });
            return { p1SetsWon: 1, p2SetsWon: 2, scoreDetails: { sets } };
        }
        else {
            sets.push({ team1Score: 15, team2Score: 21, isFinished: true });
            sets.push({ team1Score: 17, team2Score: 21, isFinished: true });
            return { p1SetsWon: 0, p2SetsWon: 2, scoreDetails: { sets } };
        }
    }
}
async function playAllMatches(tournamentId, authHeaders) {
    console.log(`[Matches] Đang giả lập đấu trận giải ${tournamentId}...`);
    let hasPlayableMatches = true;
    let iteration = 0;
    while (hasPlayableMatches && iteration < 30) {
        iteration++;
        const res = await api(`/matches?tournamentId=${tournamentId}&limit=500`, { headers: authHeaders });
        const matches = Array.isArray(res.body?.data) ? res.body.data
            : Array.isArray(res.body) ? res.body : [];
        if (matches.length === 0)
            break;
        const playable = matches.filter((m) => m.participant1?.id &&
            m.participant2?.id &&
            m.status !== 'COMPLETED' &&
            !m.isBye);
        console.log(`  -> Lượt ${iteration}: Tổng số ${matches.length} trận đấu, có thể đấu: ${playable.length}`);
        if (playable.length === 0) {
            hasPlayableMatches = false;
            break;
        }
        for (const match of playable) {
            const winnerSide = (parseInt(match.id.substring(0, 2), 16) % 2 === 0) ? 1 : 2;
            const winnerId = winnerSide === 1 ? match.participant1.id : match.participant2.id;
            const score = generateBadmintonScore(winnerSide);
            await api(`/matches/${match.id}/score`, {
                method: 'PATCH',
                headers: authHeaders,
                body: JSON.stringify({
                    p1SetsWon: score.p1SetsWon,
                    p2SetsWon: score.p2SetsWon,
                    winnerId,
                    scoreDetails: score.scoreDetails,
                }),
            });
        }
    }
}
async function createTournament(params) {
    const { name, bracketType, numTeams, venueId, categoryId, organizerId, genderRestriction, roundRobinLegs = 1, groupConfig, playoffType } = params;
    const tourId = uuidv4();
    const inviteCode = `TC-${bracketType.substring(0, 2).toUpperCase()}-${numTeams}-${Date.now().toString().slice(-4)}`;
    const tournamentConfig = {
        bracketType,
        maxTeams: numTeams,
        roundRobinLegs: bracketType === 'round_robin' ? roundRobinLegs : undefined,
    };
    if (groupConfig) {
        tournamentConfig.groupsConfig = {
            numGroups: groupConfig.numGroups,
            teamsPerGroup: groupConfig.teamsPerGroup,
            roundsToPlay: groupConfig.roundsToPlay ?? 1,
        };
        tournamentConfig.advancementConfig = {
            teamsAdvancing: 2,
        };
        tournamentConfig.playoffConfig = {
            type: playoffType || 'SINGLE_ELIMINATION',
        };
    }
    await db.insert(schema.tournaments).values({
        id: tourId,
        name,
        categoryId,
        createdBy: organizerId,
        status: 'IN_PROGRESS',
        matchType: 'SINGLES',
        sportRules: { kind: 'BADMINTON', setsToWin: 2, pointsPerSet: 21, winByTwo: true },
        genderRestriction: genderRestriction ?? null,
        tournamentConfig,
        venueId,
        entryFee: '0',
        tournamentType: 'PUBLIC',
        visibility: 'PUBLIC',
        maxParticipants: numTeams,
        registrationStartDate: new Date(),
        registrationEndDate: new Date(Date.now() + 30 * 86400000),
        startDate: new Date(),
        endDate: new Date(Date.now() + 10 * 86400000),
        inviteCode,
        isRanked: true,
    });
    const divisionId = uuidv4();
    await db.insert(schema.tournamentDivisions).values({
        id: divisionId,
        tournamentId: tourId,
        name,
        matchType: 'SINGLES',
        bracketType,
        status: 'ACTIVE',
        entryFee: '0',
    });
    for (let i = 1; i <= numTeams; i++) {
        const nameIndex = (i - 1) % VIETNAMESE_NAMES.length;
        const nameSuffix = i > VIETNAMESE_NAMES.length ? ` ${Math.ceil(i / VIETNAMESE_NAMES.length)}` : '';
        const teamName = `${VIETNAMESE_NAMES[nameIndex]}${nameSuffix}`;
        await db.insert(schema.tournamentParticipants).values({
            id: uuidv4(),
            tournamentId: tourId,
            tournamentDivisionId: divisionId,
            registeredBy: organizerId,
            teamName,
            teamStatus: 'COMPLETE',
            isMock: true,
            isPaid: true,
            seed: i,
        });
    }
    console.log(`[Tournament] Đã khởi tạo giải đấu: ${name} (${numTeams} người tham gia)`);
    return { tourId, divisionId };
}
async function main() {
    console.log('=== SEEDING TOURNAMENTS WITH VARIOUS FORMATS START ===\n');
    const oldTours = await db.select().from(schema.tournaments).where((0, drizzle_orm_1.sql) `invite_code LIKE 'TC-%'`);
    const oldTourIds = oldTours.map(t => t.id);
    if (oldTourIds.length > 0) {
        console.log('🧹 Đang dọn dẹp các giải đấu test cũ...');
        const stages = await db.select().from(schema.tournamentStages).where((0, drizzle_orm_1.inArray)(schema.tournamentStages.tournamentId, oldTourIds));
        const stageIds = stages.map(s => s.id);
        if (stageIds.length > 0) {
            const groups = await db.select().from(schema.tournamentGroups).where((0, drizzle_orm_1.inArray)(schema.tournamentGroups.stageId, stageIds));
            const groupIds = groups.map(g => g.id);
            if (groupIds.length > 0) {
                await db.delete(schema.groupStandings).where((0, drizzle_orm_1.inArray)(schema.groupStandings.groupId, groupIds));
                await db.delete(schema.matches).where((0, drizzle_orm_1.inArray)(schema.matches.groupId, groupIds));
                await db.delete(schema.tournamentGroups).where((0, drizzle_orm_1.inArray)(schema.tournamentGroups.stageId, stageIds));
            }
            await db.delete(schema.tournamentStages).where((0, drizzle_orm_1.inArray)(schema.tournamentStages.tournamentId, oldTourIds));
        }
        await db.delete(schema.tournamentParticipants).where((0, drizzle_orm_1.inArray)(schema.tournamentParticipants.tournamentId, oldTourIds));
        await db.delete(schema.tournamentDivisions).where((0, drizzle_orm_1.inArray)(schema.tournamentDivisions.tournamentId, oldTourIds));
        await db.delete(schema.tournaments).where((0, drizzle_orm_1.inArray)(schema.tournaments.id, oldTourIds));
        console.log('✅ Đã dọn dẹp xong.');
    }
    const badmintonCat = await db.select().from(schema.categories).where((0, drizzle_orm_1.eq)(schema.categories.slug, 'badminton')).limit(1).then(r => r[0]);
    if (!badmintonCat) {
        console.error('Không tìm thấy danh mục Badminton.');
        return;
    }
    const orgUser = await db.select().from(schema.users).where((0, drizzle_orm_1.eq)(schema.users.email, 'organizer@vndcsport.com')).limit(1).then(r => r[0]);
    if (!orgUser) {
        console.error('Không tìm thấy tài khoản organizer@vndcsport.com.');
        return;
    }
    let venue = await db.select().from(schema.tournamentVenues).limit(1).then(r => r[0]);
    if (!venue) {
        const venueId = uuidv4();
        [venue] = await db.insert(schema.tournamentVenues).values({
            id: venueId, name: 'Sân Cầu Lông Trung Tâm', locationAddress: 'Hà Nội',
        }).returning();
    }
    const login = await api('/auth/mobile/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'organizer@vndcsport.com', password: 'password123' }),
    });
    const loginBody = login.body;
    const token = loginBody?.data?.accessToken || loginBody?.accessToken || '';
    if (!token) {
        console.error('Đăng nhập API thất bại.');
        return;
    }
    const authHeaders = { 'Authorization': `Bearer ${token}` };
    const generateAndPlayGroupStage = async (tour) => {
        await db.update(schema.tournaments).set({ status: 'DRAFT' }).where((0, drizzle_orm_1.eq)(schema.tournaments.id, tour.tourId));
        const gen = await api(`/tournaments/${tour.tourId}/generate-bracket`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ divisionId: tour.divisionId }),
        });
        if (!gen.ok) {
            console.error('Thất bại khi sinh lịch đấu vòng bảng:', gen.body);
            return;
        }
        await db.update(schema.tournaments).set({ status: 'IN_PROGRESS' }).where((0, drizzle_orm_1.eq)(schema.tournaments.id, tour.tourId));
        await playAllMatches(tour.tourId, authHeaders);
        console.log('  Advancing to Playoffs...');
        const stage = await db.select().from(schema.tournamentStages).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentId, tour.tourId), (0, drizzle_orm_1.eq)(schema.tournamentStages.order, 1))).limit(1).then(r => r[0]);
        if (stage) {
            const adv = await api(`/tournaments/${tour.tourId}/advance-standings`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({ divisionId: tour.divisionId, stageId: stage.id }),
            });
            if (!adv.ok) {
                console.error('Thất bại khi đẩy các đội vào vòng Playoffs:', adv.body);
                return;
            }
            await playAllMatches(tour.tourId, authHeaders);
        }
    };
    console.log('\n--- 1. Tạo giải Vòng bảng + Playoffs Đơn - Chẵn 32 Đội ---');
    const gpEvenSE = await createTournament({
        name: 'Vòng Bảng + Playoffs Đơn (32 Đội) - Test',
        bracketType: 'group_stage_knockout',
        numTeams: 32,
        venueId: venue.id,
        categoryId: badmintonCat.id,
        organizerId: orgUser.id,
        genderRestriction: 'MALE',
        groupConfig: {
            numGroups: 8,
            teamsPerGroup: 4,
            roundsToPlay: 1,
        },
        playoffType: 'SINGLE_ELIMINATION',
    });
    await generateAndPlayGroupStage(gpEvenSE);
    console.log('\n--- 2. Tạo giải Vòng bảng + Playoffs Đơn - Lẻ 33 Đội ---');
    const gpOddSE = await createTournament({
        name: 'Vòng Bảng + Playoffs Đơn Lẻ (33 Đội) - Test',
        bracketType: 'group_stage_knockout',
        numTeams: 33,
        venueId: venue.id,
        categoryId: badmintonCat.id,
        organizerId: orgUser.id,
        groupConfig: {
            numGroups: 8,
            teamsPerGroup: 5,
            roundsToPlay: 1,
        },
        playoffType: 'SINGLE_ELIMINATION',
    });
    await generateAndPlayGroupStage(gpOddSE);
    console.log('\n--- 3. Tạo giải Vòng bảng + Playoffs Thắng/Thua - Chẵn 32 Đội ---');
    const gpEvenDE = await createTournament({
        name: 'Vòng Bảng + Playoffs Nhánh Thắng/Thua (32 Đội) - Test',
        bracketType: 'group_stage_knockout',
        numTeams: 32,
        venueId: venue.id,
        categoryId: badmintonCat.id,
        organizerId: orgUser.id,
        genderRestriction: 'MALE',
        groupConfig: {
            numGroups: 8,
            teamsPerGroup: 4,
            roundsToPlay: 1,
        },
        playoffType: 'DOUBLE_ELIMINATION',
    });
    await generateAndPlayGroupStage(gpEvenDE);
    console.log('\n--- 4. Tạo giải Vòng bảng + Playoffs Thắng/Thua - Lẻ 35 Đội ---');
    const gpOddDE = await createTournament({
        name: 'Vòng Bảng + Playoffs Nhánh Thắng/Thua Lẻ (35 Đội) - Test',
        bracketType: 'group_stage_knockout',
        numTeams: 35,
        venueId: venue.id,
        categoryId: badmintonCat.id,
        organizerId: orgUser.id,
        genderRestriction: 'FEMALE',
        groupConfig: {
            numGroups: 8,
            teamsPerGroup: 5,
            roundsToPlay: 1,
        },
        playoffType: 'DOUBLE_ELIMINATION',
    });
    await generateAndPlayGroupStage(gpOddDE);
    await sqlClient.end();
    console.log('\n=== SEEDING TOURNAMENTS WITH VARIOUS FORMATS COMPLETE ===');
}
main().catch(async (err) => {
    console.error('Lỗi khi chạy seeding:', err);
    await sqlClient.end();
    process.exit(1);
});
//# sourceMappingURL=seed-all-five-formats.js.map