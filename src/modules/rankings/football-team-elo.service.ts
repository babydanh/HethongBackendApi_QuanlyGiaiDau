import { Injectable, Inject } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';

/** Official football ranking: one rating per team/category, never an average of players. */
@Injectable()
export class FootballTeamEloService {
  private readonly kFactor = 32;

  constructor(@Inject(PG_CONNECTION) private readonly db: AppDb) {}

  async getLeaderboard(categoryId: string, limit = 20, cursor?: string) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    let after: { elo: number; id: string } | undefined;
    if (cursor) {
      try { after = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { elo: number; id: string }; } catch { after = undefined; }
    }
    const rows = await this.db
      .select({
        id: schema.footballTeamRanks.id,
        teamId: schema.footballTeamRanks.teamId,
        teamName: schema.footballTeams.name,
        logoUrl: schema.footballTeams.logoUrl,
        eloPoints: schema.footballTeamRanks.eloPoints,
        tierId: schema.footballTeamRanks.tierId,
        matchesPlayed: schema.footballTeamRanks.matchesPlayed,
        matchesWon: schema.footballTeamRanks.matchesWon,
        winStreak: schema.footballTeamRanks.winStreak,
        peakElo: schema.footballTeamRanks.peakElo,
      })
      .from(schema.footballTeamRanks)
      .innerJoin(schema.footballTeams, eq(schema.footballTeamRanks.teamId, schema.footballTeams.id))
      .where(and(
        eq(schema.footballTeamRanks.categoryId, categoryId),
        eq(schema.footballTeams.status, 'ACTIVE'),
        after ? sql`(${schema.footballTeamRanks.eloPoints} < ${after.elo} OR (${schema.footballTeamRanks.eloPoints} = ${after.elo} AND ${schema.footballTeamRanks.id} < ${after.id}))` : undefined,
      ))
      .orderBy(sql`${schema.footballTeamRanks.eloPoints} DESC`, sql`${schema.footballTeamRanks.id} DESC`)
      .limit(safeLimit + 1);
    const hasMore = rows.length > safeLimit;
    const data = rows.slice(0, safeLimit);
    const last = data.at(-1);
    return {
      data,
      meta: { limit: safeLimit, hasMore, nextCursor: hasMore && last ? Buffer.from(JSON.stringify({ elo: last.eloPoints, id: last.id })).toString('base64url') : null },
    };
  }

  async processCompletedMatch(matchId: string): Promise<{ handled: boolean; alreadyProcessed?: boolean }> {
    const [match] = await this.db
      .select({
        participant1Id: schema.matches.participant1Id,
        participant2Id: schema.matches.participant2Id,
        winnerId: schema.matches.winnerId,
        scoreDetails: schema.matches.scoreDetails,
        tournamentId: schema.matches.tournamentId,
      })
      .from(schema.matches)
      .where(eq(schema.matches.id, matchId))
      .limit(1);
    if (!match?.participant1Id || !match.participant2Id) return { handled: false };

    const participants = await this.db
      .select({ id: schema.tournamentParticipants.id, footballTeamId: schema.tournamentParticipants.footballTeamId })
      .from(schema.tournamentParticipants)
      .where(inArray(schema.tournamentParticipants.id, [match.participant1Id, match.participant2Id]));
    const p1 = participants.find((p) => p.id === match.participant1Id);
    const p2 = participants.find((p) => p.id === match.participant2Id);
    if (!p1?.footballTeamId || !p2?.footballTeamId || p1.footballTeamId === p2.footballTeamId) {
      return { handled: false };
    }

    const [tournament] = await this.db
      .select({ categoryId: schema.tournaments.categoryId })
      .from(schema.tournaments)
      .where(eq(schema.tournaments.id, match.tournamentId))
      .limit(1);
    if (!tournament?.categoryId) return { handled: false };

    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`football-elo:${matchId}`}))`);
      const ranks = [] as Array<typeof schema.footballTeamRanks.$inferSelect>;
      for (const teamId of [p1.footballTeamId!, p2.footballTeamId!]) {
        await tx.insert(schema.footballTeamRanks).values({ teamId, categoryId: tournament.categoryId }).onConflictDoNothing();
        const [rank] = await tx.select().from(schema.footballTeamRanks).where(and(
          eq(schema.footballTeamRanks.teamId, teamId),
          eq(schema.footballTeamRanks.categoryId, tournament.categoryId),
        )).limit(1);
        if (!rank) throw new Error(`Football rank missing for team ${teamId}`);
        ranks.push(rank);
      }

      const existing = await tx.select({ id: schema.footballEloEvents.id })
        .from(schema.footballEloEvents)
        .where(and(eq(schema.footballEloEvents.matchId, matchId), inArray(schema.footballEloEvents.teamRankId, ranks.map((r) => r.id))));
      if (existing.length === 2) return { handled: true, alreadyProcessed: true };
      if (existing.length !== 0) throw new Error(`Incomplete football ELO events for match ${matchId}`);

      const [rank1, rank2] = ranks;
      const score1 = match.winnerId ? (match.winnerId === match.participant1Id ? 1 : 0) : 0.5;
      const score2 = 1 - score1;
      const scoreDetails = match.scoreDetails as Record<string, unknown> | null | undefined;
      const specialResult = scoreDetails?.specialResult as Record<string, unknown> | undefined;
      const specialAction = typeof specialResult?.action === 'string' ? specialResult.action : null;
      const isWalkover = specialAction === 'WALKOVER' || specialAction === 'DISQUALIFICATION';
      const expected1 = 1 / (1 + 10 ** ((rank2.eloPoints - rank1.eloPoints) / 400));
      const expected2 = 1 - expected1;
      const delta1 = Math.round(this.kFactor * (score1 - expected1));
      const delta2 = Math.round(this.kFactor * (score2 - expected2));
      const now = new Date();
      const updates = [
        { rank: rank1, delta: delta1, score: score1, won: score1 === 1, outcome: isWalkover ? (score1 === 1 ? 'FORFEIT' : 'NO_SHOW') : (score1 === 1 ? 'WIN' : score1 === 0.5 ? 'DRAW' : 'LOSS') },
        { rank: rank2, delta: delta2, score: score2, won: score2 === 1, outcome: isWalkover ? (score2 === 1 ? 'FORFEIT' : 'NO_SHOW') : (score2 === 1 ? 'WIN' : score2 === 0.5 ? 'DRAW' : 'LOSS') },
      ];
      for (const item of updates) {
        const afterElo = Math.max(0, item.rank.eloPoints + item.delta);
        const [tier] = await tx.select({ id: schema.eloTiers.id }).from(schema.eloTiers).where(and(
          eq(schema.eloTiers.categoryId, tournament.categoryId),
          sql`${afterElo} >= ${schema.eloTiers.minElo}`,
          sql`${afterElo} < ${schema.eloTiers.maxElo}`,
        )).limit(1);
        await tx.update(schema.footballTeamRanks).set({
          eloPoints: afterElo,
          tierId: tier?.id ?? null,
          matchesPlayed: sql`${schema.footballTeamRanks.matchesPlayed} + 1`,
          matchesWon: sql`${schema.footballTeamRanks.matchesWon} + ${item.won ? 1 : 0}`,
          winStreak: item.won ? sql`${schema.footballTeamRanks.winStreak} + 1` : 0,
          peakElo: sql`greatest(${schema.footballTeamRanks.peakElo}, ${afterElo})`,
          lastMatchAt: now,
          updatedAt: now,
        }).where(eq(schema.footballTeamRanks.id, item.rank.id));
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
}
