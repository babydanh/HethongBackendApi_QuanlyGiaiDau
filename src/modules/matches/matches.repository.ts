import { Injectable, Inject } from '@nestjs/common';
import { PG_CONNECTION } from '../../database/database.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../database/schema';
import { eq, and, count, SQL } from 'drizzle-orm';
import { QueryMatchDto } from './dto/query-match.dto';
import { UpdateMatchScoreDto } from './dto/update-match-score.dto';
import { UpdateMatchStatusDto } from './dto/update-match-status.dto';

@Injectable()
export class MatchesRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findAll(query: QueryMatchDto) {
    const { page = 1, limit = 10, groupId, status } = query;
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [];
    if (groupId) {
      conditions.push(eq(schema.matches.groupId, groupId));
    }
    if (status) {
      conditions.push(eq(schema.matches.status, status));
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

    return {
      data,
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
        stageId: schema.tournamentGroups.stageId,
        tournamentId: schema.tournamentStages.tournamentId,
        tournamentName: schema.tournaments.name,
        createdBy: schema.tournaments.createdBy,
      })
      .from(schema.tournamentGroups)
      .innerJoin(schema.tournamentStages, eq(schema.tournamentGroups.stageId, schema.tournamentStages.id))
      .innerJoin(schema.tournaments, eq(schema.tournamentStages.tournamentId, schema.tournaments.id))
      .where(eq(schema.tournamentGroups.id, match.groupId))
      .limit(1);

    // Get details for participant 1 & 2
    let participant1: { id: string; teamName: string } | null = null;
    let participant2: { id: string; teamName: string } | null = null;

    if (match.participant1Id) {
      const [p1] = await this.db
        .select({ id: schema.tournamentParticipants.id, teamName: schema.tournamentParticipants.teamName })
        .from(schema.tournamentParticipants)
        .where(eq(schema.tournamentParticipants.id, match.participant1Id))
        .limit(1);
      if (p1) participant1 = p1;
    }

    if (match.participant2Id) {
      const [p2] = await this.db
        .select({ id: schema.tournamentParticipants.id, teamName: schema.tournamentParticipants.teamName })
        .from(schema.tournamentParticipants)
        .where(eq(schema.tournamentParticipants.id, match.participant2Id))
        .limit(1);
      if (p2) participant2 = p2;
    }

    return {
      ...match,
      groupName: group?.name || '',
      tournamentId: group?.tournamentId || '',
      tournament: group ? { id: group.tournamentId, name: group.tournamentName, createdBy: group.createdBy } : null,
      participant1,
      participant2,
    };
  }

  async updateScore(id: string, userId: string, data: UpdateMatchScoreDto) {
    const [updated] = await this.db
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

  async updateSchedule(
    id: string,
    data: { courtId?: string | null; refereeId?: string | null; scheduledAt?: string | null },
  ) {
    const [updated] = await this.db
      .update(schema.matches)
      .set({
        courtId: data.courtId || null,
        refereeId: data.refereeId || null,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
        updatedAt: new Date(),
      })
      .where(eq(schema.matches.id, id))
      .returning();

    return updated;
  }
}
