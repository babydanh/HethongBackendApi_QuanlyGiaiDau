import { Inject, Injectable } from '@nestjs/common';
import { PG_CONNECTION } from '../../../database/database.module';
import type { AppDb } from '../../../database/db.types';
import * as schema from '../../../database/schema';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  hasFootballScoreSnapshot,
  sortFootballStandings,
} from '../utils/football-standings';

@Injectable()
export class TournamentResultsRepository {
  constructor(@Inject(PG_CONNECTION) private readonly db: AppDb) {}
  async findGroupStandings(tournamentId: string, divisionId?: string) {
    // Tìm các stage Round Robin (vòng bảng) của tournament
    const stages = await this.db
      .select()
      .from(schema.tournamentStages)
      .where(
        divisionId
          ? and(
              eq(schema.tournamentStages.tournamentId, tournamentId),
              eq(schema.tournamentStages.tournamentDivisionId, divisionId),
              eq(schema.tournamentStages.type, 'ROUND_ROBIN'),
              isNull(schema.tournamentStages.deletedAt),
            )
          : and(
              eq(schema.tournamentStages.tournamentId, tournamentId),
              eq(schema.tournamentStages.type, 'ROUND_ROBIN'),
              isNull(schema.tournamentStages.deletedAt),
            ),
      )
      .orderBy(schema.tournamentStages.order);

    if (stages.length === 0) return [];

    const stageIds = stages.map((s) => s.id);

    const groups = await this.db
      .select()
      .from(schema.tournamentGroups)
      .where(
        and(
          inArray(schema.tournamentGroups.stageId, stageIds),
          isNull(schema.tournamentGroups.deletedAt),
        ),
      )
      .orderBy(schema.tournamentGroups.name);

    if (groups.length === 0) return [];

    const groupIds = groups.map((g) => g.id);

    const standings = await this.db
      .select()
      .from(schema.groupStandings)
      .where(inArray(schema.groupStandings.groupId, groupIds))
      // Competition standings are independent from ELO. Keep the same
      // deterministic order used by bracket advancement and the clients.
      .orderBy(
        schema.groupStandings.groupId,
        sql`total_points DESC,
          (points_for - points_against) DESC,
          points_for DESC,
          won DESC,
          participant_id ASC`,
      );

    // Resolve the sport tie-breaks at read time from the completed fixtures.
    // The aggregate table intentionally stays small (points/goals only), while
    // H2H and fair-play are derived from the immutable match score snapshots.
    const standingsByGroup = new Map<string, typeof standings>();
    for (const standing of standings) {
      const groupRows = standingsByGroup.get(standing.groupId) || [];
      groupRows.push(standing);
      standingsByGroup.set(standing.groupId, groupRows);
    }
    const groupMatches = await this.db
      .select({
        groupId: schema.matches.groupId,
        participant1Id: schema.matches.participant1Id,
        participant2Id: schema.matches.participant2Id,
        winnerId: schema.matches.winnerId,
        scoreDetails: schema.matches.scoreDetails,
      })
      .from(schema.matches)
      .where(
        and(
          inArray(schema.matches.groupId, groupIds),
          eq(schema.matches.status, 'COMPLETED'),
          isNull(schema.matches.deletedAt),
        ),
      );

    const footballGroupIds = new Set(
      groupMatches
        .filter((match) => hasFootballScoreSnapshot([match]))
        .map((match) => match.groupId)
        .filter((groupId): groupId is string => Boolean(groupId)),
    );
    for (const [groupId, groupRows] of standingsByGroup) {
      if (!footballGroupIds.has(groupId)) continue;
      const ordered = sortFootballStandings(groupRows, groupMatches);
      groupRows.splice(0, groupRows.length, ...ordered);
    }
    const sortedStandings = groups.flatMap((group) => {
      const rows = standingsByGroup.get(group.id) || [];
      return rows;
    });

    // Lấy participant info kèm seed
    const participantIds = [
      ...new Set(sortedStandings.map((s) => s.participantId)),
    ];
    const participants =
      participantIds.length > 0
        ? await this.db
            .select({
              id: schema.tournamentParticipants.id,
              teamName: schema.tournamentParticipants.teamName,
              logoUrl: schema.tournamentParticipants.footballTeamLogoUrl,
              seed: schema.tournamentParticipants.seed,
            })
            .from(schema.tournamentParticipants)
            .where(inArray(schema.tournamentParticipants.id, participantIds))
        : [];

    const participantMap = new Map(
      participants.map((p) => [
        p.id,
        { teamName: p.teamName, logoUrl: p.logoUrl, seed: p.seed },
      ]),
    );

    return {
      stages: stages.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        order: s.order,
      })),
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        stageId: g.stageId,
      })),
      standings: sortedStandings.map((s) => ({
        id: s.id,
        groupId: s.groupId,
        participantId: s.participantId,
        teamName: participantMap.get(s.participantId)?.teamName || 'Unknown',
        logoUrl: participantMap.get(s.participantId)?.logoUrl || null,
        seed: participantMap.get(s.participantId)?.seed || null,
        played: s.played,
        won: s.won,
        lost: s.lost,
        draws: s.draws,
        pointsFor: s.pointsFor,
        pointsAgainst: s.pointsAgainst,
        totalPoints: s.totalPoints,
      })),
    };
  }
  async findTournamentResultMatches(tournamentId: string, divisionId?: string) {
    const conditions = [
      eq(schema.matches.tournamentId, tournamentId),
      isNull(schema.matches.deletedAt),
      isNull(schema.tournamentStages.deletedAt),
    ];
    if (divisionId)
      conditions.push(
        eq(schema.tournamentStages.tournamentDivisionId, divisionId),
      );

    return this.db
      .select({
        id: schema.matches.id,
        status: schema.matches.status,
        winnerId: schema.matches.winnerId,
        participant1Id: schema.matches.participant1Id,
        participant2Id: schema.matches.participant2Id,
        roundNumber: schema.matches.roundNumber,
        matchOrder: schema.matches.matchOrder,
        bracketBranch: schema.matches.bracketBranch,
        groupId: schema.matches.groupId,
        stageId: schema.matches.stageId,
        stageType: schema.tournamentStages.type,
        stageName: schema.tournamentStages.name,
        matchConfig: schema.matches.matchConfig,
        participant1Name: sql<string | null>`p1.team_name`,
        participant2Name: sql<string | null>`p2.team_name`,
      })
      .from(schema.matches)
      .innerJoin(
        schema.tournamentStages,
        eq(schema.matches.stageId, schema.tournamentStages.id),
      )
      .leftJoin(
        sql`"tournament_participants" p1`,
        sql`p1.id = ${schema.matches.participant1Id}`,
      )
      .leftJoin(
        sql`"tournament_participants" p2`,
        sql`p2.id = ${schema.matches.participant2Id}`,
      )
      .where(and(...conditions))
      .orderBy(schema.matches.roundNumber, schema.matches.matchOrder);
  }
  async findPublicTournamentResultMembers(participantIds: string[]) {
    if (participantIds.length === 0) return [];

    return this.db
      .select({
        participantId: schema.tournamentRosters.participantId,
        userId: schema.users.id,
        fullName: schema.profiles.fullName,
        avatarUrl: schema.profiles.avatarUrl,
      })
      .from(schema.tournamentRosters)
      .innerJoin(
        schema.users,
        eq(schema.tournamentRosters.userId, schema.users.id),
      )
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(
        and(
          inArray(schema.tournamentRosters.participantId, participantIds),
          eq(schema.tournamentRosters.status, 'ACTIVE'),
          eq(schema.users.isMock, false),
          isNull(schema.users.deletedAt),
        ),
      )
      .orderBy(asc(schema.tournamentRosters.joinedAt));
  }
}
