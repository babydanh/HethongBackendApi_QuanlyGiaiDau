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
const bcrypt = __importStar(require("bcrypt"));
const uuidv4 = () => crypto.randomUUID();
const sqlClient = (0, postgres_client_1.createPostgresClientFromEnv)({ ssl: undefined });
const db = (0, postgres_js_1.drizzle)(sqlClient, { schema });
const PICKLEBALL_RULES = {
    kind: 'PICKLEBALL_RALLY',
    setsToWin: 2,
    pointsPerSet: 11,
    winByTwo: true,
    maxPointsPerSet: 15,
    serveSwitchEvery: 1,
    switchSidesBetweenSets: true,
    switchSidesAtTiebreakPoints: 6,
};
const MOCK_PLAYERS = [
    { name: 'Nguyen Minh Danh', email: 'danh.nguyen@gmail.com' },
    { name: 'Pham Hai Dung', email: 'dung.pham@gmail.com' },
    { name: 'Tran Minh Binh', email: 'binh.tran@gmail.com' },
    { name: 'Le Hoang Cuong', email: 'cuong.le@gmail.com' },
    { name: 'Vu Quoc Phong', email: 'phong.vu@gmail.com' },
    { name: 'Dang Khanh Linh', email: 'linh.dang@gmail.com' },
    { name: 'Bui Minh Tri', email: 'tri.bui@gmail.com' },
    { name: 'Do Thuy Trang', email: 'trang.do@gmail.com' },
    { name: 'Ho Duc Hai', email: 'hai.ho@gmail.com' },
    { name: 'Nguyen Minh Quan', email: 'quan.nguyen@gmail.com' },
    { name: 'Pham Hong Dang', email: 'dang.pham@gmail.com' },
    { name: 'Tran Bao Long', email: 'long.tran@gmail.com' },
    { name: 'Le Quynh Anh', email: 'anh.le@gmail.com' },
    { name: 'Trinh Cong Son', email: 'son.trinh@gmail.com' },
    { name: 'Nguyen An Binh', email: 'binh.nguyen@gmail.com' },
    { name: 'Vo Van Quyet', email: 'quyet.vo@gmail.com' },
    { name: 'Nguyen Thi Hoa', email: 'hoa.nguyen@gmail.com' },
    { name: 'Tran Van Tu', email: 'tu.tran@gmail.com' },
    { name: 'Pham Van Nam', email: 'nam.pham@gmail.com' },
    { name: 'Hoang Minh Ngoc', email: 'ngoc.hoang@gmail.com' },
    { name: 'Ly Quoc Bao', email: 'bao.ly@gmail.com' },
    { name: 'Doan Van Hau', email: 'hau.doan@gmail.com' },
    { name: 'Nguyen Quang Hai', email: 'hai.quang@gmail.com' },
    { name: 'Phan Van Duc', email: 'duc.phan@gmail.com' },
];
function nextPowerOf2(n) {
    if (n <= 0)
        return 1;
    let p = 1;
    while (p < n)
        p <<= 1;
    return p;
}
function seedingOrder(size) {
    if (size === 2)
        return [1, 2];
    const half = seedingOrder(size / 2);
    const out = [];
    for (const pos of half) {
        out.push(pos);
        out.push(size + 1 - pos);
    }
    return out;
}
async function getOrCreateUser(email, password, displayName, roleSlugs, roleMap, isMock = false) {
    let [user] = await db
        .select()
        .from(schema.users)
        .where((0, drizzle_orm_1.eq)(schema.users.email, email))
        .limit(1);
    if (!user) {
        [user] = await db
            .insert(schema.users)
            .values({
            id: uuidv4(),
            email,
            passwordHash: bcrypt.hashSync(password, 12),
            isEmailVerified: true,
            isMock,
        })
            .returning();
        console.log(`   => Created user: ${email}`);
    }
    else {
        await db
            .update(schema.users)
            .set({ passwordHash: bcrypt.hashSync(password, 12), isEmailVerified: true })
            .where((0, drizzle_orm_1.eq)(schema.users.id, user.id));
    }
    const [prof] = await db
        .select()
        .from(schema.profiles)
        .where((0, drizzle_orm_1.eq)(schema.profiles.userId, user.id))
        .limit(1);
    if (!prof) {
        await db
            .insert(schema.profiles)
            .values({ userId: user.id, fullName: displayName });
    }
    for (const slug of roleSlugs) {
        const roleId = roleMap.get(slug);
        if (roleId) {
            await db
                .insert(schema.userToRoles)
                .values({ userId: user.id, roleId })
                .onConflictDoNothing();
        }
    }
    return user.id;
}
function buildSingleEliminationTree(participantIds, env, startRound = 1, branch = 'MAIN') {
    const N = participantIds.filter(Boolean).length;
    if (N <= 1)
        return { matches: [], losers: [] };
    const P = nextPowerOf2(N);
    const R = Math.round(Math.log2(P));
    const order = seedingOrder(P);
    const slotParticipants = Array(P).fill(null);
    for (let i = 0; i < N; i++)
        slotParticipants[order[i] - 1] = participantIds[i];
    const calc = [];
    let cnt = P / 2;
    for (let i = 0; i < cnt; i++) {
        const p1 = slotParticipants[order[2 * i] - 1];
        const p2 = slotParticipants[order[2 * i + 1] - 1];
        const isBye = p1 === null || p2 === null;
        let winner = null;
        if (p1 !== null && p2 !== null) {
            winner = participantIds.indexOf(p1) <= participantIds.indexOf(p2) ? p1 : p2;
        }
        else {
            winner = p1 || p2;
        }
        calc.push({
            p1,
            p2,
            winner,
            loser: p1 !== null && p2 !== null ? (winner === p1 ? p2 : p1) : null,
            isBye,
        });
    }
    let prevStart = 0;
    let prevCount = cnt;
    cnt = P / 4;
    while (cnt >= 1) {
        for (let i = 0; i < cnt; i++) {
            const w1 = calc[prevStart + 2 * i]?.winner ?? null;
            const w2 = calc[prevStart + 2 * i + 1]?.winner ?? null;
            const isBye = w1 === null || w2 === null;
            let winner = null;
            if (w1 !== null && w2 !== null) {
                winner = participantIds.indexOf(w1) <= participantIds.indexOf(w2) ? w1 : w2;
            }
            else {
                winner = w1 || w2;
            }
            calc.push({
                p1: w1,
                p2: w2,
                winner,
                loser: w1 !== null && w2 !== null ? (winner === w1 ? w2 : w1) : null,
                isBye,
            });
        }
        prevStart += prevCount;
        prevCount = cnt;
        cnt = Math.floor(cnt / 2);
        if (cnt < 1)
            break;
    }
    const totalMatches = calc.length;
    const matchIds = Array.from({ length: totalMatches }, () => uuidv4());
    const matches = [];
    const losers = [];
    let acc = 0;
    let roundCount = P / 2;
    for (let r = 0; r < R; r++) {
        const num = Math.min(roundCount, totalMatches - acc);
        if (num <= 0)
            break;
        for (let i = 0; i < num; i++) {
            const c = calc[acc + i];
            let nxt = null;
            const nextAcc = acc + num;
            if (nextAcc + Math.floor(i / 2) < matchIds.length) {
                nxt = matchIds[nextAcc + Math.floor(i / 2)];
            }
            matches.push({
                id: matchIds[acc + i],
                tournamentId: env.tournamentId,
                stageId: env.stageId,
                groupId: null,
                participant1Id: c.p1,
                participant2Id: c.p2,
                winnerId: c.winner,
                status: c.isBye ? 'COMPLETED' : 'SCHEDULED',
                isBye: c.isBye,
                roundNumber: startRound + r,
                matchOrder: i + 1,
                bracketBranch: branch,
                nextMatchId: nxt,
                loserNextMatchId: null,
                scoreDetails: {},
                p1SetsWon: 0,
                p2SetsWon: 0,
                totalSetsPlayed: 0,
                matchConfig: {},
                cheerCount: 0,
            });
            losers.push(c.loser);
        }
        acc += num;
        roundCount = Math.ceil(roundCount / 2);
    }
    return { matches, losers };
}
function buildLosersBracket(participantIds, wbLosers, env, startRound) {
    const realLosers = wbLosers.filter((l) => l !== null);
    if (realLosers.length <= 1)
        return { lbMatches: [] };
    return { lbMatches: buildSingleEliminationTree(realLosers, { ...env, stageId: env.stageId }, startRound, 'CONSOLATION').matches };
}
function buildRoundRobin(participantIds, env, groupId, roundNum = 1) {
    const real = participantIds.filter((p) => p !== null);
    const matches = [];
    let order = 0;
    for (let i = 0; i < real.length; i++) {
        for (let j = i + 1; j < real.length; j++) {
            order++;
            matches.push({
                id: uuidv4(),
                tournamentId: env.tournamentId,
                stageId: env.stageId,
                groupId,
                participant1Id: real[i],
                participant2Id: real[j],
                winnerId: null,
                status: 'SCHEDULED',
                isBye: false,
                roundNumber: roundNum,
                matchOrder: order,
                bracketBranch: 'MAIN',
                nextMatchId: null,
                loserNextMatchId: null,
                scoreDetails: {},
                p1SetsWon: 0,
                p2SetsWon: 0,
                totalSetsPlayed: 0,
                matchConfig: {},
                cheerCount: 0,
            });
        }
    }
    return matches;
}
function makeScore(p1Wins) {
    return p1Wins
        ? {
            p1SetsWon: 2,
            p2SetsWon: 0,
            totalSetsPlayed: 2,
            scoreDetails: {
                sets: [
                    { team1Score: 11, team2Score: 7, isFinished: true },
                    { team1Score: 11, team2Score: 9, isFinished: true },
                ],
            },
        }
        : {
            p1SetsWon: 0,
            p2SetsWon: 2,
            totalSetsPlayed: 2,
            scoreDetails: {
                sets: [
                    { team1Score: 6, team2Score: 11, isFinished: true },
                    { team1Score: 8, team2Score: 11, isFinished: true },
                ],
            },
        };
}
function scoreOneMatch(m, participantIds) {
    if (m.isBye || m.status !== 'SCHEDULED')
        return;
    const idx1 = m.participant1Id ? participantIds.indexOf(m.participant1Id) : -1;
    const idx2 = m.participant2Id ? participantIds.indexOf(m.participant2Id) : -1;
    if (idx1 < 0 || idx2 < 0)
        return;
    const p1Wins = idx1 <= idx2;
    const sc = makeScore(p1Wins);
    m.p1SetsWon = sc.p1SetsWon;
    m.p2SetsWon = sc.p2SetsWon;
    m.totalSetsPlayed = sc.totalSetsPlayed;
    m.scoreDetails = sc.scoreDetails;
    m.winnerId = p1Wins ? m.participant1Id : m.participant2Id;
    m.status = 'COMPLETED';
    m.startedAt = new Date(Date.now() - 86400000);
    m.completedAt = new Date(Date.now() - 43200000);
}
function scoreAllChalk(matches, participantIds) {
    for (const m of matches)
        scoreOneMatch(m, participantIds);
}
function scoreEarlyRounds(matches, participantIds, upToRound) {
    for (const m of matches) {
        if (m.roundNumber <= upToRound)
            scoreOneMatch(m, participantIds);
    }
}
function propagateWinners(matches) {
    const idx = new Map();
    for (const m of matches)
        idx.set(m.id, m);
    for (const m of matches) {
        if (!m.nextMatchId)
            continue;
        if (m.status !== 'COMPLETED' && !m.isBye)
            continue;
        const w = m.winnerId;
        if (!w)
            continue;
        const parent = idx.get(m.nextMatchId);
        if (!parent)
            continue;
        if (parent.participant1Id === null)
            parent.participant1Id = w;
        else if (parent.participant2Id === null && parent.participant1Id !== w)
            parent.participant2Id = w;
    }
    for (const m of matches) {
        if (!m.loserNextMatchId)
            continue;
        if (m.status !== 'COMPLETED' || m.isBye)
            continue;
        const loser = m.winnerId === m.participant1Id ? m.participant2Id : m.participant1Id;
        if (!loser)
            continue;
        const lbMatch = idx.get(m.loserNextMatchId);
        if (!lbMatch)
            continue;
        if (lbMatch.participant1Id === null)
            lbMatch.participant1Id = loser;
        else if (lbMatch.participant2Id === null && lbMatch.participant1Id !== loser)
            lbMatch.participant2Id = loser;
    }
}
async function insertMatches(matches) {
    for (let i = 0; i < matches.length; i += 50) {
        const chunk = matches.slice(i, i + 50);
        await db.insert(schema.matches).values(chunk.map((m) => ({
            id: m.id,
            groupId: m.groupId,
            tournamentId: m.tournamentId,
            stageId: m.stageId,
            participant1Id: m.participant1Id,
            participant2Id: m.participant2Id,
            winnerId: m.winnerId,
            status: m.status,
            scoreDetails: m.scoreDetails,
            p1SetsWon: m.p1SetsWon,
            p2SetsWon: m.p2SetsWon,
            totalSetsPlayed: m.totalSetsPlayed,
            roundNumber: m.roundNumber,
            matchOrder: m.matchOrder,
            bracketBranch: m.bracketBranch,
            isBye: m.isBye,
            nextMatchId: m.nextMatchId,
            loserNextMatchId: m.loserNextMatchId,
            matchConfig: m.matchConfig,
            cheerCount: m.cheerCount,
            startedAt: m.startedAt,
            completedAt: m.completedAt,
        })));
    }
}
async function insertGroupStandings(groupPartIds, groupId, matches) {
    const stats = new Map();
    for (const pid of groupPartIds) {
        stats.set(pid, { played: 0, won: 0, lost: 0, pf: 0, pa: 0 });
    }
    for (const m of matches) {
        if (m.status !== 'COMPLETED')
            continue;
        const w = m.winnerId;
        if (!w || !m.participant1Id || !m.participant2Id)
            continue;
        const l = w === m.participant1Id ? m.participant2Id : m.participant1Id;
        const s1 = stats.get(w);
        const s2 = stats.get(l);
        if (s1) {
            s1.played++;
            s1.won++;
            s1.pf += 11;
            s1.pa += 7;
        }
        if (s2) {
            s2.played++;
            s2.lost++;
            s2.pf += 7;
            s2.pa += 11;
        }
    }
    for (const [pid, s] of stats) {
        const totalPts = s.won * 2 + s.lost * 1;
        await db
            .insert(schema.groupStandings)
            .values({
            id: uuidv4(),
            groupId,
            participantId: pid,
            played: s.played,
            won: s.won,
            lost: s.lost,
            draws: 0,
            pointsFor: s.pf,
            pointsAgainst: s.pa,
            totalPoints: totalPts,
        })
            .onConflictDoNothing();
    }
}
async function createTournament(params) {
    const { name, bracketType, numTeams, venueId, categoryId, organizerId, matchType, genderRestriction = 'MALE', status, fillCount, entryFee, description, prizeDescription, groupConfig, mockPlayerIds, } = params;
    const tourId = uuidv4();
    const inviteCode = `P-${bracketType.substring(0, 2).toUpperCase()}-${Date.now().toString().slice(-4)}`;
    const storeStatus = status === 'COMPLETED' || status === 'IN_PROGRESS' ? 'IN_PROGRESS' : status;
    const DAY_MS = 86400000;
    const NOW_TS = Date.now();
    const dateCfg = status === 'COMPLETED'
        ? { regStart: NOW_TS - 30 * DAY_MS, regEnd: NOW_TS - 15 * DAY_MS, tStart: NOW_TS - 14 * DAY_MS, tEnd: NOW_TS - 10 * DAY_MS }
        : status === 'REGISTRATION_OPEN'
            ? { regStart: NOW_TS - 5 * DAY_MS, regEnd: NOW_TS + 14 * DAY_MS, tStart: NOW_TS + 7 * DAY_MS, tEnd: NOW_TS + 10 * DAY_MS }
            : { regStart: NOW_TS - 15 * DAY_MS, regEnd: NOW_TS - 3 * DAY_MS, tStart: NOW_TS - 2 * DAY_MS, tEnd: NOW_TS + 2 * DAY_MS };
    await db.insert(schema.tournaments).values({
        id: tourId,
        name,
        description,
        categoryId,
        createdBy: organizerId,
        status: storeStatus,
        matchType,
        genderRestriction,
        sportRules: PICKLEBALL_RULES,
        tournamentConfig: {
            bracketType: bracketType.toUpperCase(),
            maxTeams: numTeams,
            ...(groupConfig || {}),
        },
        venueId,
        entryFee,
        tournamentType: 'PUBLIC',
        visibility: 'PUBLIC',
        maxParticipants: numTeams,
        registrationStartDate: new Date(dateCfg.regStart),
        registrationEndDate: new Date(dateCfg.regEnd),
        startDate: new Date(dateCfg.tStart),
        endDate: new Date(dateCfg.tEnd),
        communityId: null,
        inviteCode,
        isRanked: true,
        prizeDescription,
    });
    const divisionId = uuidv4();
    await db.insert(schema.tournamentDivisions).values({
        id: divisionId,
        tournamentId: tourId,
        name,
        matchType,
        genderRestriction,
        bracketType: bracketType.toUpperCase(),
        status: 'ACTIVE',
        entryFee,
    });
    const isDoubles = matchType === 'DOUBLES';
    const participantIds = [];
    const participantMeta = [];
    for (let i = 1; i <= fillCount; i++) {
        const partId = uuidv4();
        if (isDoubles) {
            const idx1 = ((i - 1) * 2) % mockPlayerIds.length;
            const idx2 = ((i - 1) * 2 + 1) % mockPlayerIds.length;
            const p1Name = MOCK_PLAYERS[idx1]?.name ?? `Player${idx1}`;
            const p2Name = MOCK_PLAYERS[idx2]?.name ?? `Player${idx2}`;
            const teamName = `${p1Name} - ${p2Name}`;
            await db.insert(schema.tournamentParticipants).values({
                id: partId,
                tournamentId: tourId,
                tournamentDivisionId: divisionId,
                registeredBy: organizerId,
                teamName,
                teamStatus: 'COMPLETE',
                seed: i,
                isMock: true,
                isPaid: true,
            });
            await db
                .insert(schema.tournamentRosters)
                .values({ id: uuidv4(), participantId: partId, userId: mockPlayerIds[idx1], role: 'MAIN' });
            await db
                .insert(schema.tournamentRosters)
                .values({ id: uuidv4(), participantId: partId, userId: mockPlayerIds[idx2], role: 'MAIN' });
            participantIds.push(partId);
            participantMeta.push({ id: partId, seed: i });
        }
        else {
            const idx = (i - 1) % mockPlayerIds.length;
            const p = MOCK_PLAYERS[idx];
            const teamName = p.name;
            await db.insert(schema.tournamentParticipants).values({
                id: partId,
                tournamentId: tourId,
                tournamentDivisionId: divisionId,
                registeredBy: organizerId,
                teamName,
                teamStatus: 'COMPLETE',
                seed: i,
                isMock: true,
                isPaid: true,
            });
            await db
                .insert(schema.tournamentRosters)
                .values({ id: uuidv4(), participantId: partId, userId: mockPlayerIds[idx], role: 'MAIN' });
            participantIds.push(partId);
            participantMeta.push({ id: partId, seed: i });
        }
    }
    participantMeta.sort((a, b) => a.seed - b.seed);
    return {
        tourId,
        divisionId,
        participantIdsBySeed: participantMeta.map((p) => p.id),
        participantMeta,
    };
}
async function main() {
    console.log('=== SEED DATA PRODUCTION — 13 TOURNAMENTS WITH BRACKETS ===\n');
    const pickleballCat = await db
        .select()
        .from(schema.categories)
        .where((0, drizzle_orm_1.eq)(schema.categories.slug, 'pickleball'))
        .limit(1)
        .then((r) => r[0]);
    if (!pickleballCat) {
        console.error('ERROR: Pickleball category not found. Run seed-prod.ts first.');
        return;
    }
    const roles = await db.select().from(schema.roles);
    const roleMap = new Map();
    for (const r of roles)
        roleMap.set(r.slug, r.id);
    if (!roleMap.has('admin') || !roleMap.has('organizer') || !roleMap.has('player')) {
        console.error('ERROR: Required roles missing. Run seed-prod.ts first.');
        return;
    }
    console.log('=> Creating / verifying users...');
    const adminId = await getOrCreateUser('vndcsport@gmail.com', 'Admin@123', 'Sporto Admin', ['admin', 'organizer', 'player'], roleMap);
    console.log(`   Admin vndcsport@gmail.com / Admin@123`);
    const org1Id = await getOrCreateUser('macter.970@gmail.com', 'Test@123', 'macter.970', ['organizer', 'player'], roleMap);
    const org2Id = await getOrCreateUser('hxlinh1683@gmail.com', 'Test@123', 'hxlinh1683', ['organizer', 'player'], roleMap);
    console.log(`   Organizers: macter.970@gmail.com, hxlinh1683@gmail.com / Test@123`);
    const mockPlayerIds = [];
    for (const mp of MOCK_PLAYERS) {
        const uid = await getOrCreateUser(mp.email, 'Player@123', mp.name, ['player'], roleMap, true);
        mockPlayerIds.push(uid);
    }
    console.log(`   ${MOCK_PLAYERS.length} mock players / Player@123`);
    let venue = await db.select().from(schema.tournamentVenues).limit(1).then((r) => r[0]);
    if (!venue) {
        const vid = uuidv4();
        [venue] = await db
            .insert(schema.tournamentVenues)
            .values({ id: vid, name: 'Sporto Club', locationAddress: '154 Tran Nao, Quan 2, TP. Ho Chi Minh' })
            .returning();
        console.log('=> Created venue');
    }
    else {
        console.log('=> Using existing venue');
    }
    const tourConfigs = [
        {
            name: '1. Giải loại trực tiếp 10 đội (Đơn)',
            bracketType: 'single_elimination',
            numTeams: 10,
            fillCount: 10,
            matchType: 'SINGLES',
            genderRestriction: 'MALE',
            status: 'IN_PROGRESS',
            entryFee: '150000.00',
            description: 'Giải đấu loại trực tiếp đơn nam với 10 vận động viên tham dự.',
            prizeDescription: 'Cúp + 2.000.000 VNĐ.',
        },
        {
            name: '2. Giải loại trực tiếp 11 đội (Đơn)',
            bracketType: 'single_elimination',
            numTeams: 11,
            fillCount: 11,
            matchType: 'SINGLES',
            genderRestriction: 'FEMALE',
            status: 'COMPLETED',
            entryFee: '150000.00',
            description: 'Giải đấu loại trực tiếp đơn nữ đã hoàn thành thi đấu.',
            prizeDescription: 'Cúp + 2.000.000 VNĐ.',
        },
        {
            name: '3. Giải loại trực tiếp 12 đội (Đôi)',
            bracketType: 'single_elimination',
            numTeams: 12,
            fillCount: 6,
            matchType: 'MIXED_DOUBLES',
            genderRestriction: 'MIXED',
            status: 'REGISTRATION_OPEN',
            entryFee: '250000.00',
            description: 'Giải đấu loại trực tiếp đôi nam nữ đang mở cổng đăng ký trực tuyến.',
            prizeDescription: 'Cúp đôi + 4.000.000 VNĐ.',
        },
        {
            name: '4. Giải loại trực tiếp 13 đội (Đơn)',
            bracketType: 'single_elimination',
            numTeams: 13,
            fillCount: 13,
            matchType: 'SINGLES',
            genderRestriction: 'MALE',
            status: 'IN_PROGRESS',
            entryFee: '150000.00',
            description: 'Giải đấu loại trực tiếp đơn nam đang diễn ra căng thẳng.',
            prizeDescription: 'Cúp + 2.000.000 VNĐ.',
        },
        {
            name: '5. Giải thắng/thua 10 đội (Đơn)',
            bracketType: 'double_elimination',
            numTeams: 10,
            fillCount: 10,
            matchType: 'SINGLES',
            genderRestriction: 'MALE',
            status: 'COMPLETED',
            entryFee: '200000.00',
            description: 'Giải đấu nhánh thắng nhánh thua đơn nam đã hoàn thành và tìm ra nhà vô địch.',
            prizeDescription: 'Cúp + 3.000.000 VNĐ.',
        },
        {
            name: '6. Giải thắng/thua 11 đội (Đôi)',
            bracketType: 'double_elimination',
            numTeams: 11,
            fillCount: 11,
            matchType: 'DOUBLES',
            genderRestriction: 'MALE',
            status: 'IN_PROGRESS',
            entryFee: '300000.00',
            description: 'Giải đấu đôi nam nhánh thắng nhánh thua cực kỳ hấp dẫn.',
            prizeDescription: 'Cúp đôi + 5.000.000 VNĐ.',
        },
        {
            name: '7. Giải thắng/thua 12 đội (Đơn)',
            bracketType: 'double_elimination',
            numTeams: 12,
            fillCount: 4,
            matchType: 'SINGLES',
            genderRestriction: 'MALE',
            status: 'REGISTRATION_OPEN',
            entryFee: '200000.00',
            description: 'Giải đấu đơn nam nhánh thắng nhánh thua đang nhận đơn đăng ký.',
            prizeDescription: 'Cúp + 3.000.000 VNĐ.',
        },
        {
            name: '8. Giải thắng/thua 13 đội (Đôi)',
            bracketType: 'double_elimination',
            numTeams: 13,
            fillCount: 13,
            matchType: 'DOUBLES',
            genderRestriction: 'FEMALE',
            status: 'IN_PROGRESS',
            entryFee: '300000.00',
            description: 'Giải đấu đôi nữ nhánh thắng nhánh thua đang diễn ra các vòng đấu knock-out.',
            prizeDescription: 'Cúp đôi + 5.000.000 VNĐ.',
        },
        {
            name: '9. Giải vòng tròn 6 đội (Đơn)',
            bracketType: 'round_robin',
            numTeams: 6,
            fillCount: 6,
            matchType: 'SINGLES',
            genderRestriction: 'MALE',
            status: 'IN_PROGRESS',
            entryFee: '100000.00',
            description: 'Giải đấu vòng tròn tính điểm cọ xát đơn nam.',
            prizeDescription: 'Huy chương + Quà tặng lưu niệm.',
        },
        {
            name: '10. Giải vòng tròn 7 đội (Đôi)',
            bracketType: 'round_robin',
            numTeams: 7,
            fillCount: 7,
            matchType: 'MIXED_DOUBLES',
            genderRestriction: 'MIXED',
            status: 'COMPLETED',
            entryFee: '200000.00',
            description: 'Giải đấu vòng tròn đôi nam nữ đã kết thúc tất cả các lượt trận vòng tròn.',
            prizeDescription: 'Huy chương + Quà tặng lưu niệm.',
        },
        {
            name: '11. Giải vòng tròn 8 đội (Đơn)',
            bracketType: 'round_robin',
            numTeams: 8,
            fillCount: 3,
            matchType: 'SINGLES',
            genderRestriction: 'MALE',
            status: 'REGISTRATION_OPEN',
            entryFee: '100000.00',
            description: 'Giải đấu vòng tròn đơn nam quy mô tối đa 8 vận động viên.',
            prizeDescription: 'Huy chương + Quà tặng lưu niệm.',
        },
        {
            name: '12. Vòng bảng + Playoffs 32 đội (Đơn)',
            bracketType: 'group_stage_knockout',
            numTeams: 32,
            fillCount: 32,
            matchType: 'SINGLES',
            genderRestriction: 'MALE',
            status: 'IN_PROGRESS',
            entryFee: '200000.00',
            description: 'Giải đấu chuyên nghiệp quy mô lớn chia làm 8 bảng đấu tranh suất vào Playoffs.',
            prizeDescription: 'Cúp vô địch + Cờ lưu niệm + 7.000.000 VNĐ.',
            groupConfig: {
                groupsConfig: { numGroups: 8, teamsPerGroup: 4, roundsToPlay: 1 },
                advancementConfig: { teamsAdvancing: 2 },
                playoffConfig: { type: 'SINGLE_ELIMINATION' },
            },
        },
        {
            name: '13. Vòng bảng + Playoffs 40 đội (Đôi)',
            bracketType: 'group_stage_knockout',
            numTeams: 40,
            fillCount: 40,
            matchType: 'MIXED_DOUBLES',
            genderRestriction: 'MIXED',
            status: 'IN_PROGRESS',
            entryFee: '400000.00',
            description: 'Giải đôi nam nữ quy mô lớn nhất hệ thống, chia bảng đấu để lựa chọn cặp đấu xuất sắc nhất.',
            prizeDescription: 'Cúp đôi vô địch + Cờ lưu niệm + 10.000.000 VNĐ.',
            groupConfig: {
                groupsConfig: { numGroups: 8, teamsPerGroup: 5, roundsToPlay: 1 },
                advancementConfig: { teamsAdvancing: 2 },
                playoffConfig: { type: 'SINGLE_ELIMINATION' },
            },
        },
    ];
    let count = 0;
    for (const cfg of tourConfigs) {
        count++;
        const organizerId = count % 2 === 0 ? org2Id : org1Id;
        console.log(`\n[${count}/13] ${cfg.name}...`);
        const prefix = `P-${cfg.bracketType.substring(0, 2).toUpperCase()}-`;
        const existing = await db
            .select({ id: schema.tournaments.id })
            .from(schema.tournaments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.sql) `${schema.tournaments.inviteCode} LIKE ${prefix + '%'}`, (0, drizzle_orm_1.eq)(schema.tournaments.name, cfg.name)))
            .limit(1);
        if (existing.length > 0) {
            console.log(`   Skipping (already exists: ${existing[0].id})`);
            continue;
        }
        const { tourId, divisionId, participantIdsBySeed } = await createTournament({
            name: cfg.name,
            bracketType: cfg.bracketType,
            numTeams: cfg.numTeams,
            fillCount: cfg.fillCount,
            venueId: venue.id,
            categoryId: pickleballCat.id,
            organizerId,
            matchType: cfg.matchType,
            genderRestriction: cfg.genderRestriction,
            status: cfg.status,
            entryFee: cfg.entryFee,
            description: cfg.description,
            prizeDescription: cfg.prizeDescription,
            groupConfig: cfg.groupConfig,
            mockPlayerIds,
        });
        const env = { tournamentId: tourId, stageId: '' };
        const needsBracket = cfg.status === 'IN_PROGRESS' || cfg.status === 'COMPLETED';
        if (!needsBracket) {
            console.log(`   Done (status=${cfg.status}, no bracket).`);
            continue;
        }
        if (cfg.bracketType === 'single_elimination') {
            const stageId = uuidv4();
            await db.insert(schema.tournamentStages).values({
                id: stageId,
                tournamentId: tourId,
                tournamentDivisionId: divisionId,
                name: 'Vòng loại trực tiếp',
                type: 'BRACKET',
                order: 1,
            });
            env.stageId = stageId;
            const { matches: seMatches } = buildSingleEliminationTree(participantIdsBySeed, env, 1, 'MAIN');
            if (cfg.status === 'COMPLETED') {
                scoreAllChalk(seMatches, participantIdsBySeed);
                propagateWinners(seMatches);
                propagateWinners(seMatches);
                await db.update(schema.tournaments).set({ status: 'COMPLETED' }).where((0, drizzle_orm_1.eq)(schema.tournaments.id, tourId));
            }
            else {
                scoreEarlyRounds(seMatches, participantIdsBySeed, 2);
                propagateWinners(seMatches);
            }
            await insertMatches(seMatches);
            console.log(`   => ${seMatches.length} SE matches.`);
        }
        else if (cfg.bracketType === 'double_elimination') {
            const wbStageId = uuidv4();
            await db.insert(schema.tournamentStages).values({
                id: wbStageId,
                tournamentId: tourId,
                tournamentDivisionId: divisionId,
                name: 'Nhánh thắng',
                type: 'BRACKET',
                order: 1,
            });
            const lbStageId = uuidv4();
            await db.insert(schema.tournamentStages).values({
                id: lbStageId,
                tournamentId: tourId,
                tournamentDivisionId: divisionId,
                name: 'Nhánh thua',
                type: 'BRACKET',
                order: 2,
            });
            env.stageId = wbStageId;
            const { matches: wbMatches, losers: wbLosers } = buildSingleEliminationTree(participantIdsBySeed, env, 1, 'MAIN');
            const seRoundCount = Math.ceil(Math.log2(nextPowerOf2(participantIdsBySeed.length)));
            env.stageId = lbStageId;
            const { lbMatches } = buildLosersBracket(participantIdsBySeed, wbLosers, env, seRoundCount + 1);
            const wbLoserList = [];
            for (const m of wbMatches) {
                if (!m.isBye && m.winnerId && m.participant1Id && m.participant2Id) {
                    const loserId = m.winnerId === m.participant1Id ? m.participant2Id : m.participant1Id;
                    wbLoserList.push({ loserId, wbMatchId: m.id });
                }
            }
            let lbIdx = 0;
            for (let i = 0; i < wbLoserList.length && lbIdx < lbMatches.length; i += 2) {
                const lbMatch = lbMatches[lbIdx];
                if (!lbMatch)
                    break;
                const l1 = wbLoserList[i]?.loserId ?? null;
                const l2 = wbLoserList[i + 1]?.loserId ?? null;
                if (lbMatch.participant1Id === null && l1) {
                    lbMatch.participant1Id = l1;
                    wbMatches.forEach((wm) => {
                        if (wm.id === wbLoserList[i]?.wbMatchId)
                            wm.loserNextMatchId = lbMatch.id;
                    });
                }
                if (lbMatch.participant2Id === null && l2) {
                    lbMatch.participant2Id = l2;
                    wbMatches.forEach((wm) => {
                        if (wm.id === wbLoserList[i + 1]?.wbMatchId)
                            wm.loserNextMatchId = lbMatch.id;
                    });
                }
                lbIdx++;
            }
            if (cfg.status === 'COMPLETED') {
                scoreAllChalk(wbMatches, participantIdsBySeed);
                propagateWinners(wbMatches);
                for (const lm of lbMatches) {
                    if (lm.participant1Id && lm.participant2Id && !lm.isBye) {
                        scoreOneMatch(lm, participantIdsBySeed);
                    }
                }
                propagateWinners(lbMatches);
                await db.update(schema.tournaments).set({ status: 'COMPLETED' }).where((0, drizzle_orm_1.eq)(schema.tournaments.id, tourId));
            }
            else {
                scoreEarlyRounds(wbMatches, participantIdsBySeed, 2);
                propagateWinners(wbMatches);
            }
            await insertMatches(wbMatches);
            if (lbMatches.length > 0)
                await insertMatches(lbMatches);
            console.log(`   => WB:${wbMatches.length} LB:${lbMatches.length} matches.`);
        }
        else if (cfg.bracketType === 'round_robin') {
            const stageId = uuidv4();
            await db.insert(schema.tournamentStages).values({
                id: stageId,
                tournamentId: tourId,
                tournamentDivisionId: divisionId,
                name: 'Vòng tròn tính điểm',
                type: 'GROUP',
                order: 1,
            });
            const groupId = uuidv4();
            await db.insert(schema.tournamentGroups).values({
                id: groupId,
                stageId,
                name: 'Bảng A',
            });
            for (const pid of participantIdsBySeed) {
                await db
                    .update(schema.tournamentParticipants)
                    .set({ groupId })
                    .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, pid));
            }
            env.stageId = stageId;
            const rrMatches = buildRoundRobin(participantIdsBySeed, env, groupId, 1);
            if (cfg.status === 'COMPLETED') {
                scoreAllChalk(rrMatches, participantIdsBySeed);
                await insertGroupStandings(participantIdsBySeed, groupId, rrMatches);
                await db.update(schema.tournaments).set({ status: 'COMPLETED' }).where((0, drizzle_orm_1.eq)(schema.tournaments.id, tourId));
            }
            else {
                const half = Math.ceil(rrMatches.length / 2);
                const scored = rrMatches.slice(0, half);
                const unscored = rrMatches.slice(half);
                scoreAllChalk(scored, participantIdsBySeed);
                for (const u of unscored) {
                    u.status = 'SCHEDULED';
                    u.winnerId = null;
                    u.p1SetsWon = 0;
                    u.p2SetsWon = 0;
                    u.totalSetsPlayed = 0;
                    u.scoreDetails = {};
                    u.startedAt = undefined;
                    u.completedAt = undefined;
                }
                await insertGroupStandings(participantIdsBySeed, groupId, rrMatches);
            }
            await insertMatches(rrMatches);
            console.log(`   => ${rrMatches.length} RR matches.`);
        }
        else if (cfg.bracketType === 'group_stage_knockout') {
            const gCfg = cfg.groupConfig;
            if (!gCfg) {
                console.log('   Missing groupConfig, skipping bracket.');
                continue;
            }
            const gs = gCfg.groupsConfig;
            const adv = gCfg.advancementConfig;
            const po = gCfg.playoffConfig;
            const { numGroups, teamsPerGroup } = gs;
            const teamsAdv = adv.teamsAdvancing;
            const gsStageId = uuidv4();
            await db.insert(schema.tournamentStages).values({
                id: gsStageId,
                tournamentId: tourId,
                tournamentDivisionId: divisionId,
                name: 'Vòng bảng',
                type: 'GROUP_STAGE',
                order: 1,
            });
            const tags = 'ABCDEFGH'.split('').slice(0, numGroups);
            const allGroupMatches = [];
            const groupInfo = [];
            for (let g = 0; g < numGroups; g++) {
                const groupId = uuidv4();
                await db.insert(schema.tournamentGroups).values({
                    id: groupId,
                    stageId: gsStageId,
                    name: `Bảng ${tags[g]}`,
                });
                const start = g * teamsPerGroup;
                const end = Math.min(start + teamsPerGroup, participantIdsBySeed.length);
                const groupPartIds = participantIdsBySeed.slice(start, end);
                for (const pid of groupPartIds) {
                    await db
                        .update(schema.tournamentParticipants)
                        .set({ groupId })
                        .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, pid));
                }
                env.stageId = gsStageId;
                const rr = buildRoundRobin(groupPartIds, env, groupId, 1);
                allGroupMatches.push(...rr);
                groupInfo.push({ groupId, partIds: groupPartIds });
            }
            scoreAllChalk(allGroupMatches, participantIdsBySeed);
            for (const gi of groupInfo) {
                const gm = allGroupMatches.filter((m) => m.groupId === gi.groupId);
                await insertGroupStandings(gi.partIds, gi.groupId, gm);
            }
            await insertMatches(allGroupMatches);
            console.log(`   => ${allGroupMatches.length} group matches.`);
            const koStageId = uuidv4();
            await db.insert(schema.tournamentStages).values({
                id: koStageId,
                tournamentId: tourId,
                tournamentDivisionId: divisionId,
                name: 'Vòng Playoffs',
                type: 'KNOCKOUT',
                order: 2,
            });
            const advancing = [];
            for (const gi of groupInfo) {
                const sorted = [...gi.partIds];
                advancing.push(...sorted.slice(0, teamsAdv));
            }
            env.stageId = koStageId;
            const { matches: koMatches } = buildSingleEliminationTree(advancing, env, 1, 'MAIN');
            if (cfg.status === 'COMPLETED') {
                scoreAllChalk(koMatches, advancing);
                propagateWinners(koMatches);
            }
            else {
                scoreEarlyRounds(koMatches, advancing, 2);
                propagateWinners(koMatches);
            }
            await insertMatches(koMatches);
            console.log(`   => ${koMatches.length} KO matches.`);
            if (cfg.status === 'COMPLETED') {
                await db.update(schema.tournaments).set({ status: 'COMPLETED' }).where((0, drizzle_orm_1.eq)(schema.tournaments.id, tourId));
            }
        }
        console.log(`   Done.`);
    }
    console.log('\n=== SEED DATA PRODUCTION COMPLETE ===');
    await sqlClient.end();
}
main().catch(async (err) => {
    console.error('Error seeding data:', err);
    await sqlClient.end();
    process.exit(1);
});
//# sourceMappingURL=seed-data-prod.js.map