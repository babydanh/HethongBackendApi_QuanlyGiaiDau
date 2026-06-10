import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { PG_CONNECTION } from '../../database/database.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../database/schema';
import { eq, ne, ilike, and, count, SQL, inArray, sql } from 'drizzle-orm';
import { AuditService, Transaction } from '../audit/audit.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { QueryTournamentDto } from './dto/query-tournament.dto';
import { RegisterTournamentDto } from './dto/register-tournament.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { RosterMember, BracketMatch, BracketGroup, BracketStage } from './interfaces/tournament-config.interface';

@Injectable()
export class TournamentsRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: NodePgDatabase<typeof schema>,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: QueryTournamentDto) {
    const { page = 1, limit = 10, search, categoryId, status, tournamentType, matchType, communityId } = query;
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [];

    // Always exclude soft-deleted tournaments
    conditions.push(sql`${schema.tournaments.deletedAt} IS NULL`);

    // Exclude DRAFT tournaments from public listing
    conditions.push(ne(schema.tournaments.status, 'DRAFT'));

    if (search) {
      conditions.push(ilike(schema.tournaments.name, `%${search}%`));
    }
    if (categoryId) {
      conditions.push(eq(schema.tournaments.categoryId, categoryId));
    }
    if (status) {
      conditions.push(eq(schema.tournaments.status, status));
    }
    if (tournamentType) {
      conditions.push(eq(schema.tournaments.tournamentType, tournamentType));
    }
    if (matchType) {
      conditions.push(eq(schema.tournaments.matchType, matchType));
    }
    if (communityId) {
      conditions.push(eq(schema.tournaments.communityId, communityId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRecord] = await this.db
      .select({ count: count() })
      .from(schema.tournaments)
      .where(whereClause);

    const data = await this.db
      .select()
      .from(schema.tournaments)
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

  async generateUniqueInviteCode(tx: Transaction | NodePgDatabase<typeof schema>): Promise<string> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    let exists = true;
    while (exists) {
      code = '';
      for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const existing = await tx
        .select({ id: schema.tournaments.id })
        .from(schema.tournaments)
        .where(eq(schema.tournaments.inviteCode, code))
        .limit(1);
      if (existing.length === 0) {
        exists = false;
      }
    }
    return code;
  }

  async findById(id: string) {
    const result = await this.db
      .select({
        tournament: schema.tournaments,
        category: {
          id: schema.categories.id,
          name: schema.categories.name,
          slug: schema.categories.slug,
        },
        community: {
          id: schema.communities.id,
          name: schema.communities.name,
          logoUrl: schema.communities.logoUrl,
        },
        venue: {
          id: schema.tournamentVenues.id,
          name: schema.tournamentVenues.name,
          locationAddress: schema.tournamentVenues.locationAddress,
        },
        creator: {
          id: schema.users.id,
          fullName: schema.profiles.fullName,
          avatarUrl: schema.profiles.avatarUrl,
        },
      })
      .from(schema.tournaments)
      .leftJoin(schema.categories, eq(schema.tournaments.categoryId, schema.categories.id))
      .leftJoin(schema.communities, eq(schema.tournaments.communityId, schema.communities.id))
      .leftJoin(schema.tournamentVenues, eq(schema.tournaments.venueId, schema.tournamentVenues.id))
      .leftJoin(schema.users, eq(schema.tournaments.createdBy, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(eq(schema.tournaments.id, id))
      .limit(1);

    if (result.length === 0) return null;
    const row = result[0];

    // Count participants
    const [participantCount] = await this.db
      .select({ count: count() })
      .from(schema.tournamentParticipants)
      .where(eq(schema.tournamentParticipants.tournamentId, id));

    // Count matches summary
    let matchesTotal = 0;
    let matchesCompleted = 0;
    let matchesLive = 0;

    try {
      const [totalCount] = await this.db
        .select({ count: count() })
        .from(schema.matches)
        .innerJoin(schema.tournamentGroups, eq(schema.matches.groupId, schema.tournamentGroups.id))
        .innerJoin(schema.tournamentStages, eq(schema.tournamentGroups.stageId, schema.tournamentStages.id))
        .where(eq(schema.tournamentStages.tournamentId, id));
      matchesTotal = totalCount.count;

      const [completedCount] = await this.db
        .select({ count: count() })
        .from(schema.matches)
        .innerJoin(schema.tournamentGroups, eq(schema.matches.groupId, schema.tournamentGroups.id))
        .innerJoin(schema.tournamentStages, eq(schema.tournamentGroups.stageId, schema.tournamentStages.id))
        .where(
          and(
            eq(schema.tournamentStages.tournamentId, id),
            eq(schema.matches.status, 'COMPLETED')
          )
        );
      matchesCompleted = completedCount.count;

      const [liveCount] = await this.db
        .select({ count: count() })
        .from(schema.matches)
        .innerJoin(schema.tournamentGroups, eq(schema.matches.groupId, schema.tournamentGroups.id))
        .innerJoin(schema.tournamentStages, eq(schema.tournamentGroups.stageId, schema.tournamentStages.id))
        .where(
          and(
            eq(schema.tournamentStages.tournamentId, id),
            eq(schema.matches.status, 'ONGOING')
          )
        );
      matchesLive = liveCount.count;
    } catch (e) {
      // ignore table or column errors in case matches tables are empty
    }

    return {
      ...row.tournament,
      category: row.category?.id ? row.category : null,
      community: row.community?.id ? row.community : null,
      venue: row.venue?.id ? row.venue : null,
      creator: row.creator?.id ? row.creator : null,
      _summary: {
        participantCount: participantCount.count,
        matchesTotal,
        matchesCompleted,
        matchesLive,
      },
    };
  }

  async create(userId: string, data: CreateTournamentDto) {
    return await this.db.transaction(async (tx) => {
      const inviteCode = await this.generateUniqueInviteCode(tx);
      const [record] = await tx
        .insert(schema.tournaments)
        .values({
          createdBy: userId,
          name: data.name,
          categoryId: data.categoryId,
          communityId: data.communityId || null,
          description: data.description || null,
          sportRules: data.sportRules as typeof schema.tournaments.$inferInsert['sportRules'],
          tournamentConfig: data.tournamentConfig as typeof schema.tournaments.$inferInsert['tournamentConfig'],
          entryFee: (data.entryFee || 0).toString(),
          platformFeePercentage: (data.platformFeePercentage || 5.0).toString(),
          registrationStartDate: data.registrationStartDate ? new Date(data.registrationStartDate) : null,
          registrationEndDate: data.registrationEndDate ? new Date(data.registrationEndDate) : null,
          maxParticipants: data.maxParticipants || null,
          startDate: data.startDate ? new Date(data.startDate) : null,
          endDate: data.endDate ? new Date(data.endDate) : null,
          venueId: data.venueId || null,
          tournamentType: data.tournamentType || 'CLUB',
          bannerUrl: data.bannerUrl || null,
          logoUrl: data.logoUrl || null,
          galleryImages: data.galleryImages || [],
          prizeDescription: data.prizeDescription || null,
          prizes: data.prizes as typeof schema.tournaments.$inferInsert['prizes'],
          inviteCode: inviteCode,
          contactInfo: data.contactInfo as typeof schema.tournaments.$inferInsert['contactInfo'],
          status: 'DRAFT',
          platformFeePerPlayer: data.platformFeePerPlayer !== undefined ? data.platformFeePerPlayer : 10000,
        })
        .returning();
      
      await this.auditService.logCreate(tx, userId, 'tournaments', record.id, record);
      return record;
    });
  }

  async update(id: string, userId: string, data: UpdateTournamentDto) {
    return await this.db.transaction(async (tx) => {
      const [oldRecord] = await tx.select().from(schema.tournaments).where(eq(schema.tournaments.id, id)).limit(1);

      const [updated] = await tx
        .update(schema.tournaments)
        .set({
          ...(data.name && { name: data.name }),
          ...(data.categoryId && { categoryId: data.categoryId }),
          ...(data.communityId !== undefined && { communityId: data.communityId }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.status && { status: data.status }),
          ...(data.sportRules && { sportRules: data.sportRules as typeof schema.tournaments.$inferInsert['sportRules'] }),
          ...(data.tournamentConfig && {
            tournamentConfig: data.tournamentConfig as typeof schema.tournaments.$inferInsert['tournamentConfig'],
          }),
          ...(data.entryFee !== undefined && {
            entryFee: data.entryFee.toString(),
          }),
          ...(data.platformFeePercentage !== undefined && {
            platformFeePercentage: data.platformFeePercentage.toString(),
          }),
          ...(data.platformFeePerPlayer !== undefined && {
            platformFeePerPlayer: data.platformFeePerPlayer,
          }),
          ...(data.registrationStartDate !== undefined && {
            registrationStartDate: data.registrationStartDate ? new Date(data.registrationStartDate) : null,
          }),
          ...(data.registrationEndDate !== undefined && {
            registrationEndDate: data.registrationEndDate ? new Date(data.registrationEndDate) : null,
          }),
          ...(data.maxParticipants !== undefined && { maxParticipants: data.maxParticipants }),
          ...(data.startDate && { startDate: new Date(data.startDate) }),
          ...(data.endDate && { endDate: new Date(data.endDate) }),
          ...(data.venueId !== undefined && { venueId: data.venueId }),
          ...(data.tournamentType && { tournamentType: data.tournamentType }),
          ...(data.bannerUrl !== undefined && { bannerUrl: data.bannerUrl }),
          ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
          ...(data.galleryImages !== undefined && { galleryImages: data.galleryImages }),
          ...(data.prizeDescription !== undefined && { prizeDescription: data.prizeDescription }),
          ...(data.prizes !== undefined && { prizes: data.prizes as typeof schema.tournaments.$inferInsert['prizes'] }),
          ...(data.contactInfo !== undefined && { contactInfo: data.contactInfo as typeof schema.tournaments.$inferInsert['contactInfo'] }),
          updatedAt: new Date(),
        })
        .where(eq(schema.tournaments.id, id))
        .returning();

      await this.auditService.logUpdate(tx, userId, 'tournaments', id, oldRecord, updated);
      return updated;
    });
  }

  async softDelete(id: string, userId: string) {
    return await this.db.transaction(async (tx) => {
      const [oldRecord] = await tx.select().from(schema.tournaments).where(eq(schema.tournaments.id, id)).limit(1);

      const [deleted] = await tx
        .update(schema.tournaments)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.tournaments.id, id))
        .returning();

      await this.auditService.logDelete(tx, userId, 'tournaments', id, oldRecord);
      return deleted;
    });
  }

  async registerParticipant(tournamentId: string, userId: string, data: RegisterTournamentDto) {
    return await this.db.transaction(async (tx) => {
      // 1. Kiểm tra giải đấu
      const [tournament] = await tx
        .select()
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, tournamentId))
        .limit(1);

      if (!tournament) {
        throw new BadRequestException('Tournament not found');
      }

      // 2. Kiểm tra trạng thái - phải mở đăng ký (chấp nhận REGISTRATION_OPEN)
      if (tournament.status !== 'REGISTRATION_OPEN') {
        throw new BadRequestException('Tournament is not open for registration');
      }

      // 3. Kiểm tra thời hạn đăng ký
      const now = new Date();
      if (tournament.registrationStartDate && now < tournament.registrationStartDate) {
        throw new BadRequestException('Registration has not started yet');
      }
      if (tournament.registrationEndDate && now > tournament.registrationEndDate) {
        throw new BadRequestException('Registration has ended');
      }

      // 4. Kiểm tra số lượng
      if (tournament.maxParticipants) {
        const [participantCount] = await tx
          .select({ count: count() })
          .from(schema.tournamentParticipants)
          .where(eq(schema.tournamentParticipants.tournamentId, tournamentId));
        
        if (participantCount.count >= tournament.maxParticipants) {
          throw new BadRequestException('Tournament is full');
        }
      }

      // 5. CLUB check: user must be community member
      if (tournament.tournamentType === 'CLUB' && tournament.communityId) {
        const member = await tx
          .select()
          .from(schema.communityMembers)
          .where(
            and(
              eq(schema.communityMembers.communityId, tournament.communityId),
              eq(schema.communityMembers.userId, userId)
            )
          )
          .limit(1);
        if (member.length === 0) {
          throw new BadRequestException('You must be a member of the community to join this club tournament');
        }
      }

      // 6. MatchType doubles / singles checks
      if (tournament.matchType === 'DOUBLES' || tournament.matchType === 'MIXED_DOUBLES') {
        if (!data.memberIds || data.memberIds.length !== 2) {
          throw new BadRequestException('Doubles team must have exactly 2 members');
        }
        if (!data.memberIds.includes(userId)) {
          throw new BadRequestException('You must be one of the members of the team');
        }
      } else if (tournament.matchType === 'SINGLES') {
        if (!data.memberIds || data.memberIds.length !== 1 || data.memberIds[0] !== userId) {
          throw new BadRequestException('Singles team must have exactly 1 member (yourself)');
        }
      }

      // 7. Check if any of the team members are already registered in this tournament
      const existingRosters = await tx
        .select({ userId: schema.tournamentRosters.userId })
        .from(schema.tournamentRosters)
        .innerJoin(schema.tournamentParticipants, eq(schema.tournamentRosters.participantId, schema.tournamentParticipants.id))
        .where(
          and(
            eq(schema.tournamentParticipants.tournamentId, tournamentId),
            inArray(schema.tournamentRosters.userId, data.memberIds)
          )
        );
      if (existingRosters.length > 0) {
        throw new BadRequestException('One or more team members are already registered in this tournament');
      }

      // 8. Thêm participant
      const [participant] = await tx
        .insert(schema.tournamentParticipants)
        .values({
          tournamentId,
          registeredBy: userId,
          teamName: data.teamName,
          isPaid: false, // Mặc định chưa thanh toán
        })
        .returning();

      // 9. Thêm rosters
      const rostersData = data.memberIds.map(memberId => ({
        participantId: participant.id,
        userId: memberId,
        role: 'MAIN',
      }));

      await tx.insert(schema.tournamentRosters).values(rostersData);

      // 10. Audit log
      await this.auditService.logCreate(tx, userId, 'tournament_participants', participant.id, participant);

      return participant;
    });
  }

  async findCommunityMember(communityId: string, userId: string) {
    const records = await this.db
      .select()
      .from(schema.communityMembers)
      .where(
        and(
          eq(schema.communityMembers.communityId, communityId),
          eq(schema.communityMembers.userId, userId),
        ),
      )
      .limit(1);
    return records[0];
  }

  async findParticipants(
    tournamentId: string,
    categoryId: string,
  ): Promise<
    {
      id: string;
      teamName: string;
      seed: number | null;
      isPaid: boolean;
      registeredAt: Date;
      registeredBy: {
        id: string | null;
        fullName: string | null;
        avatarUrl: string | null;
      } | null;
      members: RosterMember[];
    }[]
  > {
    // 1. Fetch participants and their registeredBy info
    const participants = await this.db
      .select({
        id: schema.tournamentParticipants.id,
        teamName: schema.tournamentParticipants.teamName,
        seed: schema.tournamentParticipants.seed,
        isPaid: schema.tournamentParticipants.isPaid,
        registeredAt: schema.tournamentParticipants.registeredAt,
        registeredBy: {
          id: schema.users.id,
          fullName: schema.profiles.fullName,
          avatarUrl: schema.profiles.avatarUrl,
        },
      })
      .from(schema.tournamentParticipants)
      .leftJoin(schema.users, eq(schema.tournamentParticipants.registeredBy, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(eq(schema.tournamentParticipants.tournamentId, tournamentId));

    if (participants.length === 0) return [];

    // 2. Fetch rosters and ELO info for all participant IDs
    const participantIds = participants.map((p) => p.id);

    const rosters = await this.db
      .select({
        participantId: schema.tournamentRosters.participantId,
        userId: schema.tournamentRosters.userId,
        role: schema.tournamentRosters.role,
        fullName: schema.profiles.fullName,
        avatarUrl: schema.profiles.avatarUrl,
        eloPoints: schema.userRanks.eloPoints,
        tierName: schema.eloTiers.name,
      })
      .from(schema.tournamentRosters)
      .leftJoin(schema.users, eq(schema.tournamentRosters.userId, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .leftJoin(
        schema.userRanks,
        and(
          eq(schema.tournamentRosters.userId, schema.userRanks.userId),
          eq(schema.userRanks.categoryId, categoryId)
        )
      )
      .leftJoin(schema.eloTiers, eq(schema.userRanks.tierId, schema.eloTiers.id))
      .where(inArray(schema.tournamentRosters.participantId, participantIds));

    // Group rosters by participantId
    const rostersMap = new Map<string, RosterMember[]>();
    for (const r of rosters) {
      const list = rostersMap.get(r.participantId) || [];
      list.push({
        userId: r.userId,
        fullName: r.fullName,
        avatarUrl: r.avatarUrl,
        role: r.role,
        elo: {
          eloPoints: r.eloPoints ?? 1200,
          tierName: r.tierName ?? 'Beginner',
        },
      });
      rostersMap.set(r.participantId, list);
    }

    return participants.map((p) => ({
      ...p,
      members: rostersMap.get(p.id) || [],
    }));
  }

  async findBracket(tournamentId: string): Promise<{ stages: BracketStage[] }> {
    const stages = await this.db
      .select()
      .from(schema.tournamentStages)
      .where(eq(schema.tournamentStages.tournamentId, tournamentId))
      .orderBy(schema.tournamentStages.order);

    if (stages.length === 0) return { stages: [] };

    const stageIds = stages.map((s) => s.id);

    const groups = await this.db
      .select()
      .from(schema.tournamentGroups)
      .where(inArray(schema.tournamentGroups.stageId, stageIds));

    const groupIds = groups.map((g) => g.id);

    let matchesList: BracketMatch[] = [];
    if (groupIds.length > 0) {
      const dbMatches = await this.db
        .select()
        .from(schema.matches)
        .where(inArray(schema.matches.groupId, groupIds))
        .orderBy(schema.matches.roundNumber, schema.matches.matchOrder);
      
      const participants = await this.db
        .select({
          id: schema.tournamentParticipants.id,
          teamName: schema.tournamentParticipants.teamName,
          seed: schema.tournamentParticipants.seed,
        })
        .from(schema.tournamentParticipants)
        .where(eq(schema.tournamentParticipants.tournamentId, tournamentId));

      const participantMap = new Map(participants.map((p) => [p.id, p]));

      matchesList = dbMatches.map((m) => ({
        ...m,
        participant1: m.participant1Id ? participantMap.get(m.participant1Id) : null,
        participant2: m.participant2Id ? participantMap.get(m.participant2Id) : null,
      }));
    }

    const groupsMap = new Map<string, BracketGroup[]>();
    for (const g of groups) {
      const groupMatches = matchesList.filter((m) => m.groupId === g.id);
      const list = groupsMap.get(g.stageId) || [];
      list.push({
        id: g.id,
        name: g.name,
        matches: groupMatches,
      });
      groupsMap.set(g.stageId, list);
    }

    return {
      stages: stages.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        order: s.order,
        groups: groupsMap.get(s.id) || [],
      })),
    };
  }

  async findByInviteCode(inviteCode: string) {
    const result = await this.db
      .select()
      .from(schema.tournaments)
      .where(eq(schema.tournaments.inviteCode, inviteCode))
      .limit(1);

    if (result.length === 0) return null;
    return result[0];
  }

  async findMyTournaments(userId: string) {
    // 1. Tournaments created by user
    const created = await this.db
      .select({ id: schema.tournaments.id })
      .from(schema.tournaments)
      .where(
        and(
          eq(schema.tournaments.createdBy, userId),
          sql`${schema.tournaments.deletedAt} IS NULL`
        )
      );

    // 2. Tournaments joined by user
    const joined = await this.db
      .select({ id: schema.tournaments.id })
      .from(schema.tournaments)
      .innerJoin(schema.tournamentParticipants, eq(schema.tournaments.id, schema.tournamentParticipants.tournamentId))
      .innerJoin(schema.tournamentRosters, eq(schema.tournamentParticipants.id, schema.tournamentRosters.participantId))
      .where(
        and(
          eq(schema.tournamentRosters.userId, userId),
          sql`${schema.tournaments.deletedAt} IS NULL`
        )
      );

    const ids = Array.from(new Set([...created.map(t => t.id), ...joined.map(t => t.id)]));
    if (ids.length === 0) return [];

    return await this.db
      .select()
      .from(schema.tournaments)
      .where(
        and(
          inArray(schema.tournaments.id, ids),
          sql`${schema.tournaments.deletedAt} IS NULL`
        )
      );
  }

  async findCategory(id: string) {
    const result = await this.db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.id, id))
      .limit(1);
    if (result.length === 0) return null;
    return result[0];
  }

  async regenerateInviteCode(id: string, userId: string) {
    return await this.db.transaction(async (tx) => {
      const newCode = await this.generateUniqueInviteCode(tx);
      const [oldRecord] = await tx.select().from(schema.tournaments).where(eq(schema.tournaments.id, id)).limit(1);

      const [updated] = await tx
        .update(schema.tournaments)
        .set({ inviteCode: newCode, updatedAt: new Date() })
        .where(eq(schema.tournaments.id, id))
        .returning();

      await this.auditService.logUpdate(tx, userId, 'tournaments', id, oldRecord, updated);
      return updated;
    });
  }

  async findStageById(id: string) {
    const result = await this.db
      .select()
      .from(schema.tournamentStages)
      .where(eq(schema.tournamentStages.id, id))
      .limit(1);
    return result[0] || null;
  }

  async updateStage(id: string, userId: string, data: UpdateStageDto) {
    return await this.db.transaction(async (tx) => {
      const [oldRecord] = await tx
        .select()
        .from(schema.tournamentStages)
        .where(eq(schema.tournamentStages.id, id))
        .limit(1);

      if (!oldRecord) return null;

      const [updated] = await tx
        .update(schema.tournamentStages)
        .set({
          ...(data.name && { name: data.name }),
          ...(data.type && { type: data.type }),
          ...(data.order !== undefined && { order: data.order }),
          ...(data.roundConfig !== undefined && { roundConfig: data.roundConfig }),
          ...(data.venueId !== undefined && { venueId: data.venueId || null }),
          ...(data.scheduledDate !== undefined && {
            scheduledDate: data.scheduledDate || null,
          }),
          ...(data.notificationNote !== undefined && {
            notificationNote: data.notificationNote || null,
          }),
        })
        .where(eq(schema.tournamentStages.id, id))
        .returning();

      await this.auditService.logUpdate(tx, userId, 'tournament_stages', id, oldRecord, updated);
      return updated;
    });
  }
}
