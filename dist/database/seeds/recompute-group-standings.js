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
const drizzle_orm_1 = require("drizzle-orm");
const postgres_js_1 = require("drizzle-orm/postgres-js");
const schema = __importStar(require("../schema"));
const postgres_client_1 = require("../postgres-client");
const pg = (0, postgres_client_1.createPostgresClientFromEnv)({ ssl: undefined });
const db = (0, postgres_js_1.drizzle)(pg, { schema });
const GROUP_STAGE_TYPES = ['ROUND_ROBIN', 'GROUP_STAGE', 'GROUP_STAGES'];
function resolveScoring(sportRules) {
    const scoring = { winPoints: 3, drawPoints: 1, lossPoints: 0 };
    if (!sportRules || typeof sportRules !== 'object')
        return scoring;
    const rules = sportRules;
    const src = rules.scoring ?? rules;
    if (typeof src.winPoints === 'number')
        scoring.winPoints = src.winPoints;
    if (typeof src.drawPoints === 'number')
        scoring.drawPoints = src.drawPoints;
    if (typeof src.lossPoints === 'number')
        scoring.lossPoints = src.lossPoints;
    return scoring;
}
function sumSetPoints(scoreDetails) {
    let p1 = 0;
    let p2 = 0;
    if (!scoreDetails || typeof scoreDetails !== 'object')
        return { p1, p2 };
    const sets = scoreDetails.sets;
    if (!Array.isArray(sets))
        return { p1, p2 };
    for (const set of sets) {
        if (!set || typeof set !== 'object')
            continue;
        const s = set;
        p1 += Number(s.team1Score) || 0;
        p2 += Number(s.team2Score) || 0;
    }
    return { p1, p2 };
}
async function main() {
    const stages = await db
        .select({
        id: schema.tournamentStages.id,
        type: schema.tournamentStages.type,
        tournamentId: schema.tournamentStages.tournamentId,
    })
        .from(schema.tournamentStages)
        .where((0, drizzle_orm_1.inArray)(schema.tournamentStages.type, GROUP_STAGE_TYPES));
    if (stages.length === 0) {
        console.log('No round-robin / group stages found.');
        await pg.end();
        return;
    }
    const stageIds = stages.map((stage) => stage.id);
    const groups = await db
        .select({ id: schema.tournamentGroups.id, stageId: schema.tournamentGroups.stageId })
        .from(schema.tournamentGroups)
        .where((0, drizzle_orm_1.inArray)(schema.tournamentGroups.stageId, stageIds));
    const groupIds = groups.map((group) => group.id);
    if (groupIds.length === 0) {
        console.log('No groups found for the group stages.');
        await pg.end();
        return;
    }
    const tournamentIds = [...new Set(stages.map((stage) => stage.tournamentId))];
    const tournaments = await db
        .select({ id: schema.tournaments.id, sportRules: schema.tournaments.sportRules })
        .from(schema.tournaments)
        .where((0, drizzle_orm_1.inArray)(schema.tournaments.id, tournamentIds));
    const scoringByTournament = new Map();
    for (const t of tournaments) {
        scoringByTournament.set(t.id, resolveScoring(t.sportRules));
    }
    const stageInfo = new Map(stages.map((s) => [s.id, s]));
    const existingRows = await db
        .select({
        groupId: schema.groupStandings.groupId,
        participantId: schema.groupStandings.participantId,
    })
        .from(schema.groupStandings)
        .where((0, drizzle_orm_1.inArray)(schema.groupStandings.groupId, groupIds));
    const existingKeys = new Set(existingRows.map((row) => `${row.groupId}:${row.participantId}`));
    const completedMatches = await db
        .select({
        id: schema.matches.id,
        groupId: schema.matches.groupId,
        participant1Id: schema.matches.participant1Id,
        participant2Id: schema.matches.participant2Id,
        winnerId: schema.matches.winnerId,
        scoreDetails: schema.matches.scoreDetails,
        isBye: schema.matches.isBye,
    })
        .from(schema.matches)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema.matches.groupId, groupIds), (0, drizzle_orm_1.eq)(schema.matches.status, 'COMPLETED')));
    const groupToStage = new Map(groups.map((g) => [g.id, g.stageId]));
    const aggMap = new Map();
    for (const match of completedMatches) {
        if (match.isBye)
            continue;
        const p1Id = match.participant1Id;
        const p2Id = match.participant2Id;
        const groupId = match.groupId;
        if (!p1Id || !p2Id || !groupId)
            continue;
        const stageId = groupToStage.get(groupId);
        const stage = stageId ? stageInfo.get(stageId) : undefined;
        const scoring = stage ? scoringByTournament.get(stage.tournamentId) : undefined;
        const { winPoints, drawPoints, lossPoints } = scoring ?? { winPoints: 3, drawPoints: 1, lossPoints: 0 };
        const { p1, p2 } = sumSetPoints(match.scoreDetails);
        const isDraw = !match.winnerId;
        for (const [pId, ownTotal, oppTotal] of [
            [p1Id, p1, p2],
            [p2Id, p2, p1],
        ]) {
            const key = `${groupId}:${pId}`;
            if (!existingKeys.has(key))
                continue;
            const agg = aggMap.get(key) ?? { played: 0, won: 0, lost: 0, draws: 0, pointsFor: 0, pointsAgainst: 0, totalPoints: 0 };
            agg.played += 1;
            agg.pointsFor += ownTotal;
            agg.pointsAgainst += oppTotal;
            if (isDraw) {
                agg.draws += 1;
                agg.totalPoints += drawPoints;
            }
            else if (match.winnerId === pId) {
                agg.won += 1;
                agg.totalPoints += winPoints;
            }
            else {
                agg.lost += 1;
                agg.totalPoints += lossPoints;
            }
            aggMap.set(key, agg);
        }
    }
    let updatedRows = 0;
    const keys = [...aggMap.keys()];
    for (const key of keys) {
        const [groupId, participantId] = key.split(':');
        if (!groupId || !participantId)
            continue;
        const agg = aggMap.get(key);
        if (!agg)
            continue;
        await db
            .update(schema.groupStandings)
            .set({
            played: agg.played,
            won: agg.won,
            lost: agg.lost,
            draws: agg.draws,
            pointsFor: agg.pointsFor,
            pointsAgainst: agg.pointsAgainst,
            totalPoints: agg.totalPoints,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.groupStandings.groupId, groupId), (0, drizzle_orm_1.eq)(schema.groupStandings.participantId, participantId)));
        updatedRows += 1;
    }
    console.log(`Recompute done. stages=${stages.length} groups=${groups.length} ` +
        `matches=${completedMatches.length} standingsRowsUpdated=${updatedRows}`);
    console.log('Note: points_for/points_against now = TOTAL points scored across sets (hiệu số điểm).');
    await pg.end();
}
main().catch(async (error) => {
    console.error('Recompute group_standings failed:', error);
    await pg.end().catch(() => undefined);
    process.exit(1);
});
//# sourceMappingURL=recompute-group-standings.js.map