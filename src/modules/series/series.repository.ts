import { Injectable, Inject } from '@nestjs/common';
import { PG_CONNECTION } from '../../database/database.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../database/schema';
import { eq, ilike, and, sql, desc, or, inArray } from 'drizzle-orm';
import { CreateSeriesDto } from './dto/create-series.dto';
import { UpdateSeriesDto } from './dto/update-series.dto';
import { QuerySeriesDto } from './dto/query-series.dto';
import { CreateLegDto, LinkEventDto } from './dto/leg.dto';

@Injectable()
export class SeriesRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  getDbInstance() {
    return this.db;
  }

  async create(userId: string, data: CreateSeriesDto) {
    const [record] = await this.db
      .insert(schema.tournamentSeries)
      .values({
        organizerId: userId,
        name: data.name,
        slug: data.slug,
        description: data.description || null,
        bannerUrl: data.bannerUrl || null,
        logoUrl: data.logoUrl || null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        totalPrize: data.totalPrize ? data.totalPrize.toString() : null,
        rules: data.rules,
        visibility: data.visibility || 'PUBLIC',
        status: 'DRAFT',
      })
      .returning();
    return record;
  }

  async update(id: string, data: UpdateSeriesDto) {
    const [record] = await this.db
      .update(schema.tournamentSeries)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.slug !== undefined && { slug: data.slug }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.bannerUrl !== undefined && { bannerUrl: data.bannerUrl }),
        ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
        ...(data.startDate !== undefined && { startDate: data.startDate ? new Date(data.startDate) : null }),
        ...(data.endDate !== undefined && { endDate: data.endDate ? new Date(data.endDate) : null }),
        ...(data.totalPrize !== undefined && { totalPrize: data.totalPrize ? data.totalPrize.toString() : null }),
        ...(data.rules !== undefined && { rules: data.rules }),
        ...(data.visibility !== undefined && { visibility: data.visibility }),
        ...(data.status !== undefined && { status: data.status }),
        updatedAt: new Date(),
      })
      .where(eq(schema.tournamentSeries.id, id))
      .returning();
    return record;
  }

  async softDelete(id: string) {
    const [record] = await this.db
      .update(schema.tournamentSeries)
      .set({ deletedAt: new Date() })
      .where(eq(schema.tournamentSeries.id, id))
      .returning();
    return record;
  }

  async findById(id: string) {
    const result = await this.db
      .select()
      .from(schema.tournamentSeries)
      .where(
        and(
          eq(schema.tournamentSeries.id, id),
          sql`${schema.tournamentSeries.deletedAt} IS NULL`
        )
      )
      .limit(1);
    return result[0] || null;
  }

  async findBySlug(slug: string) {
    const result = await this.db
      .select({
        series: schema.tournamentSeries,
        organizer: {
          id: schema.users.id,
          fullName: schema.profiles.fullName,
          avatarUrl: schema.profiles.avatarUrl,
        }
      })
      .from(schema.tournamentSeries)
      .leftJoin(schema.users, eq(schema.tournamentSeries.organizerId, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(
        and(
          eq(schema.tournamentSeries.slug, slug),
          sql`${schema.tournamentSeries.deletedAt} IS NULL`
        )
      )
      .limit(1);

    if (result.length === 0) return null;
    return result[0];
  }

  async findAll(query: QuerySeriesDto) {
    const conditions = [sql`${schema.tournamentSeries.deletedAt} IS NULL`];

    if (query.status) {
      conditions.push(eq(schema.tournamentSeries.status, query.status));
    }
    if (query.visibility) {
      conditions.push(eq(schema.tournamentSeries.visibility, query.visibility));
    }
    if (query.organizerId) {
      conditions.push(eq(schema.tournamentSeries.organizerId, query.organizerId));
    }
    if (query.search) {
      conditions.push(
        or(
          ilike(schema.tournamentSeries.name, `%${query.search}%`),
          ilike(schema.tournamentSeries.description, `%${query.search}%`)
        ) as typeof conditions[0]
      );
    }

    const whereClause = and(...conditions);
    const limit = query.limit || 10;
    const page = query.page || 1;
    const offset = (page - 1) * limit;

    const [{ count: total }] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.tournamentSeries)
      .where(whereClause);

    const items = await this.db
      .select()
      .from(schema.tournamentSeries)
      .where(whereClause)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(schema.tournamentSeries.createdAt));

    return {
      data: items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    };
  }

  // ─── Leg Operations ───────────────────────────────────────────

  async createLeg(seriesId: string, data: CreateLegDto) {
    const [record] = await this.db
      .insert(schema.seriesLegs)
      .values({
        seriesId,
        name: data.name,
        order: data.order,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        directEntrySlots: data.directEntrySlots !== undefined ? data.directEntrySlots : 2,
        wildcardSlots: data.wildcardSlots !== undefined ? data.wildcardSlots : 16,
        rulesOverride: data.rulesOverride,
        status: 'UPCOMING',
      })
      .returning();
    return record;
  }

  async updateLeg(legId: string, data: Partial<CreateLegDto> & { status?: 'UPCOMING' | 'ONGOING' | 'COMPLETED' }) {
    const [record] = await this.db
      .update(schema.seriesLegs)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.order !== undefined && { order: data.order }),
        ...(data.startDate !== undefined && { startDate: data.startDate ? new Date(data.startDate) : null }),
        ...(data.endDate !== undefined && { endDate: data.endDate ? new Date(data.endDate) : null }),
        ...(data.directEntrySlots !== undefined && { directEntrySlots: data.directEntrySlots }),
        ...(data.wildcardSlots !== undefined && { wildcardSlots: data.wildcardSlots }),
        ...(data.rulesOverride !== undefined && { rulesOverride: data.rulesOverride }),
        ...(data.status !== undefined && { status: data.status }),
      })
      .where(eq(schema.seriesLegs.id, legId))
      .returning();
    return record;
  }

  async deleteLeg(legId: string) {
    const [record] = await this.db
      .delete(schema.seriesLegs)
      .where(eq(schema.seriesLegs.id, legId))
      .returning();
    return record;
  }

  async findLegsBySeriesId(seriesId: string) {
    return this.db
      .select()
      .from(schema.seriesLegs)
      .where(eq(schema.seriesLegs.seriesId, seriesId))
      .orderBy(schema.seriesLegs.order);
  }

  async findLegById(legId: string) {
    const result = await this.db
      .select()
      .from(schema.seriesLegs)
      .where(eq(schema.seriesLegs.id, legId))
      .limit(1);
    return result[0] || null;
  }

  // ─── Event Operations ─────────────────────────────────────────

  async linkTournament(legId: string, data: LinkEventDto) {
    const [record] = await this.db
      .insert(schema.seriesEvents)
      .values({
        legId,
        tournamentId: data.tournamentId,
        region: data.region || null,
        order: data.order,
        pointMultiplier: data.pointMultiplier !== undefined ? data.pointMultiplier : 1.0,
      })
      .returning();
    return record;
  }

  async unlinkTournament(eventId: string) {
    const [record] = await this.db
      .delete(schema.seriesEvents)
      .where(eq(schema.seriesEvents.id, eventId))
      .returning();
    return record;
  }

  async findEventsByLegId(legId: string) {
    return this.db
      .select({
        event: schema.seriesEvents,
        tournament: schema.tournaments,
      })
      .from(schema.seriesEvents)
      .innerJoin(schema.tournaments, eq(schema.seriesEvents.tournamentId, schema.tournaments.id))
      .where(eq(schema.seriesEvents.legId, legId))
      .orderBy(schema.seriesEvents.order);
  }

  async findEventByTournamentId(tournamentId: string) {
    const result = await this.db
      .select({
        event: schema.seriesEvents,
        leg: schema.seriesLegs,
        series: schema.tournamentSeries,
        tournament: schema.tournaments,
      })
      .from(schema.seriesEvents)
      .innerJoin(schema.seriesLegs, eq(schema.seriesEvents.legId, schema.seriesLegs.id))
      .innerJoin(schema.tournamentSeries, eq(schema.seriesLegs.seriesId, schema.tournamentSeries.id))
      .innerJoin(schema.tournaments, eq(schema.seriesEvents.tournamentId, schema.tournaments.id))
      .where(eq(schema.seriesEvents.tournamentId, tournamentId))
      .limit(1);
    return result[0] || null;
  }

  // ─── Standings & Point Logs ───────────────────────────────────

  async getStandings(legId: string, categoryId?: string, limit = 50, page = 1) {
    const conditions = [eq(schema.seriesStandings.legId, legId)];
    if (categoryId) {
      conditions.push(eq(schema.seriesStandings.categoryId, categoryId));
    }

    const whereClause = and(...conditions);
    const offset = (page - 1) * limit;

    const [{ count: total }] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.seriesStandings)
      .where(whereClause);

    const data = await this.db
      .select({
        standing: schema.seriesStandings,
        user: {
          id: schema.users.id,
          fullName: schema.profiles.fullName,
          avatarUrl: schema.profiles.avatarUrl,
          email: schema.users.email,
        },
        category: schema.categories,
      })
      .from(schema.seriesStandings)
      .innerJoin(schema.users, eq(schema.seriesStandings.userId, schema.users.id))
      .innerJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .innerJoin(schema.categories, eq(schema.seriesStandings.categoryId, schema.categories.id))
      .where(whereClause)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(schema.seriesStandings.totalPsrPoints));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    };
  }

  async getStandingForUser(legId: string, userId: string, categoryId: string) {
    const result = await this.db
      .select()
      .from(schema.seriesStandings)
      .where(
        and(
          eq(schema.seriesStandings.legId, legId),
          eq(schema.seriesStandings.userId, userId),
          eq(schema.seriesStandings.categoryId, categoryId)
        )
      )
      .limit(1);
    return result[0] || null;
  }

  async createStanding(legId: string, userId: string, categoryId: string) {
    const [record] = await this.db
      .insert(schema.seriesStandings)
      .values({
        legId,
        userId,
        categoryId,
        totalPsrPoints: 0,
        eventsPlayed: 0,
        directEntry: false,
        wildcardEntry: false,
        lockedOut: false,
      })
      .returning();
    return record;
  }

  async updateStandingPoints(standingId: string, pointsToAdd: number, bestRank: number, isDirect: boolean, qualifiedEventId: string | null) {
    // Increment totalPsrPoints and eventsPlayed
    const [record] = await this.db
      .update(schema.seriesStandings)
      .set({
        totalPsrPoints: sql`${schema.seriesStandings.totalPsrPoints} + ${pointsToAdd}`,
        eventsPlayed: sql`${schema.seriesStandings.eventsPlayed} + 1`,
        bestRank: sql`CASE WHEN ${schema.seriesStandings.bestRank} IS NULL THEN ${bestRank} ELSE LEAST(${schema.seriesStandings.bestRank}, ${bestRank}) END`,
        ...(isDirect && {
          directEntry: true,
          lockedOut: true, // Exclusion Rule triggers
          qualifiedEventId
        }),
        updatedAt: new Date(),
      })
      .where(eq(schema.seriesStandings.id, standingId))
      .returning();
    return record;
  }

  async createPointLog(standingId: string, eventId: string, participantId: string, rankAchieved: number, basePoints: number, multiplier: number, totalPoints: number, isDirectEntry: boolean) {
    const [record] = await this.db
      .insert(schema.psrPointLogs)
      .values({
        standingId,
        eventId,
        participantId,
        rankAchieved,
        basePoints,
        multiplier,
        totalPoints,
        isDirectEntry,
      })
      .returning();
    return record;
  }

  async getPointLogsByStanding(standingId: string) {
    return this.db
      .select({
        log: schema.psrPointLogs,
        event: schema.seriesEvents,
        tournament: schema.tournaments,
      })
      .from(schema.psrPointLogs)
      .innerJoin(schema.seriesEvents, eq(schema.psrPointLogs.eventId, schema.seriesEvents.id))
      .innerJoin(schema.tournaments, eq(schema.seriesEvents.tournamentId, schema.tournaments.id))
      .where(eq(schema.psrPointLogs.standingId, standingId))
      .orderBy(desc(schema.psrPointLogs.createdAt));
  }

  // Helper to fetch completed standings of a tournament
  async getTournamentRosterRankings(tournamentId: string) {
    // Check final matches or bracket to determine the rank of each participant
    // For single elimination bracket, the final match determines 1st and 2nd.
    // Let's get the final match of the tournament.
    // In our system, matches have participant1Id, participant2Id, winnerId, p1SetsWon, p2SetsWon, roundNumber, bracketBranch.
    // Let's find matches of this tournament.
    const completedMatches = await this.db
      .select({
        match: schema.matches,
        group: schema.tournamentGroups,
        stage: schema.tournamentStages
      })
      .from(schema.matches)
      .innerJoin(schema.tournamentGroups, eq(schema.matches.groupId, schema.tournamentGroups.id))
      .innerJoin(schema.tournamentStages, eq(schema.tournamentGroups.stageId, schema.tournamentStages.id))
      .where(
        and(
          eq(schema.tournamentStages.tournamentId, tournamentId),
          eq(schema.matches.status, 'COMPLETED')
        )
      )
      .orderBy(desc(schema.tournamentStages.order), desc(schema.matches.roundNumber));

    // Simple parser: find the final match (which has roundNumber = max round, or is the last match in the elimination stage)
    const finalMatch = completedMatches.find(m => m.stage.type === 'SINGLE_ELIMINATION' && !m.match.nextMatchId);

    const rankings: { participantId: string; rank: number }[] = [];

    if (finalMatch) {
      const winnerId = finalMatch.match.winnerId;
      const p1Id = finalMatch.match.participant1Id;
      const p2Id = finalMatch.match.participant2Id;

      if (winnerId) {
        rankings.push({ participantId: winnerId, rank: 1 });
        const runnerUpId = winnerId === p1Id ? p2Id : p1Id;
        if (runnerUpId) {
          rankings.push({ participantId: runnerUpId, rank: 2 });
        }
      }
    }

    // Fetch all rosters and participants to get members for ranking
    const participants = await this.db
      .select()
      .from(schema.tournamentParticipants)
      .where(
        and(
          eq(schema.tournamentParticipants.tournamentId, tournamentId),
          sql`${schema.tournamentParticipants.teamStatus} != 'WITHDRAWN'`
        )
      );

    // For all other participants not in top 2, assign rank based on their general matches or default rank 3 for semi-finalists, 5 for quarters, etc.
    for (const p of participants) {
      if (!rankings.some(r => r.participantId === p.id)) {
        // Find which round they lost in
        const lostMatch = completedMatches.find(m => 
          (m.match.participant1Id === p.id || m.match.participant2Id === p.id) && 
          m.match.winnerId !== p.id
        );

        let rank = 17; // Default participation rank
        if (lostMatch) {
          const round = lostMatch.match.roundNumber;
          // Standard bracket rounds: round 3 = semis (rank 3), round 2 = quarters (rank 5), round 1 = round of 16 (rank 9)
          if (round === 3) rank = 3;
          else if (round === 2) rank = 5;
          else if (round === 1) rank = 9;
        }
        rankings.push({ participantId: p.id, rank });
      }
    }

    // Now for each participant, fetch their rosters (users)
    const results: { userId: string; participantId: string; rank: number; isWalkover: boolean }[] = [];
    for (const r of rankings) {
      const rosters = await this.db
        .select()
        .from(schema.tournamentRosters)
        .where(eq(schema.tournamentRosters.participantId, r.participantId));

      const participantMatches = completedMatches.filter(m => 
        (m.match.participant1Id === r.participantId || m.match.participant2Id === r.participantId) &&
        !m.match.isBye &&
        !(m.match.scoreDetails as Record<string, unknown>)?.walkover &&
        !(m.match.scoreDetails as Record<string, unknown>)?.isWalkover
      );
      const isWalkover = participantMatches.length === 0;

      for (const rost of rosters) {
        results.push({
          userId: rost.userId,
          participantId: r.participantId,
          rank: r.rank,
          isWalkover
        });
      }
    }

    return results;
  }

  async resetSeason(seriesId: string) {
    await this.db.transaction(async (tx) => {
      // Find all legs for this series
      const legs = await tx
        .select({ id: schema.seriesLegs.id })
        .from(schema.seriesLegs)
        .where(eq(schema.seriesLegs.seriesId, seriesId));

      const legIds = legs.map((l) => l.id);
      if (legIds.length === 0) return;

      // Reset standings for all legs
      await tx
        .update(schema.seriesStandings)
        .set({
          totalPsrPoints: 0,
          eventsPlayed: 0,
          bestRank: null,
          directEntry: false,
          wildcardEntry: false,
          lockedOut: false,
          qualifiedEventId: null,
          updatedAt: new Date(),
        })
        .where(inArray(schema.seriesStandings.legId, legIds));
    });
  }

  async findUserByEmailOrPhone(emailOrPhone: string) {
    const [result] = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        phone: schema.profiles.phoneNumber,
      })
      .from(schema.users)
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(
        or(
          eq(schema.users.email, emailOrPhone),
          eq(schema.profiles.phoneNumber, emailOrPhone)
        )
      )
      .limit(1);
    return result || null;
  }

  async createInvitation(seriesId: string, email: string | null, phone: string | null, role: string) {
    const [record] = await this.db
      .insert(schema.seriesInvitations)
      .values({
        seriesId,
        email,
        phone,
        role,
        status: 'PENDING',
      })
      .returning();
    return record;
  }

  async findInvitations(seriesId: string) {
    return this.db
      .select()
      .from(schema.seriesInvitations)
      .where(eq(schema.seriesInvitations.seriesId, seriesId))
      .orderBy(desc(schema.seriesInvitations.createdAt));
  }

  async findInvitationById(id: string) {
    const [record] = await this.db
      .select()
      .from(schema.seriesInvitations)
      .where(eq(schema.seriesInvitations.id, id))
      .limit(1);
    return record || null;
  }

  async updateInvitationStatus(id: string, status: 'ACCEPTED' | 'REJECTED') {
    const [record] = await this.db
      .update(schema.seriesInvitations)
      .set({ status })
      .where(eq(schema.seriesInvitations.id, id))
      .returning();
    return record;
  }

  async addManager(seriesId: string, userId: string, role: string) {
    const [record] = await this.db
      .insert(schema.seriesManagers)
      .values({
        seriesId,
        userId,
        role,
      })
      .returning();
    return record;
  }

  async removeManager(seriesId: string, userId: string) {
    const [record] = await this.db
      .delete(schema.seriesManagers)
      .where(
        and(
          eq(schema.seriesManagers.seriesId, seriesId),
          eq(schema.seriesManagers.userId, userId)
        )
      )
      .returning();
    return record;
  }

  async findManagers(seriesId: string) {
    return this.db
      .select({
        manager: schema.seriesManagers,
        user: {
          id: schema.users.id,
          email: schema.users.email,
          fullName: schema.profiles.fullName,
          avatarUrl: schema.profiles.avatarUrl,
        }
      })
      .from(schema.seriesManagers)
      .innerJoin(schema.users, eq(schema.seriesManagers.userId, schema.users.id))
      .innerJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(eq(schema.seriesManagers.seriesId, seriesId))
      .orderBy(desc(schema.seriesManagers.createdAt));
  }
}
