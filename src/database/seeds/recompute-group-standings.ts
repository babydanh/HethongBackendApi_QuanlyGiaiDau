/**
 * Recompute group_standings.points_for / points_against = TỔNG ĐIỂM GHI ĐƯỢC
 * từ từng set (chuẩn hiệu số điểm pickleball rally) — sửa dữ liệu cũ đang lưu
 * SỐ SET THẮNG. Dùng sau khi đã deploy code mới trong matches.repository.ts
 * (sumSetPoints). Idempotent: chạy lại an toàn.
 *
 * Nguồn chính xác nhất: matches COMPLETED của từng group (theo khuyến nghị
 * preflight-standings-duplicates.ts). Recompute lại luôn played/won/lost/draws
 * và totalPoints (win/draw/loss theo sportRules) cho nhất quán.
 *
 * Chạy (backup DB trước nếu có thể):
 *   pnpm seed:standings-recompute  (script trong package.json)
 *   hoặc: npx ts-node src/database/seeds/recompute-group-standings.ts
 */
import 'dotenv/config';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../schema';
import { createPostgresClientFromEnv } from '../postgres-client';

const pg = createPostgresClientFromEnv({ ssl: undefined });
const db = drizzle(pg, { schema });

const GROUP_STAGE_TYPES = ['ROUND_ROBIN', 'GROUP_STAGE', 'GROUP_STAGES'];

interface Scoring {
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
}

function resolveScoring(sportRules: unknown): Scoring {
  const scoring = { winPoints: 3, drawPoints: 1, lossPoints: 0 };
  if (!sportRules || typeof sportRules !== 'object') return scoring;
  const rules = sportRules as Record<string, unknown>;
  const src = (rules.scoring as Record<string, unknown> | undefined) ?? rules;
  if (typeof src.winPoints === 'number') scoring.winPoints = src.winPoints;
  if (typeof src.drawPoints === 'number') scoring.drawPoints = src.drawPoints;
  if (typeof src.lossPoints === 'number') scoring.lossPoints = src.lossPoints;
  return scoring;
}

/** Tổng điểm mỗi bên từ scoreDetails.sets (khớp sumSetPoints ở matches.repository). */
function sumSetPoints(
  scoreDetails: unknown,
): { p1: number; p2: number } {
  let p1 = 0;
  let p2 = 0;
  if (!scoreDetails || typeof scoreDetails !== 'object') return { p1, p2 };
  const sets = (scoreDetails as Record<string, unknown>).sets;
  if (!Array.isArray(sets)) return { p1, p2 };
  for (const set of sets) {
    if (!set || typeof set !== 'object') continue;
    const s = set as Record<string, unknown>;
    p1 += Number(s.team1Score) || 0;
    p2 += Number(s.team2Score) || 0;
  }
  return { p1, p2 };
}

async function main() {
  // 1. Lấy các group thuộc stage vòng bảng (ROUND_ROBIN / GROUP_STAGE)
  const stages = await db
    .select({
      id: schema.tournamentStages.id,
      type: schema.tournamentStages.type,
      tournamentId: schema.tournamentStages.tournamentId,
    })
    .from(schema.tournamentStages)
    .where(inArray(schema.tournamentStages.type, GROUP_STAGE_TYPES));

  if (stages.length === 0) {
    console.log('No round-robin / group stages found.');
    await pg.end();
    return;
  }

  const stageIds = stages.map((stage) => stage.id);

  const groups = await db
    .select({ id: schema.tournamentGroups.id, stageId: schema.tournamentGroups.stageId })
    .from(schema.tournamentGroups)
    .where(inArray(schema.tournamentGroups.stageId, stageIds));

  const groupIds = groups.map((group) => group.id);
  if (groupIds.length === 0) {
    console.log('No groups found for the group stages.');
    await pg.end();
    return;
  }

  // 2. Lấy sportRules của các tournament liên quan (để tính totalPoints đúng).
  const tournamentIds = [...new Set(stages.map((stage) => stage.tournamentId))];
  const tournaments = await db
    .select({ id: schema.tournaments.id, sportRules: schema.tournaments.sportRules })
    .from(schema.tournaments)
    .where(inArray(schema.tournaments.id, tournamentIds));
  const scoringByTournament = new Map<string, Scoring>();
  for (const t of tournaments) {
    scoringByTournament.set(t.id, resolveScoring(t.sportRules));
  }

  // 3. Nhóm stageId -> tournamentId + scoring để áp dụng cho từng group.
  const stageInfo = new Map(stages.map((s) => [s.id, s]));

  // 4. Lấy các row group_standings hiện có (chỉ update row đã tồn tại).
  const existingRows = await db
    .select({
      groupId: schema.groupStandings.groupId,
      participantId: schema.groupStandings.participantId,
    })
    .from(schema.groupStandings)
    .where(inArray(schema.groupStandings.groupId, groupIds));

  const existingKeys = new Set(
    existingRows.map((row) => `${row.groupId}:${row.participantId}`),
  );

  // 5. Lấy toàn bộ match COMPLETED của các group này.
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
    .where(
      and(
        inArray(schema.matches.groupId, groupIds),
        eq(schema.matches.status, 'COMPLETED'),
      ),
    );

  // 6. Gộp chỉ số theo (groupId, participantId).
  interface Agg {
    played: number;
    won: number;
    lost: number;
    draws: number;
    pointsFor: number;
    pointsAgainst: number;
    totalPoints: number;
  }

  const groupToStage = new Map(groups.map((g) => [g.id, g.stageId]));
  const aggMap = new Map<string, Agg>();

  for (const match of completedMatches) {
    if (match.isBye) continue;
    const p1Id = match.participant1Id;
    const p2Id = match.participant2Id;
    const groupId = match.groupId;
    if (!p1Id || !p2Id || !groupId) continue;

    const stageId = groupToStage.get(groupId);
    const stage = stageId ? stageInfo.get(stageId) : undefined;
    const scoring = stage ? scoringByTournament.get(stage.tournamentId) : undefined;
    const { winPoints, drawPoints, lossPoints } = scoring ?? { winPoints: 3, drawPoints: 1, lossPoints: 0 };

    const { p1, p2 } = sumSetPoints(match.scoreDetails);
    const isDraw = !match.winnerId;

    for (const [pId, ownTotal, oppTotal] of [
      [p1Id, p1, p2] as const,
      [p2Id, p2, p1] as const,
    ]) {
      const key = `${groupId}:${pId}`;
      if (!existingKeys.has(key)) continue; // chỉ sửa row đã có
      const agg = aggMap.get(key) ?? { played: 0, won: 0, lost: 0, draws: 0, pointsFor: 0, pointsAgainst: 0, totalPoints: 0 };
      agg.played += 1;
      agg.pointsFor += ownTotal;
      agg.pointsAgainst += oppTotal;
      if (isDraw) {
        agg.draws += 1;
        agg.totalPoints += drawPoints;
      } else if (match.winnerId === pId) {
        agg.won += 1;
        agg.totalPoints += winPoints;
      } else {
        agg.lost += 1;
        agg.totalPoints += lossPoints;
      }
      aggMap.set(key, agg);
    }
  }

  // 7. UPDATE từng (groupId, participantId).
  let updatedRows = 0;
  const keys = [...aggMap.keys()];
  for (const key of keys) {
    const [groupId, participantId] = key.split(':');
    if (!groupId || !participantId) continue;
    const agg = aggMap.get(key);
    if (!agg) continue;
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
      .where(
        and(
          eq(schema.groupStandings.groupId, groupId),
          eq(schema.groupStandings.participantId, participantId),
        ),
      );
    updatedRows += 1;
  }

  console.log(
    `Recompute done. stages=${stages.length} groups=${groups.length} ` +
      `matches=${completedMatches.length} standingsRowsUpdated=${updatedRows}`,
  );
  console.log(
    'Note: points_for/points_against now = TOTAL points scored across sets (hiệu số điểm).',
  );

  await pg.end();
}

main().catch(async (error) => {
  console.error('Recompute group_standings failed:', error);
  await pg.end().catch(() => undefined);
  process.exit(1);
});
