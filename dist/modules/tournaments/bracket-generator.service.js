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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BracketGeneratorService = void 0;
const common_1 = require("@nestjs/common");
const database_module_1 = require("../../database/database.module");
const schema = __importStar(require("../../database/schema"));
const drizzle_orm_1 = require("drizzle-orm");
const crypto_1 = require("crypto");
const bracket_advancement_helper_1 = require("../../common/helpers/bracket-advancement.helper");
const round_robin_config_1 = require("./utils/round-robin-config");
const football_standings_1 = require("./utils/football-standings");
let BracketGeneratorService = class BracketGeneratorService {
    db;
    constructor(db) {
        this.db = db;
    }
    async generateSingleElimination(tournamentId, userId, divisionId, seedingType) {
        return await this.db.transaction(async (tx) => {
            const [tournament] = await tx
                .select()
                .from(schema.tournaments)
                .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId))
                .limit(1);
            if (!tournament)
                throw new common_1.BadRequestException('Giải đấu không tồn tại');
            const participants = await tx
                .select()
                .from(schema.tournamentParticipants)
                .where(divisionId
                ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentDivisionId, divisionId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.isMock, true), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.teamStatus, 'COMPLETE')))
                : (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.isMock, true), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.teamStatus, 'COMPLETE'))));
            const numParticipants = participants.length;
            if (numParticipants < 2) {
                throw new common_1.BadRequestException('Cần ít nhất 2 đội để tạo sơ đồ loại trực tiếp');
            }
            await tx
                .update(schema.tournamentStages)
                .set({ deletedAt: new Date() })
                .where(divisionId
                ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentDivisionId, divisionId))
                : (0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentId, tournamentId));
            const [stage] = await tx
                .insert(schema.tournamentStages)
                .values({
                tournamentId,
                name: 'Elimination Stage',
                type: 'SINGLE_ELIMINATION',
                order: 1,
                tournamentDivisionId: divisionId ?? null,
            })
                .returning();
            const [group] = await tx
                .insert(schema.tournamentGroups)
                .values({
                stageId: stage.id,
                name: 'Main Bracket',
            })
                .returning();
            const powerOf2 = Math.pow(2, Math.ceil(Math.log2(numParticipants)));
            const totalRounds = Math.log2(powerOf2);
            const tConfig = (tournament.tournamentConfig || {});
            const twoLegged = tConfig.twoLegged === true;
            const matchNodesByRound = new Map();
            for (let r = totalRounds; r >= 1; r--) {
                const matchesInRound = Math.pow(2, totalRounds - r);
                const roundMatches = [];
                for (let i = 0; i < matchesInRound; i++) {
                    const legs = twoLegged ? [1, 2] : [1];
                    const tieId = twoLegged ? (0, crypto_1.randomUUID)() : null;
                    for (const leg of legs) {
                        roundMatches.push({
                            id: (0, crypto_1.randomUUID)(),
                            groupId: group.id,
                            roundNumber: r,
                            matchOrder: roundMatches.length + 1,
                            bracketBranch: 'MAIN',
                            status: 'SCHEDULED',
                            isBye: false,
                            nextMatchId: null,
                            loserNextMatchId: null,
                            participant1Id: null,
                            participant2Id: null,
                            winnerId: null,
                            p1SetsWon: 0,
                            p2SetsWon: 0,
                            totalSetsPlayed: 0,
                            tournamentId,
                            stageId: stage.id,
                            leg,
                            tieId,
                        });
                    }
                }
                matchNodesByRound.set(r, roundMatches);
            }
            for (let r = 1; r < totalRounds; r++) {
                const currentRoundMatches = matchNodesByRound.get(r);
                const nextRoundMatches = matchNodesByRound.get(r + 1);
                for (let i = 0; i < currentRoundMatches.length; i++) {
                    const nextMatchIndex = twoLegged
                        ? Math.floor(i / 4) * 2 + (i % 2)
                        : Math.floor(i / 2);
                    if (nextRoundMatches && nextRoundMatches[nextMatchIndex]) {
                        currentRoundMatches[i].nextMatchId =
                            nextRoundMatches[nextMatchIndex].id;
                    }
                }
            }
            const sortedParticipants = [...participants];
            if (seedingType === 'RANDOM') {
                for (let i = sortedParticipants.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    const temp = sortedParticipants[i];
                    sortedParticipants[i] = sortedParticipants[j];
                    sortedParticipants[j] = temp;
                }
            }
            else {
                sortedParticipants.sort((a, b) => (a.seed || 999) - (b.seed || 999));
            }
            const seedingOrder = this.getSeedingOrder(powerOf2);
            const slots = new Array(powerOf2).fill(null);
            for (let i = 0; i < powerOf2; i++) {
                const seedRank = seedingOrder[i];
                if (seedRank <= numParticipants) {
                    slots[i] = sortedParticipants[seedRank - 1].id;
                }
            }
            const round1Matches = matchNodesByRound.get(1);
            for (let i = 0; i < round1Matches.length; i++) {
                const p1 = slots[2 * i];
                const p2 = slots[2 * i + 1];
                round1Matches[i].participant1Id = p1 || null;
                round1Matches[i].participant2Id = p2 || null;
                if (p1 && !p2) {
                    round1Matches[i].status = 'COMPLETED';
                    round1Matches[i].winnerId = p1;
                    round1Matches[i].isBye = true;
                    this.advanceWinner(round1Matches[i], matchNodesByRound);
                }
                else if (!p1 && p2) {
                    round1Matches[i].status = 'COMPLETED';
                    round1Matches[i].winnerId = p2;
                    round1Matches[i].isBye = true;
                    this.advanceWinner(round1Matches[i], matchNodesByRound);
                }
                else if (!p1 && !p2) {
                    round1Matches[i].status = 'COMPLETED';
                    round1Matches[i].winnerId = null;
                    round1Matches[i].isBye = true;
                }
            }
            if (twoLegged) {
                for (let i = 0; i < round1Matches.length; i += 2) {
                    const leg1 = round1Matches[i];
                    const leg2 = round1Matches[i + 1];
                    if (!leg1 || !leg2)
                        continue;
                    leg2.participant1Id = leg1.participant2Id;
                    leg2.participant2Id = leg1.participant1Id;
                    if (leg1.isBye) {
                        leg2.status = 'COMPLETED';
                        leg2.winnerId = leg1.winnerId;
                        leg2.isBye = true;
                    }
                }
            }
            for (let r = totalRounds; r >= 1; r--) {
                const roundMatches = matchNodesByRound.get(r);
                if (roundMatches.length > 0) {
                    await tx.insert(schema.matches).values(roundMatches);
                }
            }
            return {
                message: 'Sơ đồ loại trực tiếp đã được tạo thành công',
                stageId: stage.id,
                totalMatches: totalRounds > 0 ? Array.from(matchNodesByRound.values()).reduce((acc, val) => acc + val.length, 0) : 0,
            };
        });
    }
    async generateDoubleElimination(tournamentId, userId, divisionId, seedingType) {
        return await this.db.transaction(async (tx) => {
            const [tournament] = await tx
                .select()
                .from(schema.tournaments)
                .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId))
                .limit(1);
            if (!tournament)
                throw new common_1.BadRequestException('Giải đấu không tồn tại');
            const participants = await tx
                .select()
                .from(schema.tournamentParticipants)
                .where(divisionId
                ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentDivisionId, divisionId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.isMock, true), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.teamStatus, 'COMPLETE')))
                : (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.isMock, true), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.teamStatus, 'COMPLETE'))));
            const numParticipants = participants.length;
            if (numParticipants < bracket_advancement_helper_1.MIN_DOUBLE_ELIMINATION_PARTICIPANTS ||
                numParticipants > bracket_advancement_helper_1.MAX_DOUBLE_ELIMINATION_PARTICIPANTS) {
                throw new common_1.BadRequestException(`Double Elimination yêu cầu từ ${bracket_advancement_helper_1.MIN_DOUBLE_ELIMINATION_PARTICIPANTS} đến ${bracket_advancement_helper_1.MAX_DOUBLE_ELIMINATION_PARTICIPANTS} đội`);
            }
            await tx
                .update(schema.tournamentStages)
                .set({ deletedAt: new Date() })
                .where(divisionId
                ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentDivisionId, divisionId))
                : (0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentId, tournamentId));
            const [stage] = await tx
                .insert(schema.tournamentStages)
                .values({
                tournamentId,
                name: 'Elimination Stage',
                type: 'DOUBLE_ELIMINATION',
                order: 1,
                tournamentDivisionId: divisionId ?? null,
            })
                .returning();
            const [groupWinners] = await tx
                .insert(schema.tournamentGroups)
                .values({
                stageId: stage.id,
                name: 'Winners Bracket',
            })
                .returning();
            const [groupLosers] = await tx
                .insert(schema.tournamentGroups)
                .values({
                stageId: stage.id,
                name: 'Losers Bracket',
            })
                .returning();
            const [groupGF] = await tx
                .insert(schema.tournamentGroups)
                .values({
                stageId: stage.id,
                name: 'Grand Finals',
            })
                .returning();
            const shape = (0, bracket_advancement_helper_1.getDoubleEliminationShape)(numParticipants);
            const powerOf2 = shape.bracketSize;
            const winnersRounds = shape.winnersRounds;
            const losersRounds = shape.losersRounds;
            const winnersMatchesByRound = new Map();
            const losersMatchesByRound = new Map();
            for (let r = 1; r <= winnersRounds; r++) {
                const matchesInRound = powerOf2 / Math.pow(2, r);
                const roundMatches = [];
                for (let i = 0; i < matchesInRound; i++) {
                    roundMatches.push({
                        id: (0, crypto_1.randomUUID)(),
                        groupId: groupWinners.id,
                        roundNumber: r,
                        matchOrder: i + 1,
                        bracketBranch: 'MAIN',
                        status: 'SCHEDULED',
                        isBye: false,
                        nextMatchId: null,
                        loserNextMatchId: null,
                        participant1Id: null,
                        participant2Id: null,
                        winnerId: null,
                        p1SetsWon: 0,
                        p2SetsWon: 0,
                        totalSetsPlayed: 0,
                        tournamentId,
                        stageId: stage.id,
                    });
                }
                winnersMatchesByRound.set(r, roundMatches);
            }
            if (winnersRounds >= 2) {
                const r1MatchesCount = powerOf2 / 4;
                const r1Matches = [];
                for (let i = 0; i < r1MatchesCount; i++) {
                    r1Matches.push({
                        id: (0, crypto_1.randomUUID)(),
                        groupId: groupLosers.id,
                        roundNumber: 1,
                        matchOrder: i + 1,
                        bracketBranch: 'LOSERS',
                        status: 'SCHEDULED',
                        isBye: false,
                        nextMatchId: null,
                        loserNextMatchId: null,
                        participant1Id: null,
                        participant2Id: null,
                        winnerId: null,
                        p1SetsWon: 0,
                        p2SetsWon: 0,
                        totalSetsPlayed: 0,
                        tournamentId,
                        stageId: stage.id,
                    });
                }
                losersMatchesByRound.set(1, r1Matches);
                for (let r = 2; r <= winnersRounds; r++) {
                    const matchesCount2r2 = powerOf2 / Math.pow(2, r);
                    const round2r2Matches = [];
                    for (let i = 0; i < matchesCount2r2; i++) {
                        round2r2Matches.push({
                            id: (0, crypto_1.randomUUID)(),
                            groupId: groupLosers.id,
                            roundNumber: 2 * r - 2,
                            matchOrder: i + 1,
                            bracketBranch: 'LOSERS',
                            status: 'SCHEDULED',
                            isBye: false,
                            nextMatchId: null,
                            loserNextMatchId: null,
                            participant1Id: null,
                            participant2Id: null,
                            winnerId: null,
                            p1SetsWon: 0,
                            p2SetsWon: 0,
                            totalSetsPlayed: 0,
                            tournamentId,
                            stageId: stage.id,
                        });
                    }
                    losersMatchesByRound.set(2 * r - 2, round2r2Matches);
                    if (r < winnersRounds) {
                        const matchesCount2r1 = powerOf2 / Math.pow(2, r + 1);
                        const round2r1Matches = [];
                        for (let i = 0; i < matchesCount2r1; i++) {
                            round2r1Matches.push({
                                id: (0, crypto_1.randomUUID)(),
                                groupId: groupLosers.id,
                                roundNumber: 2 * r - 1,
                                matchOrder: i + 1,
                                bracketBranch: 'LOSERS',
                                status: 'SCHEDULED',
                                isBye: false,
                                nextMatchId: null,
                                loserNextMatchId: null,
                                participant1Id: null,
                                participant2Id: null,
                                winnerId: null,
                                p1SetsWon: 0,
                                p2SetsWon: 0,
                                totalSetsPlayed: 0,
                                tournamentId,
                                stageId: stage.id,
                            });
                        }
                        losersMatchesByRound.set(2 * r - 1, round2r1Matches);
                    }
                }
            }
            const gf1 = {
                id: (0, crypto_1.randomUUID)(),
                groupId: groupGF.id,
                roundNumber: 1,
                matchOrder: 1,
                bracketBranch: 'GRAND_FINALS',
                status: 'SCHEDULED',
                isBye: false,
                nextMatchId: null,
                loserNextMatchId: null,
                participant1Id: null,
                participant2Id: null,
                winnerId: null,
                p1SetsWon: 0,
                p2SetsWon: 0,
                totalSetsPlayed: 0,
                tournamentId,
                stageId: stage.id,
            };
            for (let r = 1; r <= winnersRounds; r++) {
                const currentRound = winnersMatchesByRound.get(r);
                const nextRound = winnersMatchesByRound.get(r + 1);
                for (let i = 0; i < currentRound.length; i++) {
                    if (r < winnersRounds && nextRound) {
                        currentRound[i].nextMatchId = nextRound[Math.floor(i / 2)].id;
                    }
                    else if (r === winnersRounds) {
                        currentRound[i].nextMatchId = gf1.id;
                    }
                    if (r === 1) {
                        const losersR1 = losersMatchesByRound.get(1);
                        const targetIndex = (0, bracket_advancement_helper_1.resolveWinnersLoserTargetIndex)(r, i, currentRound.length);
                        currentRound[i].loserNextMatchId = losersR1[targetIndex].id;
                    }
                    else {
                        const losersTargetRound = losersMatchesByRound.get(2 * r - 2);
                        const targetIndex = (0, bracket_advancement_helper_1.resolveWinnersLoserTargetIndex)(r, i, currentRound.length);
                        currentRound[i].loserNextMatchId = losersTargetRound[targetIndex].id;
                    }
                }
            }
            if (winnersRounds >= 2) {
                for (let lr = 1; lr <= losersRounds; lr++) {
                    const currentRound = losersMatchesByRound.get(lr);
                    const nextRound = (lr === losersRounds) ? null : losersMatchesByRound.get(lr + 1);
                    for (let i = 0; i < currentRound.length; i++) {
                        if (lr === losersRounds) {
                            currentRound[i].nextMatchId = gf1.id;
                        }
                        else if (nextRound) {
                            const nextIndex = lr % 2 !== 0 ? i : Math.floor(i / 2);
                            currentRound[i].nextMatchId = nextRound[nextIndex]?.id || null;
                        }
                    }
                }
            }
            const sortedParticipants = [...participants];
            if (seedingType === 'RANDOM') {
                for (let i = sortedParticipants.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    const temp = sortedParticipants[i];
                    sortedParticipants[i] = sortedParticipants[j];
                    sortedParticipants[j] = temp;
                }
            }
            else {
                sortedParticipants.sort((a, b) => (a.seed || 999) - (b.seed || 999));
            }
            const seedingOrder = this.getSeedingOrder(powerOf2);
            const slots = new Array(powerOf2).fill(null);
            for (let i = 0; i < powerOf2; i++) {
                const seedRank = seedingOrder[i];
                if (seedRank <= numParticipants) {
                    slots[i] = sortedParticipants[seedRank - 1].id;
                }
            }
            const w1Matches = winnersMatchesByRound.get(1);
            for (let i = 0; i < w1Matches.length; i++) {
                w1Matches[i].participant1Id = slots[2 * i];
                w1Matches[i].participant2Id = slots[2 * i + 1];
            }
            const allMatchesList = [];
            for (let r = 1; r <= winnersRounds; r++) {
                allMatchesList.push(...winnersMatchesByRound.get(r));
            }
            if (winnersRounds >= 2) {
                for (let lr = 1; lr <= losersRounds; lr++) {
                    allMatchesList.push(...losersMatchesByRound.get(lr));
                }
            }
            allMatchesList.push(gf1);
            const matchMap = new Map(allMatchesList.map(m => [m.id, m]));
            const propagateInMemoryByes = (mId) => {
                const m = matchMap.get(mId);
                if (!m || m.status === 'COMPLETED')
                    return;
                const incomingMatches = allMatchesList.filter((src) => src.nextMatchId === m.id || src.loserNextMatchId === m.id);
                const allIncomingCompleted = incomingMatches.every((src) => src.status === 'COMPLETED');
                if (!allIncomingCompleted)
                    return;
                const p1 = m.participant1Id;
                const p2 = m.participant2Id;
                if (!p1 && !p2) {
                    m.status = 'COMPLETED';
                    m.winnerId = null;
                    m.isBye = true;
                }
                else if (p1 && !p2) {
                    m.status = 'COMPLETED';
                    m.winnerId = p1;
                    m.isBye = true;
                    advanceWinnerInMemory(m);
                    advanceLoserInMemory(m);
                }
                else if (!p1 && p2) {
                    m.status = 'COMPLETED';
                    m.winnerId = p2;
                    m.isBye = true;
                    advanceWinnerInMemory(m);
                    advanceLoserInMemory(m);
                }
            };
            const advanceWinnerInMemory = (completed) => {
                if (!completed.nextMatchId || !completed.winnerId)
                    return;
                const next = matchMap.get(completed.nextMatchId);
                if (!next)
                    return;
                const targetSlot = (0, bracket_advancement_helper_1.resolveWinnerTargetSlot)({
                    sourceBranch: completed.bracketBranch,
                    sourceRoundNumber: completed.roundNumber,
                    sourceMatchOrder: completed.matchOrder,
                    targetBranch: next.bracketBranch,
                });
                next[targetSlot] = completed.winnerId;
                propagateInMemoryByes(next.id);
            };
            const advanceLoserInMemory = (completed) => {
                if (!completed.loserNextMatchId)
                    return;
                const next = matchMap.get(completed.loserNextMatchId);
                if (!next)
                    return;
                const loserId = (completed.winnerId === completed.participant1Id)
                    ? completed.participant2Id
                    : completed.participant1Id;
                const targetSlot = (0, bracket_advancement_helper_1.resolveLoserTargetSlot)({
                    sourceRoundNumber: completed.roundNumber,
                    sourceMatchOrder: completed.matchOrder,
                });
                next[targetSlot] = loserId;
                propagateInMemoryByes(next.id);
            };
            for (const m of winnersMatchesByRound.get(1)) {
                propagateInMemoryByes(m.id);
            }
            if (winnersRounds >= 2) {
                for (const m of losersMatchesByRound.get(1)) {
                    propagateInMemoryByes(m.id);
                }
            }
            await tx.insert(schema.matches).values(gf1);
            if (winnersRounds >= 2) {
                for (let lr = losersRounds; lr >= 1; lr--) {
                    await tx.insert(schema.matches).values(losersMatchesByRound.get(lr));
                }
            }
            for (let r = winnersRounds; r >= 1; r--) {
                await tx.insert(schema.matches).values(winnersMatchesByRound.get(r));
            }
            return {
                message: 'Sơ đồ nhánh thắng/thua đã được tạo thành công',
                stageId: stage.id,
                totalMatches: allMatchesList.length,
            };
        });
    }
    async generateRoundRobin(tournamentId, userId, divisionId, seedingType) {
        return await this.db.transaction(async (tx) => {
            const [tournament] = await tx
                .select()
                .from(schema.tournaments)
                .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId))
                .limit(1);
            if (!tournament)
                throw new common_1.BadRequestException('Giải đấu không tồn tại');
            const participants = await tx
                .select()
                .from(schema.tournamentParticipants)
                .where(divisionId
                ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentDivisionId, divisionId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.isMock, true), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.teamStatus, 'COMPLETE')))
                : (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.isMock, true), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.teamStatus, 'COMPLETE'))));
            const numParticipants = participants.length;
            if (numParticipants < 2) {
                throw new common_1.BadRequestException('Cần ít nhất 2 đội để tạo bảng đấu vòng tròn');
            }
            await tx
                .update(schema.tournamentStages)
                .set({ deletedAt: new Date() })
                .where(divisionId
                ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentDivisionId, divisionId))
                : (0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentId, tournamentId));
            const config = (tournament.tournamentConfig || {});
            let divisionConfig = {};
            if (divisionId) {
                const divisions = await tx
                    .select()
                    .from(schema.tournamentDivisions)
                    .where((0, drizzle_orm_1.eq)(schema.tournamentDivisions.id, divisionId))
                    .limit(1);
                divisionConfig = (0, round_robin_config_1.asConfigRecord)(divisions[0]?.roundConfig) || {};
            }
            const tournamentGroupsConfig = (0, round_robin_config_1.asConfigRecord)(config.groupsConfig) || {};
            const divisionGroupsConfig = (0, round_robin_config_1.asConfigRecord)(divisionConfig.groupsConfig) || {};
            const groupsConfig = { ...tournamentGroupsConfig, ...divisionGroupsConfig };
            const scoring = {
                ...((0, round_robin_config_1.asConfigRecord)(config.scoring) || {}),
                ...((0, round_robin_config_1.asConfigRecord)(divisionConfig.scoring) || {}),
                ...((0, round_robin_config_1.asConfigRecord)(groupsConfig.scoring) || {}),
            };
            const maxGroupSize = Number(groupsConfig.teamsPerGroup ??
                groupsConfig.teams_per_group ??
                groupsConfig.maxGroupSize ??
                config.roundRobinGroupSize ??
                15);
            const winPoints = typeof scoring.winPoints === 'number' ? scoring.winPoints : 3;
            const drawPoints = typeof scoring.drawPoints === 'number' ? scoring.drawPoints : 1;
            const lossPoints = typeof scoring.lossPoints === 'number' ? scoring.lossPoints : 0;
            const tiebreakerRules = {
                primary: 'H2H_POINTS',
                secondary: ['SET_DIFF', 'POINT_DIFF'],
                ...((0, round_robin_config_1.asConfigRecord)(config.tiebreakerRules) || {}),
                ...((0, round_robin_config_1.asConfigRecord)(divisionConfig.tiebreakerRules) || {}),
            };
            const roundRobinLegs = (0, round_robin_config_1.resolveRoundsToPlay)(divisionConfig, { groupsConfig }, config);
            const configuredGroups = (0, round_robin_config_1.resolveConfiguredGroups)(divisionConfig, config);
            const stageSportRuleOverrides = {
                ...(0, round_robin_config_1.extractSportRuleOverrides)(config),
                ...(0, round_robin_config_1.extractSportRuleOverrides)(tournamentGroupsConfig),
                ...(0, round_robin_config_1.extractSportRuleOverrides)(divisionConfig),
                ...(0, round_robin_config_1.extractSportRuleOverrides)(divisionGroupsConfig),
            };
            if (!Number.isInteger(maxGroupSize) || maxGroupSize < 2 || maxGroupSize > 15) {
                throw new common_1.BadRequestException('Bảng đấu vòng tròn hỗ trợ từ 2 đến tối đa 15 đội/bảng. Với số lượng đội vượt quá 15, vui lòng chọn thể thức Vòng bảng và Nhánh đấu (Group Stage + Knockout).');
            }
            if (!Number.isInteger(roundRobinLegs) || roundRobinLegs < 1 || roundRobinLegs > 5) {
                throw new common_1.BadRequestException('Số lượt vòng tròn phải nằm trong khoảng 1-5');
            }
            const [stage] = await tx
                .insert(schema.tournamentStages)
                .values({
                tournamentId,
                name: 'Group Stage',
                type: 'ROUND_ROBIN',
                order: 1,
                tournamentDivisionId: divisionId ?? null,
                roundConfig: {
                    ...stageSportRuleOverrides,
                    scoring: {
                        ...((0, round_robin_config_1.asConfigRecord)(stageSportRuleOverrides.scoring) || {}),
                        winPoints,
                        drawPoints,
                        lossPoints,
                    },
                    tiebreakerRules,
                    maxGroupSize,
                    roundsToPlay: roundRobinLegs,
                },
            })
                .returning();
            const sortedParticipants = [...participants];
            if (seedingType === 'SEEDED') {
                sortedParticipants.sort((a, b) => (a.seed || 999) - (b.seed || 999));
            }
            else {
                for (let i = sortedParticipants.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    const temp = sortedParticipants[i];
                    sortedParticipants[i] = sortedParticipants[j];
                    sortedParticipants[j] = temp;
                }
            }
            const requestedCount = groupsConfig.numGroups ?? groupsConfig.num_groups ?? config.numberOfGroups;
            const numGroups = (0, round_robin_config_1.resolveRoundRobinGroupCount)({ ...groupsConfig, ...(requestedCount !== undefined ? { numGroups: requestedCount } : {}) }, configuredGroups, numParticipants, maxGroupSize);
            let groupParticipants;
            try {
                groupParticipants = (0, round_robin_config_1.allocateRoundRobinGroups)(sortedParticipants, numGroups, configuredGroups, maxGroupSize);
            }
            catch (error) {
                throw new common_1.BadRequestException(error instanceof Error ? error.message : 'Cấu hình bảng không hợp lệ');
            }
            const groups = [];
            for (let g = 0; g < numGroups; g++) {
                const [newGroup] = await tx
                    .insert(schema.tournamentGroups)
                    .values({
                    stageId: stage.id,
                    name: configuredGroups[g]?.name || (numGroups > 1 ? `Bảng ${String.fromCharCode(65 + g)}` : 'Vòng bảng'),
                    roundConfig: configuredGroups[g]?.roundConfig || null,
                })
                    .returning();
                groups.push(newGroup);
                for (const p of groupParticipants[g]) {
                    await tx.insert(schema.groupStandings).values({
                        groupId: newGroup.id,
                        participantId: p.id,
                        played: 0,
                        won: 0,
                        lost: 0,
                        draws: 0,
                        pointsFor: 0,
                        pointsAgainst: 0,
                        totalPoints: 0,
                        updatedAt: new Date(),
                    });
                }
            }
            const allMatchesToInsert = [];
            let globalMatchCounter = 1;
            for (let g = 0; g < groups.length; g++) {
                const group = groups[g];
                const participantIds = groupParticipants[g].map(p => p.id);
                for (const scheduled of (0, round_robin_config_1.buildRoundRobinSchedule)(participantIds, roundRobinLegs)) {
                    allMatchesToInsert.push({
                        id: (0, crypto_1.randomUUID)(),
                        groupId: group.id,
                        roundNumber: scheduled.roundNumber,
                        matchOrder: globalMatchCounter++,
                        bracketBranch: 'MAIN',
                        status: 'SCHEDULED',
                        isBye: false,
                        participant1Id: scheduled.participant1Id,
                        participant2Id: scheduled.participant2Id,
                        winnerId: null,
                        p1SetsWon: 0,
                        p2SetsWon: 0,
                        totalSetsPlayed: 0,
                        nextMatchId: null,
                        loserNextMatchId: null,
                        tournamentId,
                        stageId: stage.id,
                        updatedAt: new Date(),
                    });
                }
            }
            if (allMatchesToInsert.length > 0) {
                await tx.insert(schema.matches).values(allMatchesToInsert);
            }
            return {
                message: 'Đã tạo bảng đấu vòng tròn thành công',
                stageId: stage.id,
                totalMatches: allMatchesToInsert.length,
            };
        });
    }
    getSeedingOrder(size) {
        let order = [1];
        while (order.length < size) {
            const nextOrder = [];
            const currentSize = order.length * 2;
            for (const x of order) {
                nextOrder.push(x);
                nextOrder.push(currentSize + 1 - x);
            }
            order = nextOrder;
        }
        return order;
    }
    advanceWinner(completedMatch, matchNodesByRound) {
        if (!completedMatch.nextMatchId || !completedMatch.winnerId)
            return;
        const nextRound = completedMatch.roundNumber + 1;
        const nextRoundMatches = matchNodesByRound.get(nextRound);
        if (!nextRoundMatches)
            return;
        const nextMatch = nextRoundMatches.find((m) => m.id === completedMatch.nextMatchId);
        if (nextMatch) {
            if (completedMatch.matchOrder % 2 !== 0) {
                nextMatch.participant1Id = completedMatch.winnerId;
            }
            else {
                nextMatch.participant2Id = completedMatch.winnerId;
            }
            const siblingMatchOrder = completedMatch.matchOrder % 2 !== 0
                ? completedMatch.matchOrder + 1
                : completedMatch.matchOrder - 1;
            const currentRoundMatches = matchNodesByRound.get(completedMatch.roundNumber);
            const siblingMatch = currentRoundMatches.find(m => m.matchOrder === siblingMatchOrder);
            if (!siblingMatch || (siblingMatch.status === 'COMPLETED' && !siblingMatch.winnerId)) {
                nextMatch.status = 'COMPLETED';
                nextMatch.winnerId = completedMatch.winnerId;
                nextMatch.isBye = true;
                this.advanceWinner(nextMatch, matchNodesByRound);
            }
        }
    }
    async resolveTiebreakers(tx, tournamentId, stageId, configuredGroupId, standings, _tiebreakerRules) {
        void _tiebreakerRules;
        const pointGroups = new Map();
        for (const s of standings) {
            const list = pointGroups.get(s.totalPoints) || [];
            list.push({ participantId: s.participantId, pointsFor: s.pointsFor, pointsAgainst: s.pointsAgainst });
            pointGroups.set(s.totalPoints, list);
        }
        const rankedOrder = [];
        for (const [, group] of pointGroups) {
            if (group.length === 1) {
                rankedOrder.push(group[0].participantId);
            }
            else if (group.length === 2) {
                const { maxRound, maxOrder } = await this.getMaxRoundAndOrder(tx, stageId);
                const groups = await tx
                    .select()
                    .from(schema.tournamentGroups)
                    .where((0, drizzle_orm_1.eq)(schema.tournamentGroups.id, configuredGroupId))
                    .limit(1);
                const groupId = groups[0]?.id;
                if (groupId) {
                    await tx.insert(schema.matches).values({
                        id: (0, crypto_1.randomUUID)(),
                        tournamentId,
                        stageId,
                        groupId,
                        participant1Id: group[0].participantId,
                        participant2Id: group[1].participantId,
                        roundNumber: maxRound + 1,
                        matchOrder: maxOrder + 1,
                        bracketBranch: 'PLAYOFF',
                        status: 'SCHEDULED',
                        isBye: false,
                        p1SetsWon: 0,
                        p2SetsWon: 0,
                        totalSetsPlayed: 0,
                        nextMatchId: null,
                        loserNextMatchId: null,
                        winnerId: null,
                        updatedAt: new Date(),
                    });
                    rankedOrder.push(group[0].participantId, group[1].participantId);
                }
            }
            else if (group.length === 3) {
                const { maxRound, maxOrder } = await this.getMaxRoundAndOrder(tx, stageId);
                const groups = await tx
                    .select()
                    .from(schema.tournamentGroups)
                    .where((0, drizzle_orm_1.eq)(schema.tournamentGroups.id, configuredGroupId))
                    .limit(1);
                const groupId = groups[0]?.id;
                if (groupId) {
                    const pairs = [[group[0].participantId, group[1].participantId], [group[1].participantId, group[2].participantId], [group[0].participantId, group[2].participantId]];
                    for (let i = 0; i < pairs.length; i++) {
                        await tx.insert(schema.matches).values({
                            id: (0, crypto_1.randomUUID)(),
                            tournamentId,
                            stageId,
                            groupId,
                            participant1Id: pairs[i][0],
                            participant2Id: pairs[i][1],
                            roundNumber: maxRound + 1,
                            matchOrder: maxOrder + 1 + i,
                            bracketBranch: 'PLAYOFF',
                            status: 'SCHEDULED',
                            isBye: false,
                            p1SetsWon: 0,
                            p2SetsWon: 0,
                            totalSetsPlayed: 0,
                            nextMatchId: null,
                            loserNextMatchId: null,
                            winnerId: null,
                            updatedAt: new Date(),
                        });
                    }
                    rankedOrder.push(...group.map(g => g.participantId));
                }
            }
            else {
                group.sort((a, b) => {
                    const diffA = a.pointsFor - a.pointsAgainst;
                    const diffB = b.pointsFor - b.pointsAgainst;
                    return diffB - diffA;
                });
                rankedOrder.push(...group.map(g => g.participantId));
            }
        }
        return rankedOrder;
    }
    async getMaxRoundAndOrder(tx, stageId) {
        const result = await tx
            .select({
            maxRound: (0, drizzle_orm_1.sql) `COALESCE(MAX(${schema.matches.roundNumber}), 0)`,
            maxOrder: (0, drizzle_orm_1.sql) `COALESCE(MAX(${schema.matches.matchOrder}), 0)`,
        })
            .from(schema.matches)
            .where((0, drizzle_orm_1.eq)(schema.matches.stageId, stageId));
        return result[0] || { maxRound: 0, maxOrder: 0 };
    }
    async generateGroupStageKnockout(tournamentId, userId, divisionId, seedingType) {
        return await this.db.transaction(async (tx) => {
            const [tournament] = await tx
                .select()
                .from(schema.tournaments)
                .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId))
                .limit(1);
            if (!tournament)
                throw new common_1.BadRequestException('Giải đấu không tồn tại');
            const participants = await tx
                .select()
                .from(schema.tournamentParticipants)
                .where(divisionId
                ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentDivisionId, divisionId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.isMock, true), (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.teamStatus, 'COMPLETE'), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.isPaid, true))))
                : (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.isMock, true), (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.teamStatus, 'COMPLETE'), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.isPaid, true)))));
            const numParticipants = participants.length;
            if (numParticipants < 2) {
                throw new common_1.BadRequestException('Cần ít nhất 2 đội tham gia');
            }
            let division;
            if (divisionId) {
                const divs = await tx
                    .select()
                    .from(schema.tournamentDivisions)
                    .where((0, drizzle_orm_1.eq)(schema.tournamentDivisions.id, divisionId))
                    .limit(1);
                division = divs[0];
            }
            const config = (tournament.tournamentConfig || {});
            const divConfig = division?.roundConfig || {};
            const tournamentGroupsConfig = (0, round_robin_config_1.asConfigRecord)(config.groupsConfig) || {};
            const divisionGroupsConfig = (0, round_robin_config_1.asConfigRecord)(divConfig.groupsConfig) || {};
            const groupsConfig = { ...tournamentGroupsConfig, ...divisionGroupsConfig };
            const advancementConfig = {
                ...((0, round_robin_config_1.asConfigRecord)(config.advancementConfig) || {}),
                ...((0, round_robin_config_1.asConfigRecord)(divConfig.advancementConfig) || {}),
            };
            const playoffConfig = {
                ...((0, round_robin_config_1.asConfigRecord)(config.playoffConfig) || {}),
                ...((0, round_robin_config_1.asConfigRecord)(divConfig.playoffConfig) || {}),
            };
            const scoring = {
                winPoints: 3,
                drawPoints: 1,
                lossPoints: 0,
                ...((0, round_robin_config_1.asConfigRecord)(config.scoring) || {}),
                ...((0, round_robin_config_1.asConfigRecord)(divConfig.scoring) || {}),
                ...((0, round_robin_config_1.asConfigRecord)(groupsConfig.scoring) || {}),
            };
            const tiebreakerRules = {
                primary: 'H2H_POINTS',
                secondary: ['SET_DIFF', 'POINT_DIFF'],
                ...((0, round_robin_config_1.asConfigRecord)(config.tiebreakerRules) || {}),
                ...((0, round_robin_config_1.asConfigRecord)(divConfig.tiebreakerRules) || {}),
            };
            const stageSportRuleOverrides = {
                ...(0, round_robin_config_1.extractSportRuleOverrides)(config),
                ...(0, round_robin_config_1.extractSportRuleOverrides)(tournamentGroupsConfig),
                ...(0, round_robin_config_1.extractSportRuleOverrides)(divConfig),
                ...(0, round_robin_config_1.extractSportRuleOverrides)(divisionGroupsConfig),
            };
            const configuredGroups = (0, round_robin_config_1.resolveConfiguredGroups)(divConfig, config);
            const playoffSportRuleOverrides = (0, round_robin_config_1.extractSportRuleOverrides)(playoffConfig);
            const requestedNumGroups = (0, round_robin_config_1.resolveRoundRobinGroupCount)({ ...groupsConfig, ...(config.numberOfGroups !== undefined && groupsConfig.numGroups === undefined && groupsConfig.num_groups === undefined
                    ? { numGroups: config.numberOfGroups }
                    : {}) }, configuredGroups, numParticipants, Number(groupsConfig.teamsPerGroup ?? groupsConfig.teams_per_group) || 8);
            const configuredGroupCapacity = configuredGroups.reduce((maximum, group) => Math.max(maximum, group.participantIds.length), 0);
            const teamsPerGroup = Number(groupsConfig.teamsPerGroup ?? groupsConfig.teams_per_group) || Math.max(2, configuredGroupCapacity, Math.ceil(numParticipants / requestedNumGroups));
            const teamsAdvancing = Number(advancementConfig.teamsAdvancing ?? config.teamsAdvancingPerGroup ?? 1);
            const allowWildcard = advancementConfig.allowWildcardThird || false;
            const wildcardTeams = advancementConfig.wildcardTeamsAdvancing || 0;
            const playoffType = String(playoffConfig.type ?? config.knockoutBracketType ?? 'SINGLE_ELIMINATION');
            const rtp = (0, round_robin_config_1.resolveRoundsToPlay)(divConfig, { groupsConfig }, config);
            if (numParticipants < 2) {
                throw new common_1.BadRequestException('Cần ít nhất 2 đội tham gia');
            }
            const actualNumGroups = requestedNumGroups;
            if (!Number.isInteger(actualNumGroups) || actualNumGroups < 2) {
                throw new common_1.BadRequestException('Cần ít nhất 2 bảng để tạo vòng loại trực tiếp');
            }
            if (!Number.isInteger(teamsPerGroup) || teamsPerGroup < 2) {
                throw new common_1.BadRequestException('Mỗi bảng cần ít nhất 2 đội');
            }
            if (actualNumGroups > Math.floor(numParticipants / 2)) {
                throw new common_1.BadRequestException('Số bảng quá nhiều so với số đội tham gia hiện tại');
            }
            if (actualNumGroups * teamsPerGroup < numParticipants) {
                throw new common_1.BadRequestException('Cấu hình bảng không đủ chỗ cho tất cả đội tham gia');
            }
            const smallestGroupSize = Math.floor(numParticipants / actualNumGroups);
            if (!Number.isInteger(teamsAdvancing) || teamsAdvancing < 1 || teamsAdvancing >= smallestGroupSize) {
                throw new common_1.BadRequestException('Số số đi tiếp mỗi bảng không hợp lệ');
            }
            if (allowWildcard && (!Number.isInteger(wildcardTeams) || wildcardTeams < 1 || wildcardTeams > actualNumGroups)) {
                throw new common_1.BadRequestException('Số đội wildcard đi tiếp không hợp lệ');
            }
            if (!Number.isInteger(rtp) || rtp < 1 || rtp > 5) {
                throw new common_1.BadRequestException('Số lượt vòng bảng phải nằm trong khoảng 1-5');
            }
            await tx
                .update(schema.tournamentStages)
                .set({ deletedAt: new Date() })
                .where(divisionId
                ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentDivisionId, divisionId))
                : (0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentId, tournamentId));
            const winPts = typeof scoring.winPoints === 'number' ? scoring.winPoints : 3;
            const drawPts = typeof scoring.drawPoints === 'number' ? scoring.drawPoints : 1;
            const lossPts = typeof scoring.lossPoints === 'number' ? scoring.lossPoints : 0;
            const [stage1] = await tx
                .insert(schema.tournamentStages)
                .values({
                tournamentId,
                name: 'Vòng bảng',
                type: 'ROUND_ROBIN',
                order: 1,
                tournamentDivisionId: divisionId ?? null,
                roundConfig: {
                    ...stageSportRuleOverrides,
                    scoring: {
                        ...((0, round_robin_config_1.asConfigRecord)(stageSportRuleOverrides.scoring) || {}),
                        winPoints: winPts,
                        drawPoints: drawPts,
                        lossPoints: lossPts,
                    },
                    tiebreakerRules,
                    advanceConfig: {
                        teamsAdvancing: advancementConfig.teamsAdvancing || 1,
                        allowWildcardThird: allowWildcard,
                        wildcardTeamsAdvancing: wildcardTeams,
                    },
                    maxGroupSize: teamsPerGroup,
                    roundsToPlay: rtp,
                },
            })
                .returning();
            const sortedParticipants = [...participants];
            if (seedingType === 'SEEDED') {
                sortedParticipants.sort((a, b) => (a.seed || 999) - (b.seed || 999));
            }
            else {
                for (let i = sortedParticipants.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    const temp = sortedParticipants[i];
                    sortedParticipants[i] = sortedParticipants[j];
                    sortedParticipants[j] = temp;
                }
            }
            let groupParticipants;
            try {
                groupParticipants = (0, round_robin_config_1.allocateRoundRobinGroups)(sortedParticipants, actualNumGroups, configuredGroups, teamsPerGroup);
            }
            catch (error) {
                throw new common_1.BadRequestException(error instanceof Error ? error.message : 'Cấu hình bảng không hợp lệ');
            }
            const groups = [];
            for (let g = 0; g < actualNumGroups; g++) {
                const [newGroup] = await tx
                    .insert(schema.tournamentGroups)
                    .values({
                    stageId: stage1.id,
                    name: configuredGroups[g]?.name || `Bảng ${String.fromCharCode(65 + g)}`,
                    roundConfig: configuredGroups[g]?.roundConfig || null,
                })
                    .returning();
                groups.push(newGroup);
                for (const p of groupParticipants[g]) {
                    await tx.insert(schema.groupStandings).values({
                        groupId: newGroup.id,
                        participantId: p.id,
                        played: 0,
                        won: 0,
                        lost: 0,
                        draws: 0,
                        pointsFor: 0,
                        pointsAgainst: 0,
                        totalPoints: 0,
                        updatedAt: new Date(),
                    });
                }
            }
            const allMatchesToInsert = [];
            let globalMatchCounter = 1;
            for (let g = 0; g < groups.length; g++) {
                const group = groups[g];
                const participantIds = groupParticipants[g].map(p => p.id);
                for (const scheduled of (0, round_robin_config_1.buildRoundRobinSchedule)(participantIds, rtp)) {
                    allMatchesToInsert.push({
                        id: (0, crypto_1.randomUUID)(),
                        groupId: group.id,
                        roundNumber: scheduled.roundNumber,
                        matchOrder: globalMatchCounter++,
                        bracketBranch: 'MAIN',
                        status: 'SCHEDULED',
                        isBye: false,
                        participant1Id: scheduled.participant1Id,
                        participant2Id: scheduled.participant2Id,
                        winnerId: null,
                        p1SetsWon: 0,
                        p2SetsWon: 0,
                        totalSetsPlayed: 0,
                        nextMatchId: null,
                        loserNextMatchId: null,
                        tournamentId,
                        stageId: stage1.id,
                        updatedAt: new Date(),
                    });
                }
            }
            if (allMatchesToInsert.length > 0) {
                await tx.insert(schema.matches).values(allMatchesToInsert);
            }
            const totalAdvancing = teamsAdvancing * actualNumGroups + (allowWildcard ? wildcardTeams : 0);
            const powerOf2 = Math.pow(2, Math.ceil(Math.log2(totalAdvancing)));
            const playoffTypeUpper = playoffType.toUpperCase();
            const [stage2] = await tx
                .insert(schema.tournamentStages)
                .values({
                tournamentId,
                name: playoffTypeUpper === 'DOUBLE_ELIMINATION' ? 'Vòng loại trực tiếp (Nhánh thua)' : 'Vòng loại trực tiếp',
                type: playoffTypeUpper,
                order: 2,
                tournamentDivisionId: divisionId ?? null,
                roundConfig: {
                    ...playoffSportRuleOverrides,
                    advanceMapping: {
                        numGroups: actualNumGroups,
                        teamsAdvancing,
                        allowWildcard: allowWildcard,
                        wildcardTeams,
                        totalAdvancing,
                    },
                },
            })
                .returning();
            if (playoffTypeUpper === 'SINGLE_ELIMINATION') {
                const [koGroup] = await tx
                    .insert(schema.tournamentGroups)
                    .values({
                    stageId: stage2.id,
                    name: 'Vòng loại trực tiếp',
                })
                    .returning();
                const totalRounds = Math.log2(powerOf2);
                const matchNodesByRound = new Map();
                for (let r = totalRounds; r >= 1; r--) {
                    const matchesInRound = Math.pow(2, totalRounds - r);
                    const roundMatches = [];
                    for (let i = 0; i < matchesInRound; i++) {
                        roundMatches.push({
                            id: (0, crypto_1.randomUUID)(),
                            groupId: koGroup.id,
                            roundNumber: r,
                            matchOrder: i + 1,
                            bracketBranch: 'MAIN',
                            status: 'SCHEDULED',
                            isBye: false,
                            nextMatchId: null,
                            loserNextMatchId: null,
                            participant1Id: null,
                            participant2Id: null,
                            winnerId: null,
                            p1SetsWon: 0,
                            p2SetsWon: 0,
                            totalSetsPlayed: 0,
                            tournamentId,
                            stageId: stage2.id,
                        });
                    }
                    matchNodesByRound.set(r, roundMatches);
                }
                for (let r = 1; r < totalRounds; r++) {
                    const currentRoundMatches = matchNodesByRound.get(r);
                    const nextRoundMatches = matchNodesByRound.get(r + 1);
                    for (let i = 0; i < currentRoundMatches.length; i++) {
                        const nextMatchIndex = Math.floor(i / 2);
                        currentRoundMatches[i].nextMatchId = nextRoundMatches[nextMatchIndex].id;
                    }
                }
                for (let r = totalRounds; r >= 1; r--) {
                    const roundMatches = matchNodesByRound.get(r);
                    if (roundMatches.length > 0) {
                        await tx.insert(schema.matches).values(roundMatches);
                    }
                }
            }
            else {
                const [koGroup] = await tx
                    .insert(schema.tournamentGroups)
                    .values({
                    stageId: stage2.id,
                    name: 'Vòng loại trực tiếp',
                })
                    .returning();
                const shape = (0, bracket_advancement_helper_1.getDoubleEliminationShape)(powerOf2);
                const winnersRounds = shape.winnersRounds;
                const winnersMatchesByRound = [];
                for (let r = 0; r < winnersRounds; r++) {
                    const matchesInRound = Math.pow(2, winnersRounds - 1 - r);
                    const roundMatches = [];
                    for (let i = 0; i < matchesInRound; i++) {
                        roundMatches.push({
                            id: (0, crypto_1.randomUUID)(),
                            groupId: koGroup.id,
                            roundNumber: r + 1,
                            matchOrder: i + 1,
                            bracketBranch: 'WINNERS',
                            status: 'SCHEDULED',
                            isBye: false,
                            nextMatchId: null,
                            loserNextMatchId: null,
                            participant1Id: null,
                            participant2Id: null,
                            winnerId: null,
                            p1SetsWon: 0,
                            p2SetsWon: 0,
                            totalSetsPlayed: 0,
                            tournamentId,
                            stageId: stage2.id,
                        });
                    }
                    winnersMatchesByRound.push(roundMatches);
                }
                const losersRounds = shape.losersRounds;
                const losersMatchesByRound = [];
                for (let r = 0; r < losersRounds; r++) {
                    const matchesInRound = shape.losersMatchCounts[r];
                    const roundMatches = [];
                    for (let i = 0; i < matchesInRound; i++) {
                        roundMatches.push({
                            id: (0, crypto_1.randomUUID)(),
                            groupId: koGroup.id,
                            roundNumber: winnersRounds + r + 1,
                            matchOrder: i + 1,
                            bracketBranch: 'LOSERS',
                            status: 'SCHEDULED',
                            isBye: false,
                            nextMatchId: null,
                            loserNextMatchId: null,
                            participant1Id: null,
                            participant2Id: null,
                            winnerId: null,
                            p1SetsWon: 0,
                            p2SetsWon: 0,
                            totalSetsPlayed: 0,
                            tournamentId,
                            stageId: stage2.id,
                        });
                    }
                    losersMatchesByRound.push(roundMatches);
                }
                const grandFinal = {
                    id: (0, crypto_1.randomUUID)(),
                    groupId: koGroup.id,
                    roundNumber: winnersRounds + losersRounds + 1,
                    matchOrder: 1,
                    bracketBranch: 'GRAND_FINALS',
                    status: 'SCHEDULED',
                    isBye: false,
                    nextMatchId: null,
                    loserNextMatchId: null,
                    participant1Id: null,
                    participant2Id: null,
                    winnerId: null,
                    p1SetsWon: 0,
                    p2SetsWon: 0,
                    totalSetsPlayed: 0,
                    tournamentId,
                    stageId: stage2.id,
                };
                for (let r = 0; r < winnersRounds - 1; r++) {
                    const currentRound = winnersMatchesByRound[r];
                    const nextRound = winnersMatchesByRound[r + 1];
                    for (let i = 0; i < currentRound.length; i++) {
                        const nextMatchIndex = Math.floor(i / 2);
                        currentRound[i].nextMatchId = nextRound[nextMatchIndex].id;
                    }
                }
                const lastWinnersRound = winnersMatchesByRound[winnersMatchesByRound.length - 1];
                if (lastWinnersRound) {
                    lastWinnersRound[0].nextMatchId = grandFinal.id;
                }
                for (let r = 0; r < losersRounds; r++) {
                    const currentRound = losersMatchesByRound[r];
                    const nextRound = losersMatchesByRound[r + 1];
                    if (nextRound) {
                        for (let i = 0; i < currentRound.length; i++) {
                            const nextMatchIndex = Math.floor(i / 2);
                            currentRound[i].nextMatchId = nextRound[nextMatchIndex].id;
                        }
                    }
                }
                const lastLosersRound = losersMatchesByRound[losersMatchesByRound.length - 1];
                if (lastLosersRound) {
                    lastLosersRound[0].nextMatchId = grandFinal.id;
                }
                const allMatches = [
                    ...winnersMatchesByRound.flat(),
                    ...losersMatchesByRound.flat(),
                    grandFinal,
                ];
                await tx.insert(schema.matches).values(allMatches);
            }
            return {
                message: 'Đã tạo bảng + vòng loại trực tiếp thành công',
                stage1Id: stage1.id,
                stage2Id: stage2.id,
                totalGroups: actualNumGroups,
                totalAdvancing,
            };
        });
    }
    async advanceStandings(tournamentId, divisionId, stageId) {
        return await this.db.transaction(async (tx) => {
            const [stage1] = await tx
                .select()
                .from(schema.tournamentStages)
                .where((0, drizzle_orm_1.eq)(schema.tournamentStages.id, stageId))
                .limit(1);
            if (!stage1)
                throw new common_1.BadRequestException('Không tìm thấy vòng đấu');
            if (stage1.type !== 'ROUND_ROBIN')
                throw new common_1.BadRequestException('Vòng đấu phải là hình thức vòng tròn');
            const advanceConfig = stage1.roundConfig?.advanceConfig || {};
            const teamsAdvancing = advanceConfig.teamsAdvancing || 1;
            const allowWildcard = advanceConfig.allowWildcardThird || false;
            const wildcardTeams = advanceConfig.wildcardTeamsAdvancing || 0;
            const stages = await tx
                .select()
                .from(schema.tournamentStages)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentId, tournamentId), divisionId ? (0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentDivisionId, divisionId) : undefined, (0, drizzle_orm_1.eq)(schema.tournamentStages.order, 2), (0, drizzle_orm_1.isNull)(schema.tournamentStages.deletedAt)))
                .limit(1);
            const stage2 = stages[0];
            if (!stage2)
                throw new common_1.BadRequestException('Chưa tìm thấy vòng loại trực tiếp (vòng 2). Vui lòng tạo sơ đồ trước.');
            const groups = await tx
                .select()
                .from(schema.tournamentGroups)
                .where((0, drizzle_orm_1.eq)(schema.tournamentGroups.stageId, stageId));
            const groupIds = groups.map((g) => g.id);
            const allStandings = await tx
                .select()
                .from(schema.groupStandings)
                .where((0, drizzle_orm_1.inArray)(schema.groupStandings.groupId, groupIds));
            const completedGroupMatches = await tx
                .select({
                groupId: schema.matches.groupId,
                participant1Id: schema.matches.participant1Id,
                participant2Id: schema.matches.participant2Id,
                winnerId: schema.matches.winnerId,
                scoreDetails: schema.matches.scoreDetails,
            })
                .from(schema.matches)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema.matches.groupId, groupIds), (0, drizzle_orm_1.eq)(schema.matches.status, 'COMPLETED'), (0, drizzle_orm_1.isNull)(schema.matches.deletedAt)));
            const advancingParticipants = [];
            for (let gi = 0; gi < groups.length; gi++) {
                const group = groups[gi];
                const groupStandings = allStandings.filter((s) => s.groupId === group.id);
                const orderedStandings = (0, football_standings_1.sortFootballStandings)(groupStandings, completedGroupMatches);
                groupStandings.splice(0, groupStandings.length, ...orderedStandings);
                const pointGroups = new Map();
                for (const s of groupStandings) {
                    const list = pointGroups.get(s.totalPoints) || [];
                    list.push(s);
                    pointGroups.set(s.totalPoints, list);
                }
                const hasFootballScore = completedGroupMatches.some((match) => {
                    const scoreDetails = match.scoreDetails;
                    return scoreDetails && typeof scoreDetails === 'object' &&
                        Boolean(scoreDetails.football);
                });
                for (const [, tiedGroup] of pointGroups) {
                    if (tiedGroup.length >= 2 && !hasFootballScore) {
                        await this.resolveTiebreakers(tx, tournamentId, stageId, group.id, tiedGroup.map(s => ({
                            participantId: s.participantId,
                            totalPoints: s.totalPoints,
                            pointsFor: s.pointsFor,
                            pointsAgainst: s.pointsAgainst,
                        })), { primary: 'H2H_POINTS', secondary: ['SET_DIFF', 'POINT_DIFF'] });
                    }
                }
                for (let r = 0; r < teamsAdvancing && r < groupStandings.length; r++) {
                    advancingParticipants.push({
                        participantId: groupStandings[r].participantId,
                        groupIndex: gi,
                        rank: r + 1,
                    });
                }
            }
            if (allowWildcard && wildcardTeams > 0) {
                const thirdPlaced = [];
                for (let gi = 0; gi < groups.length; gi++) {
                    const group = groups[gi];
                    const groupStandings = allStandings.filter((s) => s.groupId === group.id);
                    const orderedStandings = (0, football_standings_1.sortFootballStandings)(groupStandings, completedGroupMatches);
                    groupStandings.splice(0, groupStandings.length, ...orderedStandings);
                    if (groupStandings.length >= 3) {
                        thirdPlaced.push({
                            participantId: groupStandings[2].participantId,
                            pointsFor: groupStandings[2].pointsFor,
                            pointsAgainst: groupStandings[2].pointsAgainst,
                        });
                    }
                }
                thirdPlaced.sort((a, b) => {
                    const diffA = a.pointsFor - a.pointsAgainst;
                    const diffB = b.pointsFor - b.pointsAgainst;
                    if (diffB !== diffA)
                        return diffB - diffA;
                    if (b.pointsFor !== a.pointsFor)
                        return b.pointsFor - a.pointsFor;
                    return a.participantId.localeCompare(b.participantId);
                });
                for (let i = 0; i < Math.min(wildcardTeams, thirdPlaced.length); i++) {
                    advancingParticipants.push({
                        participantId: thirdPlaced[i].participantId,
                        groupIndex: -1,
                        rank: 3,
                    });
                }
            }
            const koMatches = await tx
                .select()
                .from(schema.matches)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.matches.stageId, stage2.id), (0, drizzle_orm_1.isNull)(schema.matches.deletedAt)))
                .orderBy(schema.matches.roundNumber, schema.matches.matchOrder);
            if (koMatches.length === 0) {
                throw new common_1.BadRequestException('Không tìm thấy trận đấu loại trực tiếp ở vòng 2');
            }
            const round1Matches = koMatches.filter((m) => m.roundNumber === 1);
            const advancingByGroup = new Map();
            for (const ap of advancingParticipants) {
                const list = advancingByGroup.get(ap.groupIndex) || [];
                list.push(ap);
                advancingByGroup.set(ap.groupIndex, list);
            }
            const numAdvGroups = advancingByGroup.size;
            let matchIdx = 0;
            for (let gi = 0; gi < numAdvGroups; gi++) {
                const groupAdv = advancingByGroup.get(gi) || [];
                if (groupAdv.length < 1)
                    continue;
                const nextGi = (gi + 1) % numAdvGroups;
                const nextGroupAdv = advancingByGroup.get(nextGi) || [];
                if (matchIdx < round1Matches.length) {
                    round1Matches[matchIdx].participant1Id = groupAdv[0]?.participantId || null;
                    round1Matches[matchIdx].participant2Id = nextGroupAdv[1]?.participantId || null;
                    matchIdx++;
                }
                if (matchIdx < round1Matches.length && nextGroupAdv.length > 0) {
                    round1Matches[matchIdx].participant1Id = nextGroupAdv[0]?.participantId || null;
                    round1Matches[matchIdx].participant2Id = groupAdv[1]?.participantId || null;
                    matchIdx++;
                }
            }
            for (const m of koMatches) {
                await tx
                    .update(schema.matches)
                    .set({
                    participant1Id: m.participant1Id,
                    participant2Id: m.participant2Id,
                    updatedAt: new Date(),
                })
                    .where((0, drizzle_orm_1.eq)(schema.matches.id, m.id));
            }
            return {
                message: 'Đã đưa đội đi tiếp vào vòng loại trực tiếp thành công',
                stage2Id: stage2.id,
                advancingParticipants: advancingParticipants.length,
            };
        });
    }
};
exports.BracketGeneratorService = BracketGeneratorService;
exports.BracketGeneratorService = BracketGeneratorService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.PG_CONNECTION)),
    __metadata("design:paramtypes", [Object])
], BracketGeneratorService);
//# sourceMappingURL=bracket-generator.service.js.map