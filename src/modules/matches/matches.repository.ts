import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import { eq, and, or, count, SQL, inArray, isNull, sql } from 'drizzle-orm';
import { QueryMatchDto } from './dto/query-match.dto';
import { UpdateMatchScoreDto } from './dto/update-match-score.dto';
import { UpdateMatchStatusDto } from './dto/update-match-status.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class MatchesRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: QueryMatchDto) {
    const { page = 1, limit = 10, groupId, status, userId } = query;
    const offset = (page - 1) * limit;
    const tId = query.tournamentId || query.tournament_id;
    const divisionId = query.divisionId || query.division_id;

    const conditions: SQL[] = [];
    
    // Enforce soft delete filters
    conditions.push(isNull(schema.matches.deletedAt));
    conditions.push(
      sql`exists (
        select 1 from ${schema.tournamentGroups} g
        join ${schema.tournamentStages} s on g.stage_id = s.id
        join ${schema.tournaments} t on s.tournament_id = t.id
        where g.id = ${schema.matches.groupId}
        and t.deleted_at is null
      )`
    );

    if (groupId) {
      conditions.push(eq(schema.matches.groupId, groupId));
    }
    if (status) {
      conditions.push(eq(schema.matches.status, status));
    }

    if (userId) {
      const rosters = await this.db
        .select({ participantId: schema.tournamentRosters.participantId })
        .from(schema.tournamentRosters)
        .where(eq(schema.tournamentRosters.userId, userId));
      const pIds = rosters.map(r => r.participantId);
      if (pIds.length === 0) {
        return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
      }
      conditions.push(
        or(
          inArray(schema.matches.participant1Id, pIds),
          inArray(schema.matches.participant2Id, pIds)
        ) as SQL
      );
    }

    if (tId || divisionId) {
      const stages = await this.db
        .select({ id: schema.tournamentStages.id })
        .from(schema.tournamentStages)
        .where(and(
          ...(tId ? [eq(schema.tournamentStages.tournamentId, tId)] : []),
          ...(divisionId ? [eq(schema.tournamentStages.tournamentDivisionId, divisionId)] : []),
        ));
      const stageIds = stages.map(s => s.id);
      
      if (stageIds.length === 0) {
        return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
      }

      const groups = await this.db
        .select({ id: schema.tournamentGroups.id })
        .from(schema.tournamentGroups)
        .where(inArray(schema.tournamentGroups.stageId, stageIds));
      const groupIds = groups.map(g => g.id);

      if (groupIds.length === 0) {
        return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
      }

      conditions.push(inArray(schema.matches.groupId, groupIds));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRecord] = await this.db
      .select({ count: count() })
      .from(schema.matches)
      .where(whereClause);

    const data = await this.db
      .select()
      .from(schema.matches)
      .where(whereClause)
      .limit(limit)
      .offset(offset);

    if (data.length === 0) {
      return {
        data: [],
        meta: {
          total: totalRecord.count,
          page,
          limit,
          totalPages: Math.ceil(totalRecord.count / limit),
        },
      };
    }

    const participantIds = new Set<string>();
    const groupIdsForMatches = new Set<string>();
    for (const match of data) {
      if (match.participant1Id) participantIds.add(match.participant1Id);
      if (match.participant2Id) participantIds.add(match.participant2Id);
      if (match.groupId) groupIdsForMatches.add(match.groupId);
    }

    const participantsMap = new Map<string, { id: string; teamName: string; seed: number | null; members: { userId: string; fullName: string | null }[] }>();
    if (participantIds.size > 0) {
      const participantsData = await this.db
        .select({
          id: schema.tournamentParticipants.id,
          teamName: schema.tournamentParticipants.teamName,
          seed: schema.tournamentParticipants.seed,
        })
        .from(schema.tournamentParticipants)
        .where(inArray(schema.tournamentParticipants.id, Array.from(participantIds)));

      const rosters = await this.db
        .select({
          participantId: schema.tournamentRosters.participantId,
          userId: schema.tournamentRosters.userId,
          fullName: schema.profiles.fullName,
        })
        .from(schema.tournamentRosters)
        .leftJoin(schema.profiles, eq(schema.tournamentRosters.userId, schema.profiles.userId))
        .where(inArray(schema.tournamentRosters.participantId, Array.from(participantIds)));

      const rostersMap = new Map<string, { userId: string; fullName: string | null }[]>();
      for (const r of rosters) {
        const list = rostersMap.get(r.participantId) || [];
        list.push({ userId: r.userId, fullName: r.fullName });
        rostersMap.set(r.participantId, list);
      }

      for (const p of participantsData) {
        participantsMap.set(p.id, {
          ...p,
          members: rostersMap.get(p.id) || [],
        });
      }
    }

    const groupsMap = new Map<string, { id: string; name: string; stageName: string }>();
    if (groupIdsForMatches.size > 0) {
      const groupsData = await this.db
        .select({
          groupId: schema.tournamentGroups.id,
          groupName: schema.tournamentGroups.name,
          stageName: schema.tournamentStages.name,
        })
        .from(schema.tournamentGroups)
        .innerJoin(schema.tournamentStages, eq(schema.tournamentGroups.stageId, schema.tournamentStages.id))
        .where(inArray(schema.tournamentGroups.id, Array.from(groupIdsForMatches)));
      for (const g of groupsData) {
        groupsMap.set(g.groupId, {
          id: g.groupId,
          name: g.groupName,
          stageName: g.stageName,
        });
      }
    }

    const enrichedData = data.map(match => {
      const p1 = match.participant1Id ? participantsMap.get(match.participant1Id) : null;
      const p2 = match.participant2Id ? participantsMap.get(match.participant2Id) : null;
      const groupStage = match.groupId ? groupsMap.get(match.groupId) : null;

      return {
        ...match,
        participant1: p1 ? { id: p1.id, teamName: p1.teamName, seed: p1.seed } : null,
        participant2: p2 ? { id: p2.id, teamName: p2.teamName, seed: p2.seed } : null,
        group: groupStage ? {
          name: groupStage.name,
          stage: {
            name: groupStage.stageName,
          }
        } : null,
      };
    });

    return {
      data: enrichedData,
      meta: {
        total: totalRecord.count,
        page,
        limit,
        totalPages: Math.ceil(totalRecord.count / limit),
      },
    };
  }

  async findById(id: string) {
    const result = await this.db
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.id, id))
      .limit(1);

    if (result.length === 0) return null;
    const match = result[0];

    // Find the group to get stage and tournament details
    const [group] = await this.db
      .select({
        name: schema.tournamentGroups.name,
        stageId: schema.tournamentStages.id,
        tournamentId: schema.tournaments.id,
        tournamentName: schema.tournaments.name,
        tournamentType: schema.tournaments.tournamentType,
        communityId: schema.tournaments.communityId,
        categoryId: schema.tournaments.categoryId,
        matchType: schema.tournaments.matchType,
        genderRestriction: schema.tournaments.genderRestriction,
        createdBy: schema.tournaments.createdBy,
        stageType: schema.tournamentStages.type,
        roundConfig: schema.tournamentStages.roundConfig,
        sportRules: schema.tournaments.sportRules,
        tournamentConfig: schema.tournaments.tournamentConfig,
      })
      .from(schema.tournamentStages)
      .innerJoin(schema.tournaments, eq(schema.tournamentStages.tournamentId, schema.tournaments.id))
      .leftJoin(schema.tournamentGroups, eq(schema.tournamentGroups.id, match.groupId!))
      .where(eq(schema.tournamentStages.id, match.stageId))
      .limit(1);

    // Get details for participant 1 & 2
    let participant1: { id: string; teamName: string; tournamentDivisionId: string | null } | null = null;
    let participant2: { id: string; teamName: string; tournamentDivisionId: string | null } | null = null;

    if (match.participant1Id) {
      const [p1] = await this.db
        .select({ 
          id: schema.tournamentParticipants.id, 
          teamName: schema.tournamentParticipants.teamName,
          tournamentDivisionId: schema.tournamentParticipants.tournamentDivisionId,
        })
        .from(schema.tournamentParticipants)
        .where(eq(schema.tournamentParticipants.id, match.participant1Id))
        .limit(1);
      if (p1) participant1 = p1;
    }

    if (match.participant2Id) {
      const [p2] = await this.db
        .select({ 
          id: schema.tournamentParticipants.id, 
          teamName: schema.tournamentParticipants.teamName,
          tournamentDivisionId: schema.tournamentParticipants.tournamentDivisionId,
        })
        .from(schema.tournamentParticipants)
        .where(eq(schema.tournamentParticipants.id, match.participant2Id))
        .limit(1);
      if (p2) participant2 = p2;
    }

    return {
      ...match,
      groupName: group?.name || '',
      tournamentId: group?.tournamentId || '',
      tournament: group
        ? {
            id: group.tournamentId,
            name: group.tournamentName,
            tournamentType: group.tournamentType,
            communityId: group.communityId,
            categoryId: group.categoryId,
            matchType: group.matchType,
            createdBy: group.createdBy,
            sportRules: group.sportRules,
            tournamentConfig: group.tournamentConfig,
          }
        : null,
      stage: group ? { type: group.stageType, roundConfig: group.roundConfig } : null,
      participant1,
      participant2,
    };
  }

  async updateScore(id: string, userId: string, data: UpdateMatchScoreDto) {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException('Match not found');

    const [updated] = await this.db.transaction(async (tx) => {
      const [up] = await tx
        .update(schema.matches)
        .set({
          p1SetsWon: data.p1SetsWon,
          p2SetsWon: data.p2SetsWon,
          ...(data.scoreDetails && { scoreDetails: data.scoreDetails }),
          ...(data.winnerId && { winnerId: data.winnerId }),
          scoreConfirmedBy: userId,
          scoreConfirmedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.matches.id, id))
        .returning();

      const oldValues = {
        p1SetsWon: existing.p1SetsWon,
        p2SetsWon: existing.p2SetsWon,
        scoreDetails: existing.scoreDetails,
        winnerId: existing.winnerId,
        status: existing.status,
      };
      const newValues = {
        p1SetsWon: up.p1SetsWon,
        p2SetsWon: up.p2SetsWon,
        scoreDetails: up.scoreDetails,
        winnerId: up.winnerId,
        status: up.status,
      };

      await this.auditService.logUpdate(tx, userId, 'matches', id, oldValues, newValues);
      return [up];
    });

    return updated;
  }

  async updateStatus(id: string, data: UpdateMatchStatusDto) {
    const setClause: Record<string, unknown> = {
      status: data.status,
      updatedAt: new Date(),
    };

    if (data.status === 'ONGOING') {
      setClause.startedAt = new Date();
    } else if (data.status === 'COMPLETED') {
      setClause.completedAt = new Date();
    }

    const [updated] = await this.db
      .update(schema.matches)
      .set(setClause)
      .where(eq(schema.matches.id, id))
      .returning();

    return updated;
  }

  async completeMatch(
    id: string,
    winnerId: string,
    matchDetails: {
      nextMatchId?: string | null;
      loserNextMatchId?: string | null;
      matchOrder: number;
      participant1Id: string | null;
      participant2Id: string | null;
      groupId?: string | null;
      isRoundRobin: boolean;
      p1SetsWon: number;
      p2SetsWon: number;
      scoreDetails: Record<string, string> | null | undefined;
    }
  ) {
    return await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(schema.matches)
        .where(eq(schema.matches.id, id))
        .limit(1);

      // 1. Update the match status to COMPLETED and winnerId
      const [updated] = await tx
        .update(schema.matches)
        .set({
          status: 'COMPLETED',
          winnerId,
          p1SetsWon: matchDetails.p1SetsWon,
          p2SetsWon: matchDetails.p2SetsWon,
          scoreDetails: matchDetails.scoreDetails,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.matches.id, id))
        .returning();

      if (existing) {
        const oldValues = {
          p1SetsWon: existing.p1SetsWon,
          p2SetsWon: existing.p2SetsWon,
          scoreDetails: existing.scoreDetails,
          winnerId: existing.winnerId,
          status: existing.status,
        };
        const newValues = {
          p1SetsWon: updated.p1SetsWon,
          p2SetsWon: updated.p2SetsWon,
          scoreDetails: updated.scoreDetails,
          winnerId: updated.winnerId,
          status: updated.status,
        };
        await this.auditService.logUpdate(tx, null, 'matches', id, oldValues, newValues);
      }

      // 2. Auto-advance Winner
      if (matchDetails.nextMatchId) {
        // Query next match to determine its branch
        const [nextMatch] = await tx
          .select()
          .from(schema.matches)
          .where(eq(schema.matches.id, matchDetails.nextMatchId))
          .limit(1);

        let updateField: { participant1Id?: string | null; participant2Id?: string | null };

        if (nextMatch && nextMatch.bracketBranch === 'GRAND_FINALS') {
          if (existing.bracketBranch === 'MAIN') {
            updateField = { participant1Id: winnerId };
          } else {
            updateField = { participant2Id: winnerId };
          }
        } else {
          if (existing.bracketBranch === 'LOSERS') {
            if (existing.roundNumber % 2 !== 0) {
              // Odd round in Losers: 1-to-1 mapping, always goes to participant1Id
              updateField = { participant1Id: winnerId };
            } else {
              // Even round in Losers: collapses 2-to-1
              const isOdd = (existing.matchOrder % 2 !== 0);
              updateField = isOdd ? { participant1Id: winnerId } : { participant2Id: winnerId };
            }
          } else {
            // MAIN branch collapses 2-to-1
            const isOdd = (existing.matchOrder % 2 !== 0);
            updateField = isOdd ? { participant1Id: winnerId } : { participant2Id: winnerId };
          }
        }

        await tx
          .update(schema.matches)
          .set(updateField)
          .where(eq(schema.matches.id, matchDetails.nextMatchId));
      }

      // 3. Auto-advance Loser (Double Elimination)
      if (matchDetails.loserNextMatchId) {
        const loserId = (winnerId === existing.participant1Id)
          ? existing.participant2Id
          : existing.participant1Id;

        let updateField: { participant1Id?: string | null; participant2Id?: string | null };
        if (existing.roundNumber === 1) {
          const isOdd = (existing.matchOrder % 2 !== 0);
          updateField = isOdd
            ? { participant1Id: loserId }
            : { participant2Id: loserId };
        } else {
          // Winners round >= 2: always goes to participant2Id in Losers Bracket
          updateField = { participant2Id: loserId };
        }

        await tx
          .update(schema.matches)
          .set(updateField)
          .where(eq(schema.matches.id, matchDetails.loserNextMatchId));
      }

      // 4. Double Elimination — Grand Finals Reset
      if (existing.bracketBranch === 'GRAND_FINALS' && existing.roundNumber === 1) {
        // If Losers Bracket champion (participant2) wins GF1
        if (winnerId === existing.participant2Id) {
          const [gf2Exists] = await tx
            .select()
            .from(schema.matches)
            .where(
              and(
                eq(schema.matches.groupId, existing.groupId!),
                eq(schema.matches.roundNumber, 2)
              )
            )
            .limit(1);

          if (!gf2Exists) {
            const gf2Id = randomUUID();
            const [gf2] = await tx
              .insert(schema.matches)
              .values({
                id: gf2Id,
                groupId: existing.groupId as any,
                roundNumber: 2, // GF Round 2 (Reset Match)
                matchOrder: 1,
                bracketBranch: 'GRAND_FINALS',
                status: 'SCHEDULED',
                participant1Id: existing.participant1Id, // Winners Bracket champ
                participant2Id: existing.participant2Id, // Losers Bracket champ
                p1SetsWon: 0,
                p2SetsWon: 0,
                totalSetsPlayed: 0,
                tournamentId: existing.tournamentId,
                stageId: existing.stageId,
                updatedAt: new Date(),
              })
              .returning();

            // Link GF1 to GF2
            await tx
              .update(schema.matches)
              .set({ nextMatchId: gf2.id })
              .where(eq(schema.matches.id, existing.id));

            updated.nextMatchId = gf2.id;
          }
        }
      }

      // 5. Update standings if Round Robin
      if (matchDetails.isRoundRobin) {
        // Query custom win/draw/loss points from sportRules
        const [group] = await tx
          .select({
            tournamentId: schema.tournamentStages.tournamentId,
          })
          .from(schema.tournamentGroups)
          .innerJoin(schema.tournamentStages, eq(schema.tournamentGroups.stageId, schema.tournamentStages.id))
          .where(eq(schema.tournamentGroups.id, existing.groupId!))
          .limit(1);

        let winPoints = 3;
        let drawPoints = 1;
        let lossPoints = 0;

        if (group) {
          const [tournament] = await tx
            .select({
              sportRules: schema.tournaments.sportRules,
            })
            .from(schema.tournaments)
            .where(eq(schema.tournaments.id, group.tournamentId))
            .limit(1);

          if (tournament && tournament.sportRules) {
            const rules = tournament.sportRules as Record<string, unknown>;
            if (typeof rules.winPoints === 'number') winPoints = rules.winPoints;
            if (typeof rules.drawPoints === 'number') drawPoints = rules.drawPoints;
            if (typeof rules.lossPoints === 'number') lossPoints = rules.lossPoints;
          }
        }

        const p1Id = existing.participant1Id;
        const p2Id = existing.participant2Id;
        const participants = [p1Id, p2Id];
        const isDraw = !winnerId && p1Id && p2Id;

        for (const pId of participants) {
          if (!pId) continue;
          const isWinner = pId === winnerId;
          const pointsEarned = isDraw ? drawPoints : (isWinner ? winPoints : lossPoints);

          const existingStanding = await tx
            .select()
            .from(schema.groupStandings)
            .where(
              and(
                eq(schema.groupStandings.groupId, existing.groupId!),
                eq(schema.groupStandings.participantId, pId)
              )
            )
            .limit(1);

          if (existingStanding.length > 0) {
            const row = existingStanding[0];
            await tx
              .update(schema.groupStandings)
              .set({
                played: row.played + 1,
                won: row.won + (isWinner ? 1 : 0),
                lost: row.lost + ((!isWinner && !isDraw) ? 1 : 0),
                draws: row.draws + (isDraw ? 1 : 0),
                totalPoints: row.totalPoints + pointsEarned,
                updatedAt: new Date(),
              })
              .where(eq(schema.groupStandings.id, row.id));
          } else {
            await tx
              .insert(schema.groupStandings)
              .values({
                groupId: existing.groupId as any,
                participantId: pId,
                played: 1,
                won: isWinner ? 1 : 0,
                lost: (!isWinner && !isDraw) ? 1 : 0,
                draws: isDraw ? 1 : 0,
                pointsFor: 0,
                pointsAgainst: 0,
                totalPoints: pointsEarned,
                updatedAt: new Date(),
              });
          }
        }
      }

      return updated;
    });
  }

  async getRostersForParticipants(participantIds: string[]) {
    if (!participantIds || participantIds.length === 0) return [];
    return this.db
      .select({
        userId: schema.tournamentRosters.userId,
        participantId: schema.tournamentRosters.participantId,
      })
      .from(schema.tournamentRosters)
      .where(inArray(schema.tournamentRosters.participantId, participantIds));
  }

  async updateSchedule(
    id: string,
    data: { courtName?: string | null; courtAddress?: string | null; refereeId?: string | null; scheduledAt?: string | null; matchConfig?: Record<string, any> | null },
  ) {
    const [updated] = await this.db
      .update(schema.matches)
      .set({
        courtName: data.courtName || null,
        courtAddress: data.courtAddress || null,
        refereeId: data.refereeId || null,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
        ...(data.matchConfig !== undefined && { matchConfig: data.matchConfig || {} }),
        updatedAt: new Date(),
      })
      .where(eq(schema.matches.id, id))
      .returning();

    return updated;
  }

  async checkAllMatchesCompleted(tournamentId: string): Promise<boolean> {
    const activeMatches = await this.db
      .select({ count: count() })
      .from(schema.matches)
      .where(
        and(
          eq(schema.matches.tournamentId, tournamentId),
          sql`${schema.matches.status} != 'COMPLETED'`,
          isNull(schema.matches.deletedAt)
        )
      );
    return Number(activeMatches[0]?.count || 0) === 0;
  }

  async updateTournamentStatus(tournamentId: string, status: string) {
    await this.db
      .update(schema.tournaments)
      .set({ status: status, updatedAt: new Date() })
      .where(eq(schema.tournaments.id, tournamentId));
  }

  async isRefereeAccepted(tournamentId: string, refereeId: string): Promise<boolean> {
    const result = await this.db
      .select({ count: count() })
      .from(schema.tournamentReferees)
      .where(
        and(
          eq(schema.tournamentReferees.tournamentId, tournamentId),
          eq(schema.tournamentReferees.userId, refereeId),
          eq(schema.tournamentReferees.status, 'ACCEPTED')
        )
      );
    return Number(result[0]?.count || 0) > 0;
  }
}


