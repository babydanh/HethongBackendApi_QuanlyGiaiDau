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
exports.FootballTeamEloService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const database_module_1 = require("../../database/database.module");
const schema = __importStar(require("../../database/schema"));
const football_team_elo_1 = require("./utils/football-team-elo");
const football_team_elo_outcome_1 = require("./utils/football-team-elo-outcome");
let FootballTeamEloService = class FootballTeamEloService {
    db;
    kFactor = 32;
    constructor(db) {
        this.db = db;
    }
    async getLeaderboard(categoryId, limit = 20, cursor, communityId) {
        const safeLimit = Math.min(Math.max(limit, 1), 100);
        let after;
        if (cursor) {
            try {
                after = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
            }
            catch {
                after = undefined;
            }
        }
        const rows = await this.db
            .select({
            id: schema.footballTeamRanks.id,
            teamId: schema.footballTeamRanks.teamId,
            teamName: schema.footballTeams.name,
            logoUrl: schema.footballTeams.logoUrl,
            eloPoints: schema.footballTeamRanks.eloPoints,
            tierId: schema.footballTeamRanks.tierId,
            tierName: schema.eloTiers.name,
            matchesPlayed: schema.footballTeamRanks.matchesPlayed,
            matchesWon: schema.footballTeamRanks.matchesWon,
            winStreak: schema.footballTeamRanks.winStreak,
            peakElo: schema.footballTeamRanks.peakElo,
        })
            .from(schema.footballTeamRanks)
            .innerJoin(schema.footballTeams, (0, drizzle_orm_1.eq)(schema.footballTeamRanks.teamId, schema.footballTeams.id))
            .innerJoin(schema.categories, (0, drizzle_orm_1.eq)(schema.categories.id, schema.footballTeamRanks.categoryId))
            .leftJoin(schema.eloTiers, (0, drizzle_orm_1.eq)(schema.footballTeamRanks.tierId, schema.eloTiers.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballTeamRanks.categoryId, categoryId), (0, drizzle_orm_1.eq)(schema.footballTeams.status, 'ACTIVE'), communityId
            ? (0, drizzle_orm_1.eq)(schema.footballTeams.communityId, communityId)
            : undefined, (0, drizzle_orm_1.sql) `coalesce(${schema.categories.categoryConfig}->>'isActive', 'true') <> 'false'`, after
            ? (0, drizzle_orm_1.sql) `(${schema.footballTeamRanks.eloPoints} < ${after.elo} OR (${schema.footballTeamRanks.eloPoints} = ${after.elo} AND ${schema.footballTeamRanks.id} < ${after.id}))`
            : undefined))
            .orderBy((0, drizzle_orm_1.sql) `${schema.footballTeamRanks.eloPoints} DESC`, (0, drizzle_orm_1.sql) `${schema.footballTeamRanks.id} DESC`)
            .limit(safeLimit + 1);
        const hasMore = rows.length > safeLimit;
        const data = rows.slice(0, safeLimit);
        const last = data.at(-1);
        return {
            data,
            meta: {
                limit: safeLimit,
                hasMore,
                nextCursor: hasMore && last
                    ? Buffer.from(JSON.stringify({ elo: last.eloPoints, id: last.id })).toString('base64url')
                    : null,
            },
        };
    }
    async processCompletedMatch(matchId) {
        const [match] = await this.db
            .select({
            participant1Id: schema.matches.participant1Id,
            participant2Id: schema.matches.participant2Id,
            status: schema.matches.status,
            winnerId: schema.matches.winnerId,
            scoreDetails: schema.matches.scoreDetails,
            tournamentId: schema.matches.tournamentId,
        })
            .from(schema.matches)
            .where((0, drizzle_orm_1.eq)(schema.matches.id, matchId))
            .limit(1);
        if (match?.status !== 'COMPLETED' || !match.participant1Id || !match.participant2Id)
            return { handled: false };
        const participants = await this.db
            .select({
            id: schema.tournamentParticipants.id,
            footballTeamId: schema.tournamentParticipants.footballTeamId,
        })
            .from(schema.tournamentParticipants)
            .where((0, drizzle_orm_1.inArray)(schema.tournamentParticipants.id, [
            match.participant1Id,
            match.participant2Id,
        ]));
        const p1 = participants.find((p) => p.id === match.participant1Id);
        const p2 = participants.find((p) => p.id === match.participant2Id);
        if (match.winnerId &&
            match.winnerId !== match.participant1Id &&
            match.winnerId !== match.participant2Id) {
            throw new Error(`Match ${matchId} has winnerId outside its football participants`);
        }
        if (!p1?.footballTeamId ||
            !p2?.footballTeamId ||
            p1.footballTeamId === p2.footballTeamId) {
            return { handled: false };
        }
        const [tournament] = await this.db
            .select({ categoryId: schema.tournaments.categoryId })
            .from(schema.tournaments)
            .where((0, drizzle_orm_1.eq)(schema.tournaments.id, match.tournamentId))
            .limit(1);
        if (!tournament?.categoryId)
            return { handled: false };
        return this.db.transaction(async (tx) => {
            await tx.execute((0, drizzle_orm_1.sql) `select pg_advisory_xact_lock(hashtext(${`football-elo:${matchId}`}))`);
            const teamIds = [...new Set([p1.footballTeamId, p2.footballTeamId])];
            for (const teamId of teamIds) {
                await tx
                    .insert(schema.footballTeamRanks)
                    .values({ teamId, categoryId: tournament.categoryId })
                    .onConflictDoNothing();
            }
            const lockedRanks = await tx
                .select()
                .from(schema.footballTeamRanks)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballTeamRanks.categoryId, tournament.categoryId), (0, drizzle_orm_1.inArray)(schema.footballTeamRanks.teamId, teamIds)))
                .for('update');
            const rankByTeamId = new Map(lockedRanks.map((rank) => [rank.teamId, rank]));
            const rank1 = rankByTeamId.get(p1.footballTeamId);
            const rank2 = rankByTeamId.get(p2.footballTeamId);
            if (!rank1)
                throw new Error(`Football rank missing for team ${p1.footballTeamId}`);
            if (!rank2)
                throw new Error(`Football rank missing for team ${p2.footballTeamId}`);
            const ranks = [rank1, rank2];
            const existing = await tx
                .select({ id: schema.footballEloEvents.id })
                .from(schema.footballEloEvents)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballEloEvents.matchId, matchId), (0, drizzle_orm_1.inArray)(schema.footballEloEvents.teamRankId, ranks.map((r) => r.id))));
            if (existing.length === 2)
                return { handled: true, alreadyProcessed: true };
            if (existing.length !== 0)
                throw new Error(`Incomplete football ELO events for match ${matchId}`);
            const scoreDetails = match.scoreDetails;
            const specialResult = scoreDetails?.specialResult;
            const specialAction = typeof specialResult?.action === 'string' ? specialResult.action : null;
            const { score1, score2, outcome1, outcome2 } = (0, football_team_elo_outcome_1.resolveFootballTeamEloOutcome)({
                winnerId: match.winnerId,
                participant1Id: match.participant1Id,
                participant2Id: match.participant2Id,
                specialAction,
            });
            const { delta1, delta2 } = (0, football_team_elo_1.calculateFootballTeamElo)(rank1.eloPoints, rank2.eloPoints, score1, this.kFactor);
            const now = new Date();
            const updates = [
                {
                    rank: rank1,
                    delta: delta1,
                    score: score1,
                    won: score1 === 1,
                    outcome: outcome1,
                },
                {
                    rank: rank2,
                    delta: delta2,
                    score: score2,
                    won: score2 === 1,
                    outcome: outcome2,
                },
            ];
            for (const item of updates) {
                const afterElo = Math.max(0, item.rank.eloPoints + item.delta);
                const [tier] = await tx
                    .select({ id: schema.eloTiers.id })
                    .from(schema.eloTiers)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.eloTiers.categoryId, tournament.categoryId), (0, drizzle_orm_1.sql) `${afterElo} >= ${schema.eloTiers.minElo}`, (0, drizzle_orm_1.sql) `${afterElo} < ${schema.eloTiers.maxElo}`))
                    .limit(1);
                await tx
                    .update(schema.footballTeamRanks)
                    .set({
                    eloPoints: afterElo,
                    tierId: tier?.id ?? null,
                    matchesPlayed: (0, drizzle_orm_1.sql) `${schema.footballTeamRanks.matchesPlayed} + 1`,
                    matchesWon: (0, drizzle_orm_1.sql) `${schema.footballTeamRanks.matchesWon} + ${item.won ? 1 : 0}`,
                    winStreak: item.won
                        ? (0, drizzle_orm_1.sql) `${schema.footballTeamRanks.winStreak} + 1`
                        : 0,
                    peakElo: (0, drizzle_orm_1.sql) `greatest(${schema.footballTeamRanks.peakElo}, ${afterElo})`,
                    lastMatchAt: now,
                    updatedAt: now,
                })
                    .where((0, drizzle_orm_1.eq)(schema.footballTeamRanks.id, item.rank.id));
                await tx.insert(schema.footballEloEvents).values({
                    teamRankId: item.rank.id,
                    matchId,
                    beforeElo: item.rank.eloPoints,
                    afterElo,
                    delta: item.delta,
                    outcome: item.outcome,
                    reason: specialAction ?? 'MATCH_COMPLETED',
                });
            }
            return { handled: true };
        });
    }
};
exports.FootballTeamEloService = FootballTeamEloService;
exports.FootballTeamEloService = FootballTeamEloService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.PG_CONNECTION)),
    __metadata("design:paramtypes", [Object])
], FootballTeamEloService);
//# sourceMappingURL=football-team-elo.service.js.map