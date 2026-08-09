import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb, AppDbOrTx } from '../../database/db.types';
import * as schema from '../../database/schema';
import { PaymentStatus } from '../../common/constants/enums';
import { eq, ne, ilike, and, or, count, SQL, inArray, sql, lt, like, isNull, desc, asc } from 'drizzle-orm';
import { AuditService, Transaction } from '../audit/audit.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { QueryTournamentDto } from './dto/query-tournament.dto';
import { RegisterTournamentDto } from './dto/register-tournament.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { CreateParentTournamentDto } from './dto/create-parent-tournament.dto';
import { UpdateParentTournamentDto } from './dto/update-parent-tournament.dto';
import { CreateDivisionDto } from './dto/create-division.dto';
import { UpdateDivisionDto } from './dto/update-division.dto';
import { RosterMember, BracketMatch, BracketGroup, BracketStage } from './interfaces/tournament-config.interface';
import { SeriesService } from '../series/series.service';
import { ExclusionRuleException } from '../series/exceptions/exclusion-rule.exception';
import {
  resolveLoserTargetSlot,
  resolveWinnerTargetSlot,
} from '../../common/helpers/bracket-advancement.helper';

@Injectable()
export class TournamentsRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
    private readonly auditService: AuditService,
    private readonly seriesService: SeriesService,
  ) {}

  private isDoublesMatchType(matchType: string | null | undefined) {
    return matchType === 'DOUBLES' || matchType === 'MIXED_DOUBLES';
  }

  /** Preserve unrelated stage settings when a partial round configuration is saved. */
  private mergeRoundConfig(existing: unknown, incoming: unknown): Record<string, unknown> {
    const previous = existing && typeof existing === 'object' && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
    const next = incoming && typeof incoming === 'object' && !Array.isArray(incoming)
      ? (incoming as Record<string, unknown>)
      : {};
    const merged: Record<string, unknown> = { ...previous, ...next };

    for (const key of ['groupsConfig', 'advancementConfig', 'playoffConfig', 'scoring', 'tiebreakerRules', 'rounds']) {
      const previousValue = previous[key];
      const nextValue = next[key];
      if (
        previousValue && typeof previousValue === 'object' && !Array.isArray(previousValue) &&
        nextValue && typeof nextValue === 'object' && !Array.isArray(nextValue)
      ) {
        merged[key] = {
          ...(previousValue as Record<string, unknown>),
          ...(nextValue as Record<string, unknown>),
        };
      }
    }

    return merged;
  }

  private async resolveDivisionEntryFee(
    tx: Transaction | AppDbOrTx,
    tournament: { entryFee: string | null },
    divisionId?: string | null,
  ) {
    if (divisionId) {
      const [division] = await tx
        .select({ entryFee: schema.tournamentDivisions.entryFee })
        .from(schema.tournamentDivisions)
        .where(eq(schema.tournamentDivisions.id, divisionId))
        .limit(1);

      if (division?.entryFee !== undefined && division.entryFee !== null) {
        return parseFloat(division.entryFee);
      }
    }

    return parseFloat(tournament.entryFee || '0');
  }

  private async invalidatePendingParticipantPayments(
    tx: Transaction | AppDbOrTx,
    tournamentId: string,
    participantId: string,
    reason: string,
  ) {
    const pendingPayments = await tx
      .select({
        id: schema.payments.id,
        status: schema.payments.status,
      })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.tournamentId, tournamentId),
          eq(schema.payments.participantId, participantId),
          eq(schema.payments.status, PaymentStatus.PENDING),
        ),
      );

    if (pendingPayments.length === 0) {
      return;
    }

    const paymentIds = pendingPayments.map((payment) => payment.id);
    await tx
      .update(schema.payments)
      .set({
        status: 'CANCELLED',
        updatedAt: new Date(),
      })
      .where(inArray(schema.payments.id, paymentIds));

    await tx.insert(schema.paymentStatusLogs).values(
      pendingPayments.map((payment) => ({
        paymentId: payment.id,
        previousStatus: payment.status,
        newStatus: 'CANCELLED',
        reason,
      })),
    );
  }

  async findAll(
    query: QueryTournamentDto,
    options?: {
      defaultTournamentType?: 'CLUB' | 'PUBLIC' | null;
      defaultVisibility?: 'PUBLIC' | 'PRIVATE' | null;
    },
  ) {
    const { page = 1, limit = 10, search, categoryId, status, tournamentType, matchType, communityId, visibility, region, createdBy, startDate, endDate, bracketType, genderRestriction, isRanked } = query;
    const offset = (page - 1) * limit;
    const defaultTournamentType = options?.defaultTournamentType;
    const defaultVisibility = options?.defaultVisibility;

    const conditions: SQL[] = [];

    // Always exclude soft-deleted tournaments
    conditions.push(sql`${schema.tournaments.deletedAt} IS NULL`);

    // Exclude DRAFT, PENDING_APPROVAL, SUSPENDED, CANCELLED, and PENDING_DELETE tournaments from public listing (unless createdBy is specified)
    if (!createdBy) {
      conditions.push(sql`${schema.tournaments.status} NOT IN ('DRAFT', 'PENDING_APPROVAL', 'SUSPENDED', 'CANCELLED', 'PENDING_DELETE', 'pending_delete')`);
    }

    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        sql`(${schema.tournaments.name}::text ILIKE ${pattern} OR ${schema.tournaments.description}::text ILIKE ${pattern} OR ${schema.tournaments.city}::text ILIKE ${pattern})`
      );
    }
    if (categoryId) {
      conditions.push(eq(schema.tournaments.categoryId, categoryId));
    }
    if (status) {
      conditions.push(eq(schema.tournaments.status, status));
    }
    if (communityId) {
      conditions.push(eq(schema.tournaments.communityId, communityId));
      const type = tournamentType || defaultTournamentType || 'CLUB';
      if (type) {
        conditions.push(eq(schema.tournaments.tournamentType, type));
      }
    } else {
      const type = tournamentType || defaultTournamentType;
      if (type) {
        conditions.push(eq(schema.tournaments.tournamentType, type));
      }
    }
    if (matchType || genderRestriction) {
      const matchConds: SQL[] = [];
      if (matchType) {
        matchConds.push(eq(schema.tournaments.matchType, matchType));
      }
      if (genderRestriction) {
        matchConds.push(
          or(
            eq(schema.tournaments.genderRestriction, genderRestriction),
            isNull(schema.tournaments.genderRestriction)
          ) as SQL
        );
      }

      conditions.push(
        or(
          and(...matchConds),
          sql`exists (
            select 1 from ${schema.tournamentDivisions} d
            where d.tournament_id = ${schema.tournaments.id}
            ${matchType ? sql`and d.match_type = ${matchType}` : sql``}
            ${genderRestriction ? sql`and (d.gender_restriction = ${genderRestriction} or d.gender_restriction is null)` : sql``}
          )`
        ) as SQL
      );
    }
    if (bracketType) {
      conditions.push(sql`${schema.tournaments.tournamentConfig}->>'bracketType' = ${bracketType}`);
    }
    if (isRanked !== undefined) {
      conditions.push(eq(schema.tournaments.isRanked, isRanked));
    }

    if (createdBy) {
      conditions.push(eq(schema.tournaments.createdBy, createdBy));
      if (visibility) {
        conditions.push(eq(schema.tournaments.visibility, visibility));
      }
    } else {
      const reqVisibility = visibility || defaultVisibility;
      if (reqVisibility) {
        conditions.push(eq(schema.tournaments.visibility, reqVisibility));
      }
    }

    if (region) {
      conditions.push(
        sql`exists (
          select 1 from ${schema.tournamentVenues} v 
          where v.id = ${schema.tournaments.venueId} 
          and v.location_address ilike ${`%${region}%`}
        )`
      );
    }

    if (startDate) {
      conditions.push(sql`date(${schema.tournaments.endDate}) >= ${startDate}::date`);
    }

    if (endDate) {
      conditions.push(sql`date(coalesce(${schema.tournaments.registrationStartDate}, ${schema.tournaments.startDate})) <= ${endDate}::date`);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRecord] = await this.db
      .select({ count: count() })
      .from(schema.tournaments)
      .where(whereClause);

    const rows = await this.db
      .select({
        tournament: schema.tournaments,
        category: {
          id: schema.categories.id,
          name: schema.categories.name,
          slug: schema.categories.slug,
        },
        venue: {
          id: schema.tournamentVenues.id,
          name: schema.tournamentVenues.name,
          locationAddress: schema.tournamentVenues.locationAddress,
        },
      })
      .from(schema.tournaments)
      .leftJoin(schema.categories, eq(schema.tournaments.categoryId, schema.categories.id))
      .leftJoin(schema.tournamentVenues, eq(schema.tournaments.venueId, schema.tournamentVenues.id))
      .where(whereClause)
      .orderBy(sql`${schema.tournaments.createdAt} DESC`)
      .limit(limit)
      .offset(offset);

    const data = await Promise.all(
      rows.map(async (row) => {
        const [participantCount] = await this.db
          .select({ count: count() })
          .from(schema.tournamentParticipants)
          .where(
            and(
              eq(schema.tournamentParticipants.tournamentId, row.tournament.id),
              ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
              ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
              ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
            ),
          );

        type DivisionInfo = {
          id: string;
          name: string;
          matchType: string;
          genderRestriction: string | null;
          status: string;
          categoryId: string;
          maxParticipants: number | null;
          inviteCode: string | null;
          _count: { participants: number };
        };
        const rawDivs = await this.db
          .select({
            id: schema.tournamentDivisions.id,
            name: schema.tournamentDivisions.name,
            matchType: schema.tournamentDivisions.matchType,
            genderRestriction: schema.tournamentDivisions.genderRestriction,
            status: schema.tournamentDivisions.status,
            maxParticipants: schema.tournamentDivisions.maxParticipants,
          })
          .from(schema.tournamentDivisions)
          .where(eq(schema.tournamentDivisions.tournamentId, row.tournament.id));

        const divisions: DivisionInfo[] = await Promise.all(
          rawDivs.map(async (d) => {
            const [dCount] = await this.db
              .select({ count: count() })
              .from(schema.tournamentParticipants)
              .where(
                and(
                  eq(schema.tournamentParticipants.tournamentDivisionId, d.id),
                  ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
                  ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
                  ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
                ),
              );
            return {
              ...d,
              categoryId: row.tournament.categoryId,
              inviteCode: row.tournament.inviteCode,
              _count: {
                participants: dCount.count,
              },
            };
          })
        );

        return {
          ...row.tournament,
          category: row.category?.id ? row.category : null,
          venue: row.venue?.id ? row.venue : null,
          _count: {
            participants: participantCount.count,
          },
          divisions: divisions.length > 0 ? divisions : null,
        };
      })
    );

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

  async generateUniqueInviteCode(tx: Transaction | AppDbOrTx): Promise<string> {
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
      .where(
        and(
          eq(schema.tournaments.id, id),
          isNull(schema.tournaments.deletedAt)
        )
      )
      .limit(1);

    if (result.length === 0) return null;
    const row = result[0];

    // Count participants
    const [participantCount] = await this.db
      .select({ count: count() })
      .from(schema.tournamentParticipants)
      .where(
        and(
          eq(schema.tournamentParticipants.tournamentId, id),
          ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
          ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
          ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
        ),
      );

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
    } catch {
      // ignore table or column errors in case matches tables are empty
    }

    // Reputation check for organizer
    let isTrusted = false;
    if (row.tournament.createdBy) {
      const [resultCount] = await this.db
        .select({ count: count() })
        .from(schema.tournaments)
        .where(
          and(
            eq(schema.tournaments.createdBy, row.tournament.createdBy),
            eq(schema.tournaments.visibility, 'PUBLIC'),
            eq(schema.tournaments.status, 'COMPLETED'),
            sql`${schema.tournaments.deletedAt} IS NULL`
          )
        );
      isTrusted = resultCount.count >= 3;
    }

    const parentId = row.tournament.parentId;
    let parent: typeof schema.parentTournaments.$inferSelect | null = null;
    let divisions: {
      id: string;
      name: string;
      matchType: string;
      genderRestriction: string | null;
      status: string;
      categoryId: string;
      maxParticipants: number | null;
      inviteCode: string | null;
      _count?: {
        participants: number;
        matches: number;
      };
    }[] = [];

    if (parentId) {
      const [parentRecord] = await this.db
        .select()
        .from(schema.parentTournaments)
        .where(eq(schema.parentTournaments.id, parentId))
        .limit(1);
      parent = parentRecord || null;
    }

    const rawDivisions = await this.db
      .select({
        id: schema.tournamentDivisions.id,
        name: schema.tournamentDivisions.name,
        matchType: schema.tournamentDivisions.matchType,
        genderRestriction: schema.tournamentDivisions.genderRestriction,
        status: schema.tournamentDivisions.status,
        maxParticipants: schema.tournamentDivisions.maxParticipants,
      })
      .from(schema.tournamentDivisions)
      .where(eq(schema.tournamentDivisions.tournamentId, id));

    divisions = await Promise.all(
      rawDivisions.map(async (division) => {
        const [participantCountByDivision] = await this.db
          .select({ count: count() })
          .from(schema.tournamentParticipants)
          .where(
            and(
              eq(schema.tournamentParticipants.tournamentDivisionId, division.id),
              ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
              ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
              ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
            ),
          );

        const [matchCountByDivision] = await this.db
          .select({ count: count() })
          .from(schema.tournamentStages)
          .where(eq(schema.tournamentStages.tournamentDivisionId, division.id));

        return {
          ...division,
          categoryId: row.tournament.categoryId,
          inviteCode: row.tournament.inviteCode,
          _count: {
            participants: participantCountByDivision.count,
            matches: matchCountByDivision.count,
          },
        };
      })
    );

    return {
      ...row.tournament,
      category: row.category?.id ? row.category : null,
      community: row.community?.id ? row.community : null,
      venue: row.venue?.id ? row.venue : null,
      creator: row.creator?.id ? row.creator : null,
      organizer: row.creator?.id ? { 
        id: row.creator.id, 
        fullName: row.creator.fullName, 
        avatarUrl: row.creator.avatarUrl,
        isTrusted
      } : null,
      _summary: {
        participantCount: participantCount.count,
        matchesTotal,
        matchesCompleted,
        matchesLive,
      },
      parent,
      divisions,
    };
  }

  async create(userId: string, data: CreateTournamentDto) {
    return await this.db.transaction(async (tx) => {
      const inviteCode = await this.generateUniqueInviteCode(tx);

      // Get platform fee percentage from configs dynamically
      let configKey = 'PLATFORM_FEE_PERCENTAGE_CLUB';
      let defaultPct = '0';
      if (data.tournamentType === 'PUBLIC') {
        configKey = data.isRanked ? 'PLATFORM_FEE_PERCENTAGE_PUBLIC_RANKED' : 'PLATFORM_FEE_PERCENTAGE_PUBLIC_UNRANKED';
        defaultPct = '5';
      }
      
      const [configRecord] = await tx
        .select()
        .from(schema.systemConfigs)
        .where(eq(schema.systemConfigs.key, configKey))
        .limit(1);
      const platformFeePercentage = data.platformFeePercentage !== undefined 
        ? data.platformFeePercentage.toString() 
        : (configRecord ? configRecord.value : defaultPct);

      const [record] = await tx
        .insert(schema.tournaments)
        .values({
          createdBy: userId,
          name: data.name,
          categoryId: data.categoryId,
          communityId: data.communityId || null,
          description: data.description || null,
          matchType: data.matchType,
          sportRules: data.sportRules,
          tournamentConfig: data.tournamentConfig,
          entryFee: (data.entryFee || 0).toString(),
          platformFeePercentage,
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
          prizes: data.prizes,
          inviteCode: inviteCode,
          contactInfo: data.contactInfo,
          status: 'DRAFT',
          visibility: data.visibility || 'PUBLIC',
          genderRestriction: data.genderRestriction || null,
          parentId: data.parentId || null,
          isRanked: data.isRanked !== undefined ? data.isRanked : true,
        })
        .returning();
      
      await this.auditService.logCreate(tx, userId, 'tournaments', record.id, record);
      return record;
    });
  }

  async update(id: string, userId: string, data: UpdateTournamentDto) {
    const updatedResult = await this.db.transaction(async (tx) => {
      const [oldRecord] = await tx.select().from(schema.tournaments).where(eq(schema.tournaments.id, id)).limit(1);

      const [updated] = await tx
        .update(schema.tournaments)
        .set({
          ...(data.name && { name: data.name }),
          ...(data.categoryId && { categoryId: data.categoryId }),
          ...(data.communityId !== undefined && { communityId: data.communityId }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.status && { status: data.status }),
          ...(data.sportRules && { sportRules: data.sportRules }),
          ...(data.tournamentConfig && {
            tournamentConfig: data.tournamentConfig,
          }),
          ...(data.entryFee !== undefined && {
            entryFee: data.entryFee.toString(),
          }),
          ...(data.platformFeePercentage !== undefined && {
            platformFeePercentage: data.platformFeePercentage.toString(),
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
          ...(data.prizes !== undefined && { prizes: data.prizes }),
          ...(data.contactInfo !== undefined && { contactInfo: data.contactInfo }),
          ...(data.visibility !== undefined && { visibility: data.visibility }),
          ...(data.genderRestriction !== undefined && { genderRestriction: data.genderRestriction }),
          ...(data.parentId !== undefined && { parentId: data.parentId }),
          ...(data.isRegistrationLocked !== undefined && { isRegistrationLocked: data.isRegistrationLocked }),
          updatedAt: new Date(),
        })
        .where(eq(schema.tournaments.id, id))
        .returning();

      // Gender Lock Logic when status transitions to COMPLETED
      if (data.status === 'COMPLETED' && oldRecord.status !== 'COMPLETED') {
        const participantsRoster = await tx
          .select({ userId: schema.tournamentRosters.userId })
          .from(schema.tournamentRosters)
          .innerJoin(
            schema.tournamentParticipants,
            eq(schema.tournamentRosters.participantId, schema.tournamentParticipants.id),
          )
          .where(eq(schema.tournamentParticipants.tournamentId, id));

        const userIdsToLock = [
          ...new Set(participantsRoster.map((r) => r.userId).filter((uid): uid is string => !!uid)),
        ];

        if (userIdsToLock.length > 0) {
          await tx
            .update(schema.profiles)
            .set({ isGenderLocked: true, updatedAt: new Date() })
            .where(inArray(schema.profiles.userId, userIdsToLock));
        }
      }

      // Escrow / Payout Logic when status transitions to REGISTRATION_CLOSED
      if (data.status === 'REGISTRATION_CLOSED' && oldRecord.status !== 'REGISTRATION_CLOSED') {
        const isPaidPublic = oldRecord.tournamentType === 'PUBLIC' && parseFloat(oldRecord.entryFee || '0') > 0;
        if (isPaidPublic) {
          const [resultPayments] = await tx
            .select({ total: sql<string>`coalesce(sum(${schema.payments.amount}), '0')` })
            .from(schema.payments)
            .where(
              and(
                eq(schema.payments.tournamentId, id),
                eq(schema.payments.status, 'COMPLETED')
              )
            );
          const totalCollected = parseFloat(resultPayments.total);

          if (totalCollected > 0) {



            const platformFeeRetained = totalCollected * (parseFloat(oldRecord.platformFeePercentage || '0') / 100);
            const amountRequested = totalCollected - platformFeeRetained;

            if (amountRequested > 0) {
              const [resultCount] = await tx
                .select({ count: count() })
                .from(schema.tournaments)
                .where(
                  and(
                    eq(schema.tournaments.createdBy, oldRecord.createdBy),
                    eq(schema.tournaments.visibility, 'PUBLIC'),
                    eq(schema.tournaments.status, 'COMPLETED'),
                    sql`${schema.tournaments.deletedAt} IS NULL`
                  )
                );
              
              const isTrusted = resultCount.count >= 3;
              const targetPayoutStatus = isTrusted ? 'PENDING_DISBURSEMENT' : 'HELD_IN_ESCROW';
              const payoutTrigger = isTrusted ? 'AUTO_ON_LOCK' : 'MANUAL_ON_COMPLETE';

              const [payoutRecord] = await tx
                .insert(schema.organizerPayouts)
                .values({
                  tournamentId: id,
                  organizerId: oldRecord.createdBy,
                  totalCollected: totalCollected.toString(),
                  amountRequested: amountRequested.toString(),
                  platformFeeRetained: platformFeeRetained.toString(),
                  bankName: 'PENDING',
                  bankAccountNumber: 'PENDING',
                  bankAccountName: 'PENDING',
                  status: targetPayoutStatus,
                  payoutTrigger,
                  holdUntil: isTrusted ? null : (oldRecord.endDate ? new Date(oldRecord.endDate) : null),
                })
                .returning();

              await tx.insert(schema.payoutStatusLogs).values({
                payoutId: payoutRecord.id,
                previousStatus: 'NONE',
                newStatus: targetPayoutStatus,
                changedBy: userId,
                note: isTrusted ? 'AUTO_CREATED_TRUSTED_ORGANIZER' : 'AUTO_CREATED_ESCROW_HOLD',
              });
            }
          }
        }
      }

      // Escrow Release Logic when status transitions to COMPLETED
      if (data.status === 'COMPLETED' && oldRecord.status !== 'COMPLETED') {
        const [escrowedPayout] = await tx
          .select()
          .from(schema.organizerPayouts)
          .where(
            and(
              eq(schema.organizerPayouts.tournamentId, id),
              eq(schema.organizerPayouts.status, 'HELD_IN_ESCROW')
            )
          )
          .limit(1);

        if (escrowedPayout) {
          await tx
            .update(schema.organizerPayouts)
            .set({
              status: 'PENDING_DISBURSEMENT',
              updatedAt: new Date(),
            })
            .where(eq(schema.organizerPayouts.id, escrowedPayout.id));

          await tx.insert(schema.payoutStatusLogs).values({
            payoutId: escrowedPayout.id,
            previousStatus: 'HELD_IN_ESCROW',
            newStatus: 'PENDING_DISBURSEMENT',
            changedBy: userId,
            note: 'AUTO_RELEASED_ON_TOURNAMENT_COMPLETE',
          });
        }
      }

      await this.auditService.logUpdate(tx, userId, 'tournaments', id, oldRecord, updated);
      return updated;
    });

    if (data.status === 'COMPLETED') {
      try {
        await this.seriesService.computePsrForTournament(id);
      } catch (err) {
        console.error('Failed to compute PSR for tournament:', err);
      }
    }

    return updatedResult;
  }

  async softDelete(id: string, userId: string) {
    return await this.db.transaction(async (tx) => {
      const [oldRecord] = await tx.select().from(schema.tournaments).where(eq(schema.tournaments.id, id)).limit(1);

      const [deleted] = await tx
        .update(schema.tournaments)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.tournaments.id, id))
        .returning();

      // Cascade by tournamentId so knockout matches without a groupId are included.
      await tx
        .update(schema.matches)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(schema.matches.tournamentId, id),
            isNull(schema.matches.deletedAt),
          ),
        );

      // Delete any notifications referencing this tournament
      await tx
        .delete(schema.notifications)
        .where(like(schema.notifications.redirectUrl, `%/${id}%`));

      await this.auditService.logDelete(tx, userId, 'tournaments', id, oldRecord);
      return deleted;
    });
  }

  async archive(id: string, userId: string) {
    return this.db.transaction(async (tx) => {
      const [oldRecord] = await tx
        .select()
        .from(schema.tournaments)
        .where(and(eq(schema.tournaments.id, id), isNull(schema.tournaments.deletedAt)))
        .limit(1);

      if (!oldRecord) return null;

      const now = new Date();
      const [archived] = await tx
        .update(schema.tournaments)
        .set({ archivedAt: now, updatedAt: now })
        .where(eq(schema.tournaments.id, id))
        .returning();

      await this.auditService.logUpdate(tx, userId, 'tournaments', id, oldRecord, archived);
      return archived;
    });
  }

  async countActiveParticipants(tournamentId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: count() })
      .from(schema.tournamentParticipants)
      .where(
        and(
          eq(schema.tournamentParticipants.tournamentId, tournamentId),
          ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
          ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
        ),
      );
    return result?.count || 0;
  }

  async countPaidPayments(tournamentId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: count() })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.tournamentId, tournamentId),
          eq(schema.payments.status, 'COMPLETED'),
        ),
      );
    return result?.count || 0;
  }

  async countPendingRefunds(tournamentId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: count() })
      .from(schema.paymentRefunds)
      .innerJoin(
        schema.payments,
        eq(schema.paymentRefunds.paymentId, schema.payments.id),
      )
      .where(
        and(
          eq(schema.payments.tournamentId, tournamentId),
          eq(schema.paymentRefunds.status, 'REQUESTED'),
        ),
      );
    return result?.count || 0;
  }

  async isFullyRefunded(tournamentId: string): Promise<boolean> {
    // Check if all COMPLETED payments have refundStatus = 'REFUNDED'
    const [result] = await this.db
      .select({ count: count() })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.tournamentId, tournamentId),
          eq(schema.payments.status, 'COMPLETED'),
          sql`${schema.payments.refundStatus} IS DISTINCT FROM 'REFUNDED'`,
        ),
      );
    // If there are no non-refunded COMPLETED payments → fully refunded
    return (result?.count || 0) === 0;
  }

  async updateStatus(id: string, status: string) {
    return this.db
      .update(schema.tournaments)
      .set({ status, updatedAt: new Date() })
      .where(eq(schema.tournaments.id, id))
      .returning();
  }

  async registerParticipant(tournamentId: string, userId: string, data: RegisterTournamentDto, inviteCode?: string) {
    return await this.db.transaction(async (tx) => {
      // 1. Kiểm tra giải đấu
      const [tournament] = await tx
        .select()
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, tournamentId))
        .limit(1);

      if (!tournament) {
        throw new BadRequestException('Giải đấu không tồn tại');
      }

      if (tournament.isRanked && data.rankingConsent !== true) {
        throw new BadRequestException(
          'Giai dau co xep hang yeu cau ban dong y gui ket qua va diem ELO len bang xep hang.',
        );
      }

      // 1.5 Kiểm tra Exclusion Rule (khóa đăng ký đối với chặng đấu thuộc chuỗi giải đấu)
      const [seriesEvent] = await tx
        .select({
          event: schema.seriesEvents,
          leg: schema.seriesLegs,
          series: schema.tournamentSeries,
        })
        .from(schema.seriesEvents)
        .innerJoin(schema.seriesLegs, eq(schema.seriesEvents.legId, schema.seriesLegs.id))
        .innerJoin(schema.tournamentSeries, eq(schema.seriesLegs.seriesId, schema.tournamentSeries.id))
        .where(eq(schema.seriesEvents.tournamentId, tournamentId))
        .limit(1);

      if (seriesEvent && seriesEvent.series.rules) {
        const rules = seriesEvent.series.rules as unknown as { exclusionRule?: boolean; exclusionScope?: 'CATEGORY' | 'ALL' };
        if (rules.exclusionRule) {
          const scope = rules.exclusionScope || 'CATEGORY';
          const conds = [
            eq(schema.seriesStandings.legId, seriesEvent.leg.id),
            eq(schema.seriesStandings.userId, userId),
            eq(schema.seriesStandings.lockedOut, true),
          ];
          if (scope === 'CATEGORY') {
            conds.push(eq(schema.seriesStandings.categoryId, tournament.categoryId));
          }
          const [standing] = await tx
            .select()
            .from(schema.seriesStandings)
            .where(and(...conds))
            .limit(1);

          if (standing) {
            throw new ExclusionRuleException(
              `Bạn đã giành Vé Thẳng trong chặng này và bị khóa không được đăng ký tiếp nội dung ${
                scope === 'CATEGORY' ? 'này' : 'thi đấu thuộc chặng'
              }.`
            );
          }
        }
      }

      // 2. Kiểm tra trạng thái - chỉ mở đăng ký khi REGISTRATION_OPEN hoặc UPCOMING (DRAFT không cho đăng ký dù có mã mời)
      if (tournament.status !== 'REGISTRATION_OPEN' && tournament.status !== 'UPCOMING') {
        throw new BadRequestException('Giải đấu chưa hoặc đã đóng đăng ký.');
      }

      // 3. Kiểm tra thời hạn đăng ký
      const now = new Date();
      if (tournament.registrationStartDate && now < tournament.registrationStartDate) {
        throw new BadRequestException('Thời gian đăng ký chưa bắt đầu.');
      }
      if (tournament.registrationEndDate && now > tournament.registrationEndDate) {
        throw new BadRequestException('Thời gian đăng ký đã kết thúc.');
      }

      // 4. Kiểm tra mã mời nếu giải PRIVATE hoặc ở chế độ INVITE_ONLY
      const tConfig = (tournament.tournamentConfig || {}) as Record<string, any>;
      const regMode = tConfig.registrationMode || 'OPEN';

      if (regMode === 'INVITE_ONLY' || tournament.visibility === 'PRIVATE') {
        if (!inviteCode || tournament.inviteCode !== inviteCode) {
          throw new BadRequestException('Mã mời giải đấu không hợp lệ hoặc thiếu.');
        }
      }

      const getProfileGender = async (targetUserId: string, label: string) => {
        const [profile] = await tx
          .select({ gender: schema.profiles.gender })
          .from(schema.profiles)
          .where(eq(schema.profiles.userId, targetUserId))
          .limit(1);

        const rawGender = (profile?.gender || '').trim().toUpperCase();
        let gender = rawGender;
        if (rawGender === 'NAM' || rawGender === 'MALE') gender = 'MALE';
        else if (rawGender === 'NỮ' || rawGender === 'NU' || rawGender === 'FEMALE') gender = 'FEMALE';

        if (gender !== 'MALE' && gender !== 'FEMALE') {
          throw new BadRequestException(`${label} cần cập nhật giới tính trong hồ sơ cá nhân để đăng ký.`);
        }
        return gender;
      };

      const normalizeMatchType = (matchType: string | null) => {
        if (matchType === 'SINGLES' || matchType === 'DOUBLES' || matchType === 'MIXED_DOUBLES') {
          return matchType;
        }
        return 'DOUBLES';
      };

      type ResolvedDivisionResult = {
        division: typeof schema.tournamentDivisions.$inferSelect;
        isWaitlisted: boolean;
      };

      const resolveMatchingDivision = async (
        partnerUserId: string | null,
      ): Promise<ResolvedDivisionResult | null> => {
        const divisions = await tx
          .select()
          .from(schema.tournamentDivisions)
          .where(
            and(
              eq(schema.tournamentDivisions.tournamentId, tournamentId),
              ne(schema.tournamentDivisions.status, 'CANCELLED'),
            ),
          );

        if (divisions.length === 0) return null;

        const leaderGender = await getProfileGender(userId, 'Bạn');
        let targetMatchType = normalizeMatchType(tournament.matchType);
        let targetGenderRestriction: 'MALE' | 'FEMALE' | 'MIXED' =
          leaderGender === 'MALE' ? 'MALE' : 'FEMALE';

        if (partnerUserId) {
          const partnerGender = await getProfileGender(partnerUserId, 'Đồng đội');
          targetGenderRestriction = leaderGender === partnerGender ? leaderGender : 'MIXED';
          targetMatchType = targetGenderRestriction === 'MIXED' ? 'MIXED_DOUBLES' : 'DOUBLES';
        } else if (targetMatchType === 'MIXED_DOUBLES') {
          throw new BadRequestException('Hình thức Đôi Nam Nữ yêu cầu nhập đồng đội để xác định giới tính cặp.');
        }

        if (tournament.genderRestriction) {
          const restriction = tournament.genderRestriction.toUpperCase();
          if (restriction === 'MALE' && targetGenderRestriction !== 'MALE') {
            throw new BadRequestException('Giải đấu chỉ dành cho Nam.');
          }
          if (restriction === 'FEMALE' && targetGenderRestriction !== 'FEMALE') {
            throw new BadRequestException('Giải đấu chỉ dành cho Nữ.');
          }
          if (restriction === 'MIXED' && targetGenderRestriction !== 'MIXED') {
            throw new BadRequestException('Giải đấu Mixed Doubles yêu cầu 1 Nam và 1 Nữ.');
          }
        }

        const requestedDivisionId = data.tournamentDivisionId ?? data.divisionId;
        const selectedDivision = requestedDivisionId
          ? divisions.find((division) => division.id === requestedDivisionId)
          : divisions.find(
              (division) =>
                division.matchType === targetMatchType &&
                (division.genderRestriction === targetGenderRestriction ||
                 !division.genderRestriction ||
                 division.genderRestriction.toUpperCase() === 'OPEN'),
            );

        if (!selectedDivision) {
          const fallbackLabel = targetGenderRestriction === 'MIXED'
            ? 'Đôi Nam Nữ'
            : targetMatchType === 'SINGLES'
              ? targetGenderRestriction === 'MALE' ? 'Đơn Nam' : 'Đơn Nữ'
              : targetGenderRestriction === 'MALE' ? 'Đôi Nam' : 'Đôi Nữ';
          throw new BadRequestException(`Không có hình thức thi đấu ${fallbackLabel} phù hợp cho giải này.`);
        }

        const divGender = (selectedDivision.genderRestriction || '').toUpperCase();
        const isMatchTypeValid = selectedDivision.matchType === targetMatchType || 
          (selectedDivision.matchType === 'DOUBLES' && targetMatchType === 'MIXED_DOUBLES' && (!divGender || divGender === 'OPEN'));
        if (
          !isMatchTypeValid ||
          (divGender && divGender !== 'OPEN' && divGender !== targetGenderRestriction)
        ) {
          throw new BadRequestException('Hình thức thi đấu đã chọn không phù hợp với giới tính hoặc loại đăng ký.');
        }

        if (selectedDivision.maxParticipants) {
          const [participantCount] = await tx
            .select({ count: count() })
            .from(schema.tournamentParticipants)
            .where(
              and(
                eq(schema.tournamentParticipants.tournamentDivisionId, selectedDivision.id),
                eq(schema.tournamentParticipants.teamStatus, 'COMPLETE'),
                eq(schema.tournamentParticipants.isPaid, true),
              ),
            );

          if (participantCount.count >= selectedDivision.maxParticipants) {
            return { division: selectedDivision, isWaitlisted: true };
          }
        }

        return { division: selectedDivision, isWaitlisted: false };
      };

      // (resolveMatchingDivision được gọi sau khi partnerId xác định xong — xem step 9 bên dưới)

      // 6. Kiểm tra số lượng tối đa cấp tournament cho backward-compatible (trong transaction với FOR UPDATE)
      if (tournament.maxParticipants) {
        // Lock hàng tournament để tránh race condition
        const [lockedTournament] = await tx
          .select()
          .from(schema.tournaments)
          .where(eq(schema.tournaments.id, tournamentId))
          .for('update');

        if (!lockedTournament) throw new BadRequestException('Giải đấu không tồn tại.');

        // Lite mode: count distinct roster users; SINGLES max=maxParticipants, DOUBLES max=maxParticipants*2
        const tCfg = (lockedTournament.tournamentConfig || {}) as Record<string, unknown>;
        if (tCfg.mode === 'LITE') {
          const isDoubles = lockedTournament.matchType === 'DOUBLES' || lockedTournament.matchType === 'MIXED_DOUBLES';
          const maxSlots: number = isDoubles ? lockedTournament.maxParticipants! * 2 : lockedTournament.maxParticipants!;

          const [{ count: activeRosterUsers }] = await tx
            .select({ count: sql<number>`count(distinct ${schema.tournamentRosters.userId})` })
            .from(schema.tournamentRosters)
            .innerJoin(
              schema.tournamentParticipants,
              eq(schema.tournamentRosters.participantId, schema.tournamentParticipants.id),
            )
            .where(
              and(
                eq(schema.tournamentParticipants.tournamentId, tournamentId),
                ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
                ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
                ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
              ),
            );

          if (Number(activeRosterUsers) >= maxSlots) {
            throw new BadRequestException('Giải đấu đã đủ số lượng người tham gia.');
          }
        } else {
          // Normal (non-Lite) mode: count COMPLETE+paid participants (existing behavior)
          const [participantCount] = await tx
            .select({ count: count() })
            .from(schema.tournamentParticipants)
            .where(
              and(
                eq(schema.tournamentParticipants.tournamentId, tournamentId),
                eq(schema.tournamentParticipants.teamStatus, 'COMPLETE'),
                eq(schema.tournamentParticipants.isPaid, true),
              ),
            );

          if (participantCount.count >= tournament.maxParticipants) {
            throw new BadRequestException('Giải đấu đã đầy.');
          }
        }
      }

      // 7. CLUB check: user must be community member
      if (tournament.tournamentType === 'CLUB' && tournament.communityId) {
        const member = await tx
          .select()
          .from(schema.communityMembers)
          .where(
            and(
              eq(schema.communityMembers.communityId, tournament.communityId),
              eq(schema.communityMembers.userId, userId),
              eq(schema.communityMembers.status, 'JOINED')
            )
          )
          .limit(1);
        if (member.length === 0) {
          throw new BadRequestException('Chỉ thành viên CLB mới được đăng ký giải đấu này.');
        }
      }

      // 8. Kiểm tra xem người đăng ký đã có trong giải đấu này chưa (chống trùng)
      const existingRosters = await tx
        .select({ userId: schema.tournamentRosters.userId })
        .from(schema.tournamentRosters)
        .innerJoin(schema.tournamentParticipants, eq(schema.tournamentRosters.participantId, schema.tournamentParticipants.id))
        .where(
          and(
            eq(schema.tournamentParticipants.tournamentId, tournamentId),
            eq(schema.tournamentRosters.userId, userId),
            ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
            ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
            ne(schema.tournamentParticipants.teamStatus, 'KICKED')
          )
        );
      if (existingRosters.length > 0) {
        throw new BadRequestException('Bạn đã đăng ký tham gia giải đấu này rồi.');
      }

      // 9. Thêm participant
      const tournamentIsDoubles = this.isDoublesMatchType(tournament.matchType);
      
      let partnerId: string | null = null;
      if (tournamentIsDoubles && data.partnerEmailOrPhone) {
        // Resolve partner account
        const [partnerUser] = await tx
          .select({ id: schema.users.id })
          .from(schema.users)
          .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
          .where(
            or(
              eq(schema.users.email, data.partnerEmailOrPhone),
              eq(schema.profiles.phoneNumber, data.partnerEmailOrPhone)
            )
          )
          .limit(1);

        if (!partnerUser) {
          throw new BadRequestException('Không tìm thấy tài khoản VNDC Sport của đồng đội. Vui lòng kiểm tra lại Email hoặc SĐT.');
        }

        if (partnerUser.id === userId) {
          throw new BadRequestException('Email/SĐT của đồng đội không được trùng với tài khoản của bạn.');
        }

        // Check if partner already in tournament
        const partnerExisting = await tx
          .select({ userId: schema.tournamentRosters.userId })
          .from(schema.tournamentRosters)
          .innerJoin(schema.tournamentParticipants, eq(schema.tournamentRosters.participantId, schema.tournamentParticipants.id))
          .where(
            and(
              eq(schema.tournamentParticipants.tournamentId, tournamentId),
              eq(schema.tournamentRosters.userId, partnerUser.id),
              ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
              ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
              ne(schema.tournamentParticipants.teamStatus, 'KICKED')
            )
          );
        if (partnerExisting.length > 0) {
          throw new BadRequestException('Đồng đội của bạn đã đăng ký tham gia giải đấu này rồi.');
        }

        // Enforce gender constraints for partner if any
        if (tournament.genderRestriction) {
          const [partnerProfile] = await tx
            .select({ gender: schema.profiles.gender })
            .from(schema.profiles)
            .where(eq(schema.profiles.userId, partnerUser.id))
            .limit(1);
          
          if (!partnerProfile || !partnerProfile.gender) {
            throw new BadRequestException('Đồng đội chưa cập nhật giới tính trong hồ sơ cá nhân.');
          }

          const leaderProfileRes = await tx.select({ gender: schema.profiles.gender }).from(schema.profiles).where(eq(schema.profiles.userId, userId)).limit(1);
          const rawLeaderG = (leaderProfileRes[0]?.gender || '').trim().toUpperCase();
          const leaderGenderVal = (rawLeaderG === 'NAM' || rawLeaderG === 'MALE') ? 'MALE' : (rawLeaderG === 'NỮ' || rawLeaderG === 'NU' || rawLeaderG === 'FEMALE') ? 'FEMALE' : rawLeaderG;

          const rawPartnerG = (partnerProfile.gender || '').trim().toUpperCase();
          const partnerGenderVal = (rawPartnerG === 'NAM' || rawPartnerG === 'MALE') ? 'MALE' : (rawPartnerG === 'NỮ' || rawPartnerG === 'NU' || rawPartnerG === 'FEMALE') ? 'FEMALE' : rawPartnerG;
          const restriction = tournament.genderRestriction.toUpperCase();

          if (restriction === 'MALE' && partnerGenderVal !== 'MALE') {
            throw new BadRequestException('Giải đấu chỉ dành cho Nam (cả 2 VĐV phải là Nam).');
          }
          if (restriction === 'FEMALE' && partnerGenderVal !== 'FEMALE') {
            throw new BadRequestException('Giải đấu chỉ dành cho Nữ (cả 2 VĐV phải là Nữ).');
          }
          if (restriction === 'MIXED') {
            if (!leaderGenderVal) {
              throw new BadRequestException('Bạn cần cập nhật giới tính trong hồ sơ để xác nhận Mixed Doubles.');
            }
            if (leaderGenderVal === partnerGenderVal) {
              throw new BadRequestException('Giải đấu Mixed Doubles yêu cầu 1 Nam và 1 Nữ.');
            }
          }
        }

        partnerId = partnerUser.id;
      }

      const resolvedDivision = await resolveMatchingDivision(partnerId);
      const selectedDivision = resolvedDivision?.division ?? null;
      const isWaitlisted = resolvedDivision?.isWaitlisted === true;
      const effectiveMatchType = selectedDivision?.matchType ?? tournament.matchType;
      const isDoubles = this.isDoublesMatchType(effectiveMatchType);
      const payableEntryFeeAmount = parseFloat(selectedDivision?.entryFee ?? tournament.entryFee ?? '0');

      const registrationDeadlines = [
        selectedDivision?.registrationEndDate,
        tournament.registrationEndDate,
      ]
        .filter(Boolean)
        .map((value) => new Date(value as Date | string));
      const registrationDeadline = registrationDeadlines.sort(
        (a, b) => a.getTime() - b.getTime(),
      )[0];

      if (registrationDeadline && now >= registrationDeadline) {
        throw new BadRequestException('Hạn đăng ký của nội dung thi đấu này đã kết thúc.');
      }

      const teamInviteToken = isDoubles ? crypto.randomUUID().replace(/-/g, '').substring(0, 12).toUpperCase() : null;
      const inviteBaseExpiresAt = new Date(now.getTime() + 60 * 60 * 1000);
      const partnerInviteExpiresAt = isDoubles
        ? registrationDeadline
          ? new Date(Math.min(inviteBaseExpiresAt.getTime(), registrationDeadline.getTime()))
          : inviteBaseExpiresAt
        : null;

      const teamStatus = isWaitlisted
        ? 'WAITLISTED'
        : isDoubles
          ? 'PENDING_PARTNER'
          : regMode === 'APPROVAL'
            ? 'PENDING_APPROVAL'
            : 'COMPLETE';
      const isPaid = payableEntryFeeAmount === 0;

      let finalTeamName = (data.teamName || '').trim();
      if (!finalTeamName) {
        const [leaderProfile] = await tx
          .select({ fullName: schema.profiles.fullName })
          .from(schema.profiles)
          .where(eq(schema.profiles.userId, userId))
          .limit(1);
        finalTeamName = leaderProfile?.fullName || 'Vận động viên';
      }

      const [participant] = await tx
        .insert(schema.tournamentParticipants)
        .values({
          tournamentId,
          tournamentDivisionId: selectedDivision?.id ?? null,
          registeredBy: userId,
          teamName: finalTeamName,
          rankingConsent: data.rankingConsent === true,
          isPaid,
          teamInviteToken: partnerId ? null : teamInviteToken,
          teamStatus,
          partnerUserId: isDoubles ? partnerId : null,
          partnerInviteExpiresAt,
        })
        .returning();

      // 10. Thêm rosters cho Leader
      await tx.insert(schema.tournamentRosters).values({
        participantId: participant.id,
        userId: userId,
        role: 'MAIN',
      });

      // Payment intent is created later by the checkout flow.
      const paymentUrl: string | null = null;

      // 12. Audit log
      await this.auditService.logCreate(tx, userId, 'tournament_participants', participant.id, participant);

      return {
        participant,
        entryFee: payableEntryFeeAmount,
        paymentUrl,
        teamInviteLink: (isDoubles && !partnerId)
          ? `/tournaments/${tournamentId}/join-team?pid=${participant.id}&token=${teamInviteToken}`
          : null,
        isWaitlisted,
      };
    });
  }

  async acceptPartnerInvite(participantId: string, partnerUserId: string) {
    return await this.db.transaction(async (tx) => {
      const [participant] = await tx
        .select()
        .from(schema.tournamentParticipants)
        .where(eq(schema.tournamentParticipants.id, participantId))
        .for('update')
        .limit(1);

      if (!participant) {
        throw new NotFoundException('Lời mời ghép đôi không tồn tại hoặc đã bị hủy.');
      }

      if (!participant.partnerInviteExpiresAt || new Date() >= participant.partnerInviteExpiresAt) {
        await tx
          .update(schema.tournamentParticipants)
          .set({ teamStatus: 'EXPIRED', partnerInviteExpiresAt: null })
          .where(eq(schema.tournamentParticipants.id, participantId));
        throw new BadRequestException('Lời mời ghép đôi đã hết hạn. Suất giữ chỗ đã được giải phóng.');
      }

      if (participant.teamStatus !== 'PENDING_PARTNER') {
        throw new BadRequestException('Lời mời ghép đôi này đã được xử lý hoặc đã kết thúc.');
      }

      if (participant.partnerUserId !== partnerUserId) {
        throw new BadRequestException('Chỉ đúng tài khoản đồng đội được mời mới có thể xác nhận lời mời này.');
      }

      const [tournament] = await tx
        .select({
          tournamentConfig: schema.tournaments.tournamentConfig,
          registrationEndDate: schema.tournaments.registrationEndDate,
        })
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, participant.tournamentId))
        .limit(1);
      const [division] = participant.tournamentDivisionId
        ? await tx
            .select({ registrationEndDate: schema.tournamentDivisions.registrationEndDate })
            .from(schema.tournamentDivisions)
            .where(eq(schema.tournamentDivisions.id, participant.tournamentDivisionId))
            .limit(1)
        : [null];
      const registrationDeadlines = [tournament?.registrationEndDate, division?.registrationEndDate]
        .filter(Boolean)
        .map((value) => new Date(value as Date | string));
      const registrationDeadline = registrationDeadlines.sort(
        (a, b) => a.getTime() - b.getTime(),
      )[0];
      if (registrationDeadline && new Date() >= registrationDeadline) {
        await tx
          .update(schema.tournamentParticipants)
          .set({ teamStatus: 'EXPIRED', partnerInviteExpiresAt: null })
          .where(eq(schema.tournamentParticipants.id, participantId));
        throw new BadRequestException('Giải đấu đã đóng đăng ký. Lời mời ghép đôi không thể xác nhận thêm.');
      }

      // Check duplicate roster
      const existingRosters = await tx
        .select()
        .from(schema.tournamentRosters)
        .where(
          and(
            eq(schema.tournamentRosters.participantId, participantId),
            eq(schema.tournamentRosters.userId, partnerUserId),
          ),
        );

      if (existingRosters.length === 0) {
        await tx.insert(schema.tournamentRosters).values({
          participantId,
          userId: partnerUserId,
          role: 'MAIN',
        });
      }

      const targetStatus = ((tournament?.tournamentConfig || {}) as Record<string, unknown>).registrationMode === 'APPROVAL'
        ? 'PENDING_APPROVAL'
        : 'COMPLETE';

      const [updated] = await tx
        .update(schema.tournamentParticipants)
        .set({
          teamStatus: targetStatus,
          partnerInviteExpiresAt: null,
        })
        .where(eq(schema.tournamentParticipants.id, participantId))
        .returning();

      return updated;
    });
  }

  async rejectPartnerInvite(participantId: string, partnerUserId: string) {
    return await this.db.transaction(async (tx) => {
      const [participant] = await tx
        .select({
          id: schema.tournamentParticipants.id,
          partnerUserId: schema.tournamentParticipants.partnerUserId,
          teamStatus: schema.tournamentParticipants.teamStatus,
          partnerInviteExpiresAt: schema.tournamentParticipants.partnerInviteExpiresAt,
        })
        .from(schema.tournamentParticipants)
        .where(eq(schema.tournamentParticipants.id, participantId))
        .for('update')
        .limit(1);

      if (!participant) {
        throw new NotFoundException('Lời mời ghép đôi không tồn tại hoặc đã bị hủy.');
      }
      if (participant.partnerUserId !== partnerUserId) {
        throw new BadRequestException('Chỉ đúng tài khoản đồng đội được mời mới có thể từ chối lời mời này.');
      }
      if (!participant.partnerInviteExpiresAt || new Date() >= participant.partnerInviteExpiresAt) {
        await tx
          .update(schema.tournamentParticipants)
          .set({ teamStatus: 'EXPIRED', partnerInviteExpiresAt: null })
          .where(eq(schema.tournamentParticipants.id, participantId));
        throw new BadRequestException('Lời mời ghép đôi đã hết hạn.');
      }
      if (participant.teamStatus !== 'PENDING_PARTNER') {
        throw new BadRequestException('Lời mời ghép đôi này đã được xử lý hoặc đã kết thúc.');
      }

      const [updated] = await tx
        .update(schema.tournamentParticipants)
        .set({ teamStatus: 'EXPIRED', partnerInviteExpiresAt: null })
        .where(eq(schema.tournamentParticipants.id, participantId))
        .returning();
      return updated;
    });
  }

  async joinTeam(tournamentId: string, userId: string, participantId: string, teamInviteToken: string) {
    return await this.db.transaction(async (tx) => {
      // 1. Kiểm tra giải đấu
      const [tournament] = await tx
        .select()
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, tournamentId))
        .limit(1);
      if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

      // 1.5 Kiểm tra Exclusion Rule cho đồng đội (partner)
      const [seriesEvent] = await tx
        .select({
          event: schema.seriesEvents,
          leg: schema.seriesLegs,
          series: schema.tournamentSeries,
        })
        .from(schema.seriesEvents)
        .innerJoin(schema.seriesLegs, eq(schema.seriesEvents.legId, schema.seriesLegs.id))
        .innerJoin(schema.tournamentSeries, eq(schema.seriesLegs.seriesId, schema.tournamentSeries.id))
        .where(eq(schema.seriesEvents.tournamentId, tournamentId))
        .limit(1);

      if (seriesEvent && seriesEvent.series.rules) {
        const rules = seriesEvent.series.rules as unknown as { exclusionRule?: boolean; exclusionScope?: 'CATEGORY' | 'ALL' };
        if (rules.exclusionRule) {
          const scope = rules.exclusionScope || 'CATEGORY';
          const conds = [
            eq(schema.seriesStandings.legId, seriesEvent.leg.id),
            eq(schema.seriesStandings.userId, userId),
            eq(schema.seriesStandings.lockedOut, true),
          ];
          if (scope === 'CATEGORY') {
            conds.push(eq(schema.seriesStandings.categoryId, tournament.categoryId));
          }
          const [standing] = await tx
            .select()
            .from(schema.seriesStandings)
            .where(and(...conds))
            .limit(1);

          if (standing) {
            throw new ExclusionRuleException(
              `Bạn đã giành Vé Thẳng trong chặng này và bị khóa không được tham gia tiếp nội dung ${
                scope === 'CATEGORY' ? 'này' : 'thi đấu thuộc chặng'
              }.`
            );
          }
        }
      }

      // 2. Tìm participant khớp với token
      const [participant] = await tx
        .select()
        .from(schema.tournamentParticipants)
        .where(
          and(
            eq(schema.tournamentParticipants.id, participantId),
            eq(schema.tournamentParticipants.teamInviteToken, teamInviteToken)
          )
        )
        .for('update')
        .limit(1);

      if (!participant) {
        throw new BadRequestException('Mã mời đồng đội hoặc đội thi đấu không hợp lệ.');
      }

      if (!participant.partnerInviteExpiresAt || new Date() >= participant.partnerInviteExpiresAt) {
        await tx
          .update(schema.tournamentParticipants)
          .set({ teamStatus: 'EXPIRED', teamInviteToken: null, partnerInviteExpiresAt: null })
          .where(eq(schema.tournamentParticipants.id, participantId));
        throw new BadRequestException('Mã mời ghép đôi đã hết hạn. Suất giữ chỗ đã được giải phóng.');
      }

      if (participant.teamStatus !== 'PENDING_PARTNER') {
        throw new BadRequestException('Đội thi đấu này đã đủ thành viên hoặc không ở trạng thái chờ.');
      }

      // 3. Kiểm tra user chưa đăng ký giải này
      const existingRosters = await tx
        .select({ userId: schema.tournamentRosters.userId })
        .from(schema.tournamentRosters)
        .innerJoin(schema.tournamentParticipants, eq(schema.tournamentRosters.participantId, schema.tournamentParticipants.id))
        .where(
          and(
            eq(schema.tournamentParticipants.tournamentId, tournamentId),
            eq(schema.tournamentRosters.userId, userId),
            ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
            ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
            ne(schema.tournamentParticipants.teamStatus, 'KICKED')
          )
        );
      if (existingRosters.length > 0) {
        throw new BadRequestException('Bạn đã đăng ký tham gia giải đấu này rồi.');
      }

      const [division] = participant.tournamentDivisionId
        ? await tx
            .select()
            .from(schema.tournamentDivisions)
            .where(eq(schema.tournamentDivisions.id, participant.tournamentDivisionId))
            .limit(1)
        : [null];

      const registrationDeadlines = [tournament.registrationEndDate, division?.registrationEndDate]
        .filter(Boolean)
        .map((value) => new Date(value as Date | string));
      const registrationDeadline = registrationDeadlines.sort(
        (a, b) => a.getTime() - b.getTime(),
      )[0];
      if (registrationDeadline && new Date() >= registrationDeadline) {
        await tx
          .update(schema.tournamentParticipants)
          .set({ teamStatus: 'EXPIRED', teamInviteToken: null, partnerInviteExpiresAt: null })
          .where(eq(schema.tournamentParticipants.id, participantId));
        throw new BadRequestException('Giải đấu đã đóng đăng ký. Mã mời ghép đôi không thể sử dụng thêm.');
      }

      // 4. Lấy giới tính của Leader và Partner để kiểm tra ràng buộc
      const leaderRoster = await tx
        .select()
        .from(schema.tournamentRosters)
        .where(eq(schema.tournamentRosters.participantId, participantId))
        .limit(1);
      
      if (leaderRoster.length === 0) {
        throw new BadRequestException('Không tìm thấy trưởng nhóm.');
      }
      const leaderId = leaderRoster[0].userId;

      const [leaderProfile] = await tx
        .select({ gender: schema.profiles.gender })
        .from(schema.profiles)
        .where(eq(schema.profiles.userId, leaderId))
        .limit(1);

      const [partnerProfile] = await tx
        .select({ gender: schema.profiles.gender })
        .from(schema.profiles)
        .where(eq(schema.profiles.userId, userId))
        .limit(1);

      const teamLeaderGender = leaderProfile?.gender?.toUpperCase();
      const teamPartnerGender = partnerProfile?.gender?.toUpperCase();

      if (division) {
        if (
          (teamLeaderGender !== 'MALE' && teamLeaderGender !== 'FEMALE') ||
          (teamPartnerGender !== 'MALE' && teamPartnerGender !== 'FEMALE')
        ) {
          throw new BadRequestException('Cả hai VĐV cần cập nhật giới tính trong hồ sơ để tham gia.');
        }

        const targetGenderRestriction = teamLeaderGender === teamPartnerGender ? teamLeaderGender : 'MIXED';
        const targetMatchType = targetGenderRestriction === 'MIXED' ? 'MIXED_DOUBLES' : 'DOUBLES';

        const divGender = (division.genderRestriction || '').toUpperCase();
        const isMatchTypeValid = division.matchType === targetMatchType || 
          (division.matchType === 'DOUBLES' && targetMatchType === 'MIXED_DOUBLES' && (!divGender || divGender === 'OPEN'));
        if (
          !isMatchTypeValid ||
          (divGender && divGender !== 'OPEN' && divGender !== targetGenderRestriction)
        ) {
          throw new BadRequestException('Đồng đội không phù hợp với hình thức thi đấu đã đăng ký.');
        }
      } else if (tournament.genderRestriction) {
        if (!teamPartnerGender) {
          throw new BadRequestException('Vui lòng cập nhật giới tính trong hồ sơ để tham gia.');
        }
        const restriction = tournament.genderRestriction.toUpperCase();

        if (restriction === 'MALE' && teamPartnerGender !== 'MALE') {
          throw new BadRequestException('Giải đấu chỉ dành cho Nam.');
        }
        if (restriction === 'FEMALE' && teamPartnerGender !== 'FEMALE') {
          throw new BadRequestException('Giải đấu chỉ dành cho Nữ.');
        }
        if (restriction === 'MIXED') {
          if (!teamLeaderGender) {
            throw new BadRequestException('Không tìm thấy giới tính của trưởng nhóm để xác nhận Mixed Doubles.');
          }
          if (teamLeaderGender === teamPartnerGender) {
            throw new BadRequestException('Giải đấu Mixed Doubles yêu cầu 1 Nam và 1 Nữ.');
          }
        }
      }

      // 5. Thêm roster cho Partner
      await tx
        .insert(schema.tournamentRosters)
        .values({
          participantId: participant.id,
          userId: userId,
          role: 'MAIN',
        });

      // 6. Cập nhật trạng thái đội hoàn tất:
      // - OPEN => COMPLETE
      // - APPROVAL => PENDING_APPROVAL
      const entryFeeAmount = division?.entryFee
        ? parseFloat(division.entryFee)
        : parseFloat(tournament.entryFee || '0');
      const isPaid = entryFeeAmount === 0;

      const tCfg = (tournament.tournamentConfig || {}) as Record<string, any>;
      const regMode = tCfg.registrationMode || 'OPEN';
      const targetStatus = regMode === 'APPROVAL' ? 'PENDING_APPROVAL' : 'COMPLETE';

      const [updatedParticipant] = await tx
        .update(schema.tournamentParticipants)
        .set({
          teamStatus: targetStatus,
          isPaid,
        })
        .where(eq(schema.tournamentParticipants.id, participantId))
        .returning();

      // Payment intent is created later by the checkout flow.
      const paymentUrl: string | null = null;

      await this.auditService.logUpdate(tx, userId, 'tournament_participants', participantId, participant, updatedParticipant);

      return {
        participant: updatedParticipant,
        paymentUrl,
      };
    });
  }

  async withdraw(
    tournamentId: string,
    userId: string,
    bankData?: { bankName?: string; bankAccountNumber?: string; bankAccountName?: string },
    divisionId?: string,
  ) {
    return await this.db.transaction(async (tx) => {
      // 1. Tìm participant mà user đang tham gia
      const userRoster = await tx
        .select({ participantId: schema.tournamentRosters.participantId })
        .from(schema.tournamentRosters)
        .innerJoin(schema.tournamentParticipants, eq(schema.tournamentRosters.participantId, schema.tournamentParticipants.id))
        .where(
          and(
            eq(schema.tournamentParticipants.tournamentId, tournamentId),
            eq(schema.tournamentRosters.userId, userId),
            ...(divisionId ? [eq(schema.tournamentParticipants.tournamentDivisionId, divisionId)] : []),
            ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
            ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
            ne(schema.tournamentParticipants.teamStatus, 'KICKED')
          )
        )
        .limit(1);

      if (userRoster.length === 0) {
        throw new BadRequestException('Bạn chưa đăng ký giải đấu này hoặc đã rút lui.');
      }

      const participantId = userRoster[0].participantId;

      const [oldParticipant] = await tx
        .select()
        .from(schema.tournamentParticipants)
        .where(eq(schema.tournamentParticipants.id, participantId))
        .limit(1);

      if (!oldParticipant) throw new NotFoundException('Không tìm thấy người tham gia');

      // 2. Kiểm tra giải đấu chưa bắt đầu
      const [tournament] = await tx
        .select()
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, tournamentId))
        .limit(1);

      if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

      if (tournament.status === 'IN_PROGRESS' || tournament.status === 'COMPLETED') {
        throw new BadRequestException('Giải đấu đã bắt đầu hoặc kết thúc, không thể rút lui.');
      }

      // 2.5 Lấy bank details từ request body hoặc từ profile của user
      const [profile] = await tx
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.userId, userId))
        .limit(1);

      const finalBankName = bankData?.bankName || profile?.bankName;
      const finalBankAccountNumber = bankData?.bankAccountNumber || profile?.bankAccountNumber;
      const finalBankAccountName = bankData?.bankAccountName || profile?.bankAccountName;
      const entryFeeAmount = await this.resolveDivisionEntryFee(
        tx,
        tournament,
        oldParticipant.tournamentDivisionId,
      );

      if (oldParticipant.isPaid) {
        if (entryFeeAmount > 0) {
          if (!finalBankName?.trim() || !finalBankAccountNumber?.trim() || !finalBankAccountName?.trim()) {
            throw new BadRequestException(
              'Vui lòng nhập đầy đủ thông tin tài khoản ngân hàng để nhận lại tiền hoàn lệ phí.',
            );
          }
        }
      }

      // 3. Cập nhật trạng thái
      const [updatedParticipant] = await tx
        .update(schema.tournamentParticipants)
        .set({ teamStatus: 'WITHDRAWN', teamInviteToken: null }) // clear invite code or invite tokens if any
        .where(eq(schema.tournamentParticipants.id, participantId))
        .returning();

      await this.invalidatePendingParticipantPayments(
        tx,
        tournamentId,
        participantId,
        'PARTICIPANT_WITHDRAWN',
      );

      // 4. Nếu đã thanh toán, thực hiện hoàn tiền (chuyển sang trạng thái PENDING_REFUND và lưu thông tin bank)
      let refundAmount: string | null = null;
      if (oldParticipant.isPaid) {
        if (entryFeeAmount > 0) {
          // Cập nhật trạng thái hoàn tiền trên bản ghi payment gốc
          await tx
            .update(schema.payments)
            .set({
              refundStatus: 'PENDING_REFUND',
              refundedAmount: '0.00',
              refundBankName: finalBankName,
              refundAccountNumber: finalBankAccountNumber,
              refundAccountName: finalBankAccountName,
            })
            .where(
              and(
                eq(schema.payments.tournamentId, tournamentId),
                eq(schema.payments.participantId, participantId),
                eq(schema.payments.status, 'COMPLETED')
              )
            );
          refundAmount = entryFeeAmount.toString();
        }
      }

      await this.auditService.logUpdate(tx, userId, 'tournament_participants', participantId, oldParticipant, updatedParticipant);

      // 5. Promote waitlisted participant nếu có slot trống
      await this.promoteNextWaitlisted(tx, tournamentId, oldParticipant.tournamentDivisionId ?? undefined);

      return {
        message: 'Đã rút khỏi giải đấu thành công. Yêu cầu hoàn tiền đang được Ban tổ chức xử lý.',
        refundAmount,
      };
    });
  }

  async kickParticipant(tournamentId: string, participantId: string, userId: string) {
    return await this.db.transaction(async (tx) => {
      // 1. Kiểm tra giải đấu
      const [tournament] = await tx
        .select()
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, tournamentId))
        .limit(1);

      if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

      // 2. Kiểm tra participant
      const [participant] = await tx
        .select()
        .from(schema.tournamentParticipants)
        .where(eq(schema.tournamentParticipants.id, participantId))
        .limit(1);

      if (!participant) throw new NotFoundException('Không tìm thấy người tham gia');

      // 3. Cập nhật trạng thái sang KICKED
      const [updatedParticipant] = await tx
        .update(schema.tournamentParticipants)
        .set({ teamStatus: 'KICKED', teamInviteToken: null })
        .where(eq(schema.tournamentParticipants.id, participantId))
        .returning();

      await this.invalidatePendingParticipantPayments(
        tx,
        tournamentId,
        participantId,
        'PARTICIPANT_KICKED',
      );

      // 4. Hoàn tiền nếu đã nộp lệ phí
      let refundAmount: string | null = null;
      if (participant.isPaid) {
        const entryFeeAmount = await this.resolveDivisionEntryFee(
          tx,
          tournament,
          participant.tournamentDivisionId,
        );
        if (entryFeeAmount > 0) {
          await tx
            .update(schema.payments)
            .set({
              refundStatus: 'PENDING_REFUND',
              refundedAmount: '0.00',
            })
            .where(
              and(
                eq(schema.payments.tournamentId, tournamentId),
                eq(schema.payments.participantId, participantId),
                eq(schema.payments.status, 'COMPLETED')
              )
            );
          refundAmount = entryFeeAmount.toString();
        }
      }

      // 5. Xử lý Walkover/BYE trong sơ đồ thi đấu
      const activeMatches = await tx
        .select()
        .from(schema.matches)
        .where(
          and(
            or(eq(schema.matches.status, 'SCHEDULED'), eq(schema.matches.status, 'ONGOING')),
            or(
              eq(schema.matches.participant1Id, participantId),
              eq(schema.matches.participant2Id, participantId)
            )
          )
        );

      for (const match of activeMatches) {
        const opponentId = (match.participant1Id === participantId)
          ? match.participant2Id
          : match.participant1Id;

        const winnerId = opponentId || null;

        await tx
          .update(schema.matches)
          .set({
            status: 'COMPLETED',
            winnerId,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.matches.id, match.id));

        if (match.nextMatchId && winnerId) {
          const [nextMatch] = await tx
            .select()
            .from(schema.matches)
            .where(eq(schema.matches.id, match.nextMatchId))
            .limit(1);

          const targetSlot = resolveWinnerTargetSlot({
            sourceBranch: match.bracketBranch,
            sourceRoundNumber: match.roundNumber,
            sourceMatchOrder: match.matchOrder,
            targetBranch: nextMatch?.bracketBranch ?? 'MAIN',
          });
          const updateField = { [targetSlot]: winnerId };

          await tx
            .update(schema.matches)
            .set(updateField)
            .where(eq(schema.matches.id, match.nextMatchId));
        }

        if (match.loserNextMatchId) {
          const targetSlot = resolveLoserTargetSlot({
            sourceRoundNumber: match.roundNumber,
            sourceMatchOrder: match.matchOrder,
          });
          const updateField = { [targetSlot]: null };

          await tx
            .update(schema.matches)
            .set(updateField)
            .where(eq(schema.matches.id, match.loserNextMatchId));
        }
      }

      await this.auditService.logUpdate(tx, userId, 'tournament_participants', participantId, participant, updatedParticipant);

      // Promote waitlisted participant nếu có slot trống
      await this.promoteNextWaitlisted(tx, tournamentId, participant.tournamentDivisionId ?? undefined);

      return {
        message: 'Đội thi đấu đã bị kick và hoàn tiền thành công.',
        refundAmount,
      };
    });
  }

  async myRegistration(tournamentId: string, userId: string, divisionId?: string) {
      const userRoster = await this.db
        .select({ participantId: schema.tournamentRosters.participantId })
        .from(schema.tournamentRosters)
        .innerJoin(schema.tournamentParticipants, eq(schema.tournamentRosters.participantId, schema.tournamentParticipants.id))
        .where(
          and(
            eq(schema.tournamentParticipants.tournamentId, tournamentId),
            eq(schema.tournamentRosters.userId, userId),
            ...(divisionId ? [eq(schema.tournamentParticipants.tournamentDivisionId, divisionId)] : []),
            ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
            ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
            ne(schema.tournamentParticipants.teamStatus, 'KICKED')
          )
        )
        .limit(1);

    if (userRoster.length === 0) {
      return { registered: false };
    }

    const participantId = userRoster[0].participantId;

    const [participant] = await this.db
      .select()
      .from(schema.tournamentParticipants)
      .where(eq(schema.tournamentParticipants.id, participantId))
      .limit(1);

    const members = await this.db
      .select({
        userId: schema.tournamentRosters.userId,
        role: schema.tournamentRosters.role,
        fullName: schema.profiles.fullName,
        avatarUrl: schema.profiles.avatarUrl,
      })
      .from(schema.tournamentRosters)
      .innerJoin(schema.users, eq(schema.tournamentRosters.userId, schema.users.id))
      .innerJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(eq(schema.tournamentRosters.participantId, participantId));

    return {
      registered: true,
      participant: {
        id: participant.id,
        teamName: participant.teamName,
        teamStatus: participant.teamStatus,
        partnerUserId: participant.partnerUserId,
        isPaid: participant.isPaid,
        tournamentDivisionId: participant.tournamentDivisionId,
        registeredAt: participant.registeredAt,
        teamInviteToken: participant.teamInviteToken,
        members,
        teamMembers: members,
        teamInviteLink:
          participant.teamStatus === 'PENDING_PARTNER' &&
          participant.registeredBy === userId &&
          participant.teamInviteToken
          ? `/tournaments/${tournamentId}/join-team?pid=${participant.id}&token=${participant.teamInviteToken}`
          : null
      }
    };
  }

  async findParticipantByTournamentAndUser(tournamentId: string, userId: string) {
    const [participant] = await this.db
      .select({ participant: schema.tournamentParticipants })
      .from(schema.tournamentParticipants)
      .innerJoin(
        schema.tournamentRosters,
        eq(schema.tournamentParticipants.id, schema.tournamentRosters.participantId),
      )
      .where(
        and(
          eq(schema.tournamentParticipants.tournamentId, tournamentId),
          eq(schema.tournamentRosters.userId, userId),
          ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
          ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
          ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
        ),
      )
      .limit(1);
    return participant?.participant ?? null;
  }

  async countParticipants(tournamentId: string) {
    const [result] = await this.db
      .select({ count: count() })
      .from(schema.tournamentParticipants)
      .where(eq(schema.tournamentParticipants.tournamentId, tournamentId));
    return result?.count ?? 0;
  }

  async findCommunityById(communityId: string) {
    const [record] = await this.db
      .select({
        id: schema.communities.id,
        name: schema.communities.name,
        joinMode: schema.communities.joinMode,
      })
      .from(schema.communities)
      .where(eq(schema.communities.id, communityId))
      .limit(1);
    return record || null;
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

  async findUserProfile(userId: string) {
    const [profile] = await this.db
      .select({
        fullName: schema.profiles.fullName,
        phoneNumber: schema.profiles.phoneNumber,
        dateOfBirth: schema.profiles.dateOfBirth,
        gender: schema.profiles.gender,
      })
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, userId))
      .limit(1);

    return profile ?? null;
  }

  async findParticipants(
    tournamentId: string,
    categoryId: string,
    divisionId?: string,
    onlyEligible = false,
  ): Promise<
    {
      id: string;
      teamName: string;
      seed: number | null;
      isPaid: boolean;
      tournamentDivisionId: string | null;
      teamStatus: string;
      registeredAt: Date;
      registeredBy: {
        id: string | null;
        fullName: string | null;
        avatarUrl: string | null;
      } | null;
      members: RosterMember[];
      eloPoints?: number;
    }[]
  > {
    // 1. Fetch participants and their registeredBy info
    const participants = await this.db
      .select({
        id: schema.tournamentParticipants.id,
        teamName: schema.tournamentParticipants.teamName,
        seed: schema.tournamentParticipants.seed,
        isPaid: schema.tournamentParticipants.isPaid,
        tournamentDivisionId: schema.tournamentParticipants.tournamentDivisionId,
        teamStatus: schema.tournamentParticipants.teamStatus,
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
      .where(
        divisionId
          ? and(
              eq(schema.tournamentParticipants.tournamentId, tournamentId),
              eq(schema.tournamentParticipants.tournamentDivisionId, divisionId),
              ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
              ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
              ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
              ...(onlyEligible
                ? [
                    eq(schema.tournamentParticipants.teamStatus, 'COMPLETE'),
                    eq(schema.tournamentParticipants.isPaid, true),
                  ]
                : []),
            )
          : and(
              eq(schema.tournamentParticipants.tournamentId, tournamentId),
              ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
              ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
              ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
              ...(onlyEligible
                ? [
                    eq(schema.tournamentParticipants.teamStatus, 'COMPLETE'),
                    eq(schema.tournamentParticipants.isPaid, true),
                  ]
                : []),
            )
      );

    if (participants.length === 0) return [];

    // 2. Fetch rosters and ELO info for all participant IDs
    const participantIds = participants.map((p) => p.id);

    const rosters = await this.db
      .select({
        participantId: schema.tournamentRosters.participantId,
        userId: schema.tournamentRosters.userId,
        role: schema.tournamentRosters.role,
        isMock: schema.users.isMock,
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
        isMock: r.isMock ?? false,
        elo: r.isMock
          ? {
              eloPoints: 1000,
              tierName: 'Chưa xếp hạng',
            }
          : {
              eloPoints: r.eloPoints ?? 1000,
              tierName: r.tierName ?? 'Beginner',
            },
      });
      rostersMap.set(r.participantId, list);
    }

    // 3. Batch query pair ELO if there are doubles teams
    const pairQueries: SQL[] = [];
    for (const members of rostersMap.values()) {
      if (members.length === 2) {
        const uids = members.map((m) => m.userId).sort();
        const andQuery = and(
          eq(schema.pairRanks.user1Id, uids[0]),
          eq(schema.pairRanks.user2Id, uids[1]),
          eq(schema.pairRanks.categoryId, categoryId)
        );
        if (andQuery) {
          pairQueries.push(andQuery);
        }
      }
    }

    const pairEloMap = new Map<string, number>();
    if (pairQueries.length > 0) {
      const dbPairs = await this.db
        .select({
          user1Id: schema.pairRanks.user1Id,
          user2Id: schema.pairRanks.user2Id,
          eloPoints: schema.pairRanks.eloPoints,
        })
        .from(schema.pairRanks)
        .where(or(...pairQueries));

      for (const p of dbPairs) {
        pairEloMap.set(`${p.user1Id}_${p.user2Id}`, p.eloPoints);
      }
    }

    return participants.map((p) => {
      const members = rostersMap.get(p.id) || [];
      let eloPoints = 1000;
      if (members.length === 1) {
        eloPoints = members[0].elo?.eloPoints ?? 1000;
      } else if (members.length === 2) {
        const sortedUids = members.map((m) => m.userId).sort();
        const pairKey = `${sortedUids[0]}_${sortedUids[1]}`;
        eloPoints = pairEloMap.get(pairKey) ?? 1000;
      }
      return {
        ...p,
        members,
        eloPoints,
      };
    });
  }

  async findPublicParticipants(
    tournamentId: string,
    categoryId: string,
    divisionId?: string,
  ) {
    return this.findParticipants(tournamentId, categoryId, divisionId, false);
  }

  async findOpsAuditLogs(
    tournamentId: string,
    divisionId?: string,
    limit: number = 50,
  ) {
    const stageRows = divisionId
      ? await this.db
          .select({ id: schema.tournamentStages.id })
          .from(schema.tournamentStages)
          .where(eq(schema.tournamentStages.tournamentDivisionId, divisionId))
      : [];

    const stageIds = stageRows.map((row) => row.id);

    const participantRows = await this.db
      .select({ id: schema.tournamentParticipants.id })
      .from(schema.tournamentParticipants)
      .where(
        divisionId
          ? and(
              eq(schema.tournamentParticipants.tournamentId, tournamentId),
              eq(schema.tournamentParticipants.tournamentDivisionId, divisionId),
            )
          : eq(schema.tournamentParticipants.tournamentId, tournamentId),
      );

    const matchRows = await this.db
      .select({ id: schema.matches.id })
      .from(schema.matches)
      .where(
        divisionId
          ? stageIds.length > 0
            ? and(
                eq(schema.matches.tournamentId, tournamentId),
                inArray(schema.matches.stageId, stageIds),
              )
            : and(eq(schema.matches.tournamentId, tournamentId), sql`1 = 0`)
          : eq(schema.matches.tournamentId, tournamentId),
      );

    const participantIds = participantRows.map((row) => row.id);
    const matchIds = matchRows.map((row) => row.id);
    const auditConditions: SQL[] = [
      and(eq(schema.auditLogs.tableName, 'tournaments'), eq(schema.auditLogs.recordId, tournamentId)) as SQL,
    ];

    if (participantIds.length > 0) {
      auditConditions.push(
        and(
          eq(schema.auditLogs.tableName, 'tournament_participants'),
          inArray(schema.auditLogs.recordId, participantIds),
        ) as SQL,
      );
    }

    if (matchIds.length > 0) {
      auditConditions.push(
        and(
          eq(schema.auditLogs.tableName, 'matches'),
          inArray(schema.auditLogs.recordId, matchIds),
        ) as SQL,
      );
    }

    return this.db
      .select({
        id: schema.auditLogs.id,
        userId: schema.auditLogs.userId,
        action: schema.auditLogs.action,
        tableName: schema.auditLogs.tableName,
        recordId: schema.auditLogs.recordId,
        oldValues: schema.auditLogs.oldValues,
        newValues: schema.auditLogs.newValues,
        createdAt: schema.auditLogs.createdAt,
        user: {
          email: schema.users.email,
          fullName: schema.profiles.fullName,
        },
      })
      .from(schema.auditLogs)
      .leftJoin(schema.users, eq(schema.auditLogs.userId, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(or(...auditConditions))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(limit);
  }

  async findBracket(tournamentId: string, divisionId?: string): Promise<{ stages: BracketStage[] }> {
    const stages = await this.db
      .select()
      .from(schema.tournamentStages)
      .where(
        and(
          divisionId
            ? and(
                eq(schema.tournamentStages.tournamentId, tournamentId),
                eq(schema.tournamentStages.tournamentDivisionId, divisionId),
              )
            : eq(schema.tournamentStages.tournamentId, tournamentId),
          isNull(schema.tournamentStages.deletedAt),
        )
      )
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
        .where(
          divisionId
            ? and(
                eq(schema.tournamentParticipants.tournamentId, tournamentId),
                eq(schema.tournamentParticipants.tournamentDivisionId, divisionId),
              )
            : eq(schema.tournamentParticipants.tournamentId, tournamentId),
        );

      const rosters = await this.db
        .select({
          participantId: schema.tournamentRosters.participantId,
          userId: schema.tournamentRosters.userId,
          fullName: schema.profiles.fullName,
        })
        .from(schema.tournamentRosters)
        .leftJoin(schema.profiles, eq(schema.tournamentRosters.userId, schema.profiles.userId))
        .where(inArray(schema.tournamentRosters.participantId, participants.map((p) => p.id)));

      const rostersMap = new Map<string, { userId: string; fullName: string | null }[]>();
      for (const r of rosters) {
        const list = rostersMap.get(r.participantId) || [];
        list.push({ userId: r.userId, fullName: r.fullName });
        rostersMap.set(r.participantId, list);
      }

      const participantMap = new Map(participants.map((p) => [
        p.id, 
        {
          ...p,
          members: rostersMap.get(p.id) || [],
        }
      ]));

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
        roundConfig: (g.roundConfig as Record<string, unknown>) || null,
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
        roundConfig: (s.roundConfig as Record<string, unknown>) || null,
        matchSettings: (s.matchSettings as Record<string, unknown>) || null,
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

  async countActiveTournamentsByUser(userId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.tournaments)
      .where(
        and(
          eq(schema.tournaments.createdBy, userId),
          sql`${schema.tournaments.deletedAt} IS NULL`
        )
      );
    return Number(result[0]?.count || 0);
  }

  async countCreatedTournaments(userId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: count() })
      .from(schema.tournaments)
      .where(
        and(
          eq(schema.tournaments.createdBy, userId),
          isNull(schema.tournaments.deletedAt)
        )
      );
    return Number(result?.count || 0);
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

    // 3. Tournaments where the user is a co-organizer (invited via staff)
    const coOrganized = await this.db
      .select({ id: schema.tournaments.id })
      .from(schema.tournaments)
      .innerJoin(schema.tournamentStaff, eq(schema.tournaments.id, schema.tournamentStaff.tournamentId))
      .where(
        and(
          eq(schema.tournamentStaff.userId, userId),
          eq(schema.tournamentStaff.role, 'CO_ORGANIZER'),
          sql`${schema.tournaments.deletedAt} IS NULL`
        )
      );

    const ids = Array.from(new Set([...created.map(t => t.id), ...joined.map(t => t.id), ...coOrganized.map(t => t.id)]));
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

  async findMyWorkspace(userId: string) {
    const tournamentSummarySelect = {
      id: schema.tournaments.id,
      name: schema.tournaments.name,
      status: schema.tournaments.status,
      startDate: schema.tournaments.startDate,
      endDate: schema.tournaments.endDate,
      registrationEndDate: schema.tournaments.registrationEndDate,
      locationAddress: schema.tournamentVenues.locationAddress,
      matchType: schema.tournaments.matchType,
      tournamentType: schema.tournaments.tournamentType,
      logoUrl: schema.tournaments.logoUrl,
      categoryId: schema.tournaments.categoryId,
      tournamentConfig: schema.tournaments.tournamentConfig,
      category: {
        id: schema.categories.id,
        name: schema.categories.name,
        slug: schema.categories.slug,
      },
    } as const;

    const [organizedRaw, participatingRaw, coOrganizerRaw, refereeInvites, refereeTournaments, refereeMatchesRaw] =
      await Promise.all([
        this.db
          .select(tournamentSummarySelect)
          .from(schema.tournaments)
          .leftJoin(schema.categories, eq(schema.tournaments.categoryId, schema.categories.id))
          .leftJoin(schema.tournamentVenues, eq(schema.tournaments.venueId, schema.tournamentVenues.id))
          .where(and(eq(schema.tournaments.createdBy, userId), isNull(schema.tournaments.deletedAt)))
          .orderBy(desc(schema.tournaments.updatedAt)),
        this.db
          .select(tournamentSummarySelect)
          .from(schema.tournamentRosters)
          .innerJoin(schema.tournamentParticipants, eq(schema.tournamentRosters.participantId, schema.tournamentParticipants.id))
          .innerJoin(schema.tournaments, eq(schema.tournamentParticipants.tournamentId, schema.tournaments.id))
          .leftJoin(schema.categories, eq(schema.tournaments.categoryId, schema.categories.id))
          .leftJoin(schema.tournamentVenues, eq(schema.tournaments.venueId, schema.tournamentVenues.id))
          .where(and(eq(schema.tournamentRosters.userId, userId), isNull(schema.tournaments.deletedAt)))
          .orderBy(desc(schema.tournaments.updatedAt)),
        this.db
          .select(tournamentSummarySelect)
          .from(schema.tournamentStaff)
          .innerJoin(schema.tournaments, eq(schema.tournamentStaff.tournamentId, schema.tournaments.id))
          .leftJoin(schema.categories, eq(schema.tournaments.categoryId, schema.categories.id))
          .leftJoin(schema.tournamentVenues, eq(schema.tournaments.venueId, schema.tournamentVenues.id))
          .where(
            and(
              eq(schema.tournamentStaff.userId, userId),
              eq(schema.tournamentStaff.role, 'CO_ORGANIZER'),
              isNull(schema.tournaments.deletedAt),
            ),
          )
          .orderBy(desc(schema.tournaments.updatedAt)),
        this.db
          .select({
            refereeId: schema.tournamentReferees.id,
            tournamentId: schema.tournamentReferees.tournamentId,
            tournamentName: schema.tournaments.name,
            logoUrl: schema.tournaments.logoUrl,
            tournamentStatus: schema.tournaments.status,
            categoryName: schema.categories.name,
            assignedAt: schema.tournamentReferees.createdAt,
            status: schema.tournamentReferees.status,
          })
          .from(schema.tournamentReferees)
          .innerJoin(schema.tournaments, eq(schema.tournamentReferees.tournamentId, schema.tournaments.id))
          .leftJoin(schema.categories, eq(schema.tournaments.categoryId, schema.categories.id))
          .where(
            and(
              eq(schema.tournamentReferees.userId, userId),
              eq(schema.tournamentReferees.status, 'INVITED'),
              isNull(schema.tournaments.deletedAt),
            ),
          )
          .orderBy(desc(schema.tournamentReferees.createdAt)),
        this.db
          .select({
            refereeId: schema.tournamentReferees.id,
            tournamentId: schema.tournamentReferees.tournamentId,
            tournamentName: schema.tournaments.name,
            logoUrl: schema.tournaments.logoUrl,
            tournamentStatus: schema.tournaments.status,
            categoryName: schema.categories.name,
            assignedAt: schema.tournamentReferees.createdAt,
            status: schema.tournamentReferees.status,
          })
          .from(schema.tournamentReferees)
          .innerJoin(schema.tournaments, eq(schema.tournamentReferees.tournamentId, schema.tournaments.id))
          .leftJoin(schema.categories, eq(schema.tournaments.categoryId, schema.categories.id))
          .where(
            and(
              eq(schema.tournamentReferees.userId, userId),
              eq(schema.tournamentReferees.status, 'ACCEPTED'),
              isNull(schema.tournaments.deletedAt),
            ),
          )
          .orderBy(desc(schema.tournamentReferees.createdAt)),
        this.db
          .select({
            id: schema.matches.id,
            tournamentId: schema.tournaments.id,
            tournamentName: schema.tournaments.name,
            logoUrl: schema.tournaments.logoUrl,
            categoryName: schema.categories.name,
            stageName: schema.tournamentStages.name,
            groupName: schema.tournamentGroups.name,
            roundNumber: schema.matches.roundNumber,
            matchOrder: schema.matches.matchOrder,
            status: schema.matches.status,
            scheduledAt: schema.matches.scheduledAt,
            courtName: schema.matches.courtName,
            participant1Id: schema.matches.participant1Id,
            participant2Id: schema.matches.participant2Id,
          })
          .from(schema.matches)
          .innerJoin(schema.tournamentStages, eq(schema.matches.stageId, schema.tournamentStages.id))
          .innerJoin(schema.tournamentGroups, eq(schema.matches.groupId, schema.tournamentGroups.id))
          .innerJoin(schema.tournaments, eq(schema.tournamentStages.tournamentId, schema.tournaments.id))
          .leftJoin(schema.categories, eq(schema.tournaments.categoryId, schema.categories.id))
          .where(
            and(
              eq(schema.matches.refereeId, userId),
              isNull(schema.matches.deletedAt),
              isNull(schema.tournaments.deletedAt),
            ),
          )
          .orderBy(asc(schema.matches.scheduledAt), asc(schema.matches.roundNumber), asc(schema.matches.matchOrder)),
      ]);

    const organizedIds = new Set(organizedRaw.map((tournament) => tournament.id));
    const dedupeByTournamentId = <T extends { id: string }>(items: T[]) => {
      const map = new Map<string, T>();
      for (const item of items) {
        if (!map.has(item.id)) {
          map.set(item.id, item);
        }
      }
      return Array.from(map.values());
    };

    const participantIds = Array.from(
      new Set(
        refereeMatchesRaw.flatMap((match) => [match.participant1Id, match.participant2Id].filter((id): id is string => Boolean(id))),
      ),
    );

    const participants =
      participantIds.length > 0
        ? await this.db
            .select({
              id: schema.tournamentParticipants.id,
              teamName: schema.tournamentParticipants.teamName,
            })
            .from(schema.tournamentParticipants)
            .where(inArray(schema.tournamentParticipants.id, participantIds))
        : [];

    const participantsMap = new Map(participants.map((participant) => [participant.id, participant.teamName]));

    return {
      organizedTournaments: dedupeByTournamentId(organizedRaw),
      participatingTournaments: dedupeByTournamentId(
        participatingRaw.filter((tournament) => !organizedIds.has(tournament.id)),
      ),
      coOrganizerTournaments: dedupeByTournamentId(
        coOrganizerRaw.filter((tournament) => !organizedIds.has(tournament.id)),
      ),
      refereeInvites,
      refereeTournaments,
      refereeMatches: refereeMatchesRaw.map((match) => ({
        ...match,
        participant1Name: match.participant1Id ? participantsMap.get(match.participant1Id) ?? null : null,
        participant2Name: match.participant2Id ? participantsMap.get(match.participant2Id) ?? null : null,
      })),
    };
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

  async findByIdVenue(venueId: string) {
    const [venue] = await this.db
      .select()
      .from(schema.tournamentVenues)
      .where(eq(schema.tournamentVenues.id, venueId))
      .limit(1);
    return venue || null;
  }

  async findCategoryBySlug(slug: string) {
    const result = await this.db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.slug, slug))
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
          ...(data.matchSettings !== undefined && {
            matchSettings: data.matchSettings || null,
          }),
        })
        .where(eq(schema.tournamentStages.id, id))
        .returning();

      await this.auditService.logUpdate(tx, userId, 'tournament_stages', id, oldRecord, updated);
      return updated;
    });
  }

  async findGroupById(id: string) {
    const result = await this.db
      .select({
        id: schema.tournamentGroups.id,
        stageId: schema.tournamentGroups.stageId,
        name: schema.tournamentGroups.name,
        roundConfig: schema.tournamentGroups.roundConfig,
        tournamentId: schema.tournamentStages.tournamentId,
      })
      .from(schema.tournamentGroups)
      .innerJoin(
        schema.tournamentStages,
        eq(schema.tournamentGroups.stageId, schema.tournamentStages.id),
      )
      .where(eq(schema.tournamentGroups.id, id))
      .limit(1);
    return result[0] || null;
  }

  async updateGroup(id: string, userId: string, data: UpdateGroupDto) {
    return await this.db.transaction(async (tx) => {
      const [oldRecord] = await tx
        .select()
        .from(schema.tournamentGroups)
        .where(eq(schema.tournamentGroups.id, id))
        .limit(1);

      if (!oldRecord) return null;

      const [updated] = await tx
        .update(schema.tournamentGroups)
        .set({
          ...(data.name && { name: data.name }),
          ...(data.roundConfig !== undefined && { roundConfig: data.roundConfig }),
        })
        .where(eq(schema.tournamentGroups.id, id))
        .returning();

      await this.auditService.logUpdate(tx, userId, 'tournament_groups', id, oldRecord, updated);
      return updated;
    });
  }

  async createParent(userId: string, data: CreateParentTournamentDto) {
    return await this.db.transaction(async (tx) => {
      const [record] = await tx
        .insert(schema.parentTournaments)
        .values({
          createdBy: userId,
          name: data.name,
          description: data.description || null,
          bannerUrl: data.bannerUrl || null,
          logoUrl: data.logoUrl || null,
        })
        .returning();
      await this.auditService.logCreate(tx, userId, 'parent_tournaments', record.id, record);
      return record;
    });
  }

  async updateParent(id: string, userId: string, data: UpdateParentTournamentDto) {
    return await this.db.transaction(async (tx) => {
      const [oldRecord] = await tx
        .select()
        .from(schema.parentTournaments)
        .where(eq(schema.parentTournaments.id, id))
        .limit(1);

      if (!oldRecord) return null;

      const [updated] = await tx
        .update(schema.parentTournaments)
        .set({
          ...(data.name && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.bannerUrl !== undefined && { bannerUrl: data.bannerUrl }),
          ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
          updatedAt: new Date(),
        })
        .where(eq(schema.parentTournaments.id, id))
        .returning();

      await this.auditService.logUpdate(tx, userId, 'parent_tournaments', id, oldRecord, updated);
      return updated;
    });
  }

  async findParentById(id: string) {
    const [parent] = await this.db
      .select()
      .from(schema.parentTournaments)
      .where(
        and(
          eq(schema.parentTournaments.id, id),
          sql`${schema.parentTournaments.deletedAt} IS NULL`
        )
      )
      .limit(1);

    if (!parent) return null;

    // Fetch divisions under this parent
    const rawDivisions = await this.db
      .select({
        id: schema.tournaments.id,
        parentId: schema.tournaments.parentId,
        name: schema.tournaments.name,
        description: schema.tournaments.description,
        startDate: schema.tournaments.startDate,
        endDate: schema.tournaments.endDate,
        status: schema.tournaments.status,
        matchType: schema.tournaments.matchType,
        genderRestriction: schema.tournaments.genderRestriction,
        categoryId: schema.tournaments.categoryId,
        bannerUrl: schema.tournaments.bannerUrl,
        logoUrl: schema.tournaments.logoUrl,
        category: {
          id: schema.categories.id,
          name: schema.categories.name,
        }
      })
      .from(schema.tournaments)
      .leftJoin(schema.categories, eq(schema.tournaments.categoryId, schema.categories.id))
      .where(
        and(
          eq(schema.tournaments.parentId, id),
          sql`${schema.tournaments.deletedAt} IS NULL`
        )
      );

    const divisions = await Promise.all(
      rawDivisions.map(async (div) => {
        // Count active participants
        const [pCount] = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.tournamentParticipants)
          .where(
            and(
              eq(schema.tournamentParticipants.tournamentId, div.id),
              ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
              ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
              ne(schema.tournamentParticipants.teamStatus, 'KICKED')
            )
          );

        return {
          ...div,
          _summary: {
            participantCount: pCount?.count || 0
          }
        };
      })
    );

    return {
      ...parent,
      divisions,
      _aggregation: {
        totalDivisions: divisions.length,
        totalParticipants: divisions.reduce((sum, d) => sum + (d._summary?.participantCount || 0), 0),
        divisionStatuses: divisions.map(d => ({ name: d.name, status: d.status })),
      },
    };
  }

  async findByParentId(parentId: string) {
    return await this.db
      .select()
      .from(schema.tournaments)
      .where(
        and(
          eq(schema.tournaments.parentId, parentId),
          sql`${schema.tournaments.deletedAt} IS NULL`
        )
      );
  }

  async findParentsByUser(userId: string) {
    return await this.db
      .select()
      .from(schema.parentTournaments)
      .where(
        and(
          eq(schema.parentTournaments.createdBy, userId),
          sql`${schema.parentTournaments.deletedAt} IS NULL`
        )
      );
  }

  async softDeleteParent(id: string, userId: string) {
    return await this.db.transaction(async (tx) => {
      const [oldRecord] = await tx
        .select()
        .from(schema.parentTournaments)
        .where(eq(schema.parentTournaments.id, id))
        .limit(1);

      if (!oldRecord) return null;

      // Find all child divisions under this parent
      const divisions = await tx
        .select({ id: schema.tournaments.id })
        .from(schema.tournaments)
        .where(eq(schema.tournaments.parentId, id));
      const divisionIds = divisions.map((d) => d.id);

      const [deleted] = await tx
        .update(schema.parentTournaments)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.parentTournaments.id, id))
        .returning();

      // Cascade soft delete to all child tournaments under this parent
      await tx
        .update(schema.tournaments)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.tournaments.parentId, id));

      // Cascade directly by tournamentId; knockout matches may not have groupId.
      if (divisionIds.length > 0) {
        await tx
          .update(schema.matches)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              inArray(schema.matches.tournamentId, divisionIds),
              isNull(schema.matches.deletedAt),
            ),
          );
      }

      // Delete notifications for the parent tournament
      await tx
        .delete(schema.notifications)
        .where(like(schema.notifications.redirectUrl, `%/${id}%`));

      // Delete notifications for each child division
      for (const divId of divisionIds) {
        await tx
          .delete(schema.notifications)
          .where(like(schema.notifications.redirectUrl, `%/${divId}%`));
      }

      await this.auditService.logDelete(tx, userId, 'parent_tournaments', id, oldRecord);
      return deleted;
    });
  }

  async seedMockParticipants(tournamentId: string, names: string[], divisionId?: string) {
    return await this.db.transaction(async (tx) => {
      const tournament = await tx
        .select()
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, tournamentId))
        .limit(1)
        .then(res => res[0]);

      if (!tournament) throw new BadRequestException('Giải đấu không tồn tại');

      // Check division if divisionId provided, else use tournament matchType
      let matchType = tournament.matchType;
      if (divisionId) {
        const division = await tx
          .select()
          .from(schema.tournamentDivisions)
          .where(eq(schema.tournamentDivisions.id, divisionId))
          .limit(1)
          .then(res => res[0]);
        if (division) {
          matchType = division.matchType;
        }
      }

      const isDoubles = matchType === 'DOUBLES' || matchType === 'MIXED_DOUBLES';
      const createdParticipants: (typeof schema.tournamentParticipants.$inferSelect)[] = [];

      if (isDoubles) {
        for (let i = 0; i < names.length; i += 2) {
          const name1 = names[i];
          const name2 = names[i + 1] || `${name1} Partner`;

          const mockEmail1 = `mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@mock.com`;
          const mockEmail2 = `mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@mock.com`;

          const [user1] = await tx.insert(schema.users).values({ email: mockEmail1, isMock: true }).returning();
          await tx.insert(schema.profiles).values({ userId: user1.id, fullName: name1 }).returning();

          const [user2] = await tx.insert(schema.users).values({ email: mockEmail2, isMock: true }).returning();
          await tx.insert(schema.profiles).values({ userId: user2.id, fullName: name2 }).returning();

          const teamName = `${name1} - ${name2}`;
          const [participant] = await tx.insert(schema.tournamentParticipants).values({
            tournamentId,
            tournamentDivisionId: divisionId ?? null,
            registeredBy: user1.id,
            teamName,
            isPaid: true,
            teamInviteToken: null,
            teamStatus: 'COMPLETE',
            isMock: true,
          }).returning();

          await tx.insert(schema.tournamentRosters).values({ participantId: participant.id, userId: user1.id, role: 'MAIN' });
          await tx.insert(schema.tournamentRosters).values({ participantId: participant.id, userId: user2.id, role: 'MAIN' });

          createdParticipants.push(participant);
        }
      } else {
        for (const name of names) {
          const mockEmail = `mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@mock.com`;

          const [user] = await tx.insert(schema.users).values({ email: mockEmail, isMock: true }).returning();
          await tx.insert(schema.profiles).values({ userId: user.id, fullName: name }).returning();

          const [participant] = await tx.insert(schema.tournamentParticipants).values({
            tournamentId,
            tournamentDivisionId: divisionId ?? null,
            registeredBy: user.id,
            teamName: name,
            isPaid: true,
            teamInviteToken: null,
            teamStatus: 'COMPLETE',
            isMock: true,
          }).returning();

          await tx.insert(schema.tournamentRosters).values({ participantId: participant.id, userId: user.id, role: 'MAIN' });

          createdParticipants.push(participant);
        }
      }

      // Gán seed dựa trên thứ tự tên (i+1) để hỗ trợ SEEDED bracket
      for (let idx = 0; idx < createdParticipants.length; idx++) {
        await tx
          .update(schema.tournamentParticipants)
          .set({ seed: idx + 1 })
          .where(eq(schema.tournamentParticipants.id, createdParticipants[idx].id));
      }

      return createdParticipants;
    });
  }

  async clearMockParticipants(tournamentId: string, divisionId?: string) {
    return await this.db.transaction(async (tx) => {
      const mockParts = await tx
        .select({ id: schema.tournamentParticipants.id })
        .from(schema.tournamentParticipants)
        .where(
          divisionId
            ? and(
                eq(schema.tournamentParticipants.tournamentId, tournamentId),
                eq(schema.tournamentParticipants.isMock, true),
                eq(schema.tournamentParticipants.tournamentDivisionId, divisionId),
              )
            : and(
                eq(schema.tournamentParticipants.tournamentId, tournamentId),
                eq(schema.tournamentParticipants.isMock, true),
              )
        );

      if (mockParts.length === 0) return { count: 0 };

      const partIds = mockParts.map(p => p.id);

      const mockRosters = await tx
        .select({ userId: schema.tournamentRosters.userId })
        .from(schema.tournamentRosters)
        .where(inArray(schema.tournamentRosters.participantId, partIds));

      await tx
        .delete(schema.tournamentRosters)
        .where(inArray(schema.tournamentRosters.participantId, partIds));

      // Clear match participant references to prevent foreign key constraint violations
      await tx
        .update(schema.matches)
        .set({ participant1Id: null })
        .where(inArray(schema.matches.participant1Id, partIds));

      await tx
        .update(schema.matches)
        .set({ participant2Id: null })
        .where(inArray(schema.matches.participant2Id, partIds));

      await tx
        .update(schema.matches)
        .set({ winnerId: null })
        .where(inArray(schema.matches.winnerId, partIds));

      // Clear bracket stages, groups and matches for the tournament/division to clear the bracket
      await tx
        .delete(schema.tournamentStages)
        .where(
          divisionId
            ? and(
                eq(schema.tournamentStages.tournamentId, tournamentId),
                eq(schema.tournamentStages.tournamentDivisionId, divisionId),
              )
            : eq(schema.tournamentStages.tournamentId, tournamentId),
        );

      await tx
        .delete(schema.tournamentParticipants)
        .where(inArray(schema.tournamentParticipants.id, partIds));

      if (mockRosters.length > 0) {
        const userIds = mockRosters.map(r => r.userId);
        await tx
          .delete(schema.profiles)
          .where(inArray(schema.profiles.userId, userIds));
        await tx
          .delete(schema.users)
          .where(and(inArray(schema.users.id, userIds), eq(schema.users.isMock, true)));
      }

      return { count: partIds.length };
    });
  }

  async deleteMockParticipant(tournamentId: string, participantId: string) {
    return await this.db.transaction(async (tx) => {
      const [participant] = await tx
        .select()
        .from(schema.tournamentParticipants)
        .where(
          and(
            eq(schema.tournamentParticipants.id, participantId),
            eq(schema.tournamentParticipants.tournamentId, tournamentId),
          ),
        )
        .limit(1);

      if (!participant) {
        throw new BadRequestException('Không tìm thấy người tham gia');
      }

      if (!participant.isMock) {
        throw new BadRequestException('Chỉ có thể xóa các VĐV giả lập bằng hành động này');
      }

      const mockRosters = await tx
        .select({ userId: schema.tournamentRosters.userId })
        .from(schema.tournamentRosters)
        .where(eq(schema.tournamentRosters.participantId, participantId));

      await tx
        .delete(schema.tournamentRosters)
        .where(eq(schema.tournamentRosters.participantId, participantId));

      await tx
        .update(schema.matches)
        .set({ participant1Id: null })
        .where(eq(schema.matches.participant1Id, participantId));

      await tx
        .update(schema.matches)
        .set({ participant2Id: null })
        .where(eq(schema.matches.participant2Id, participantId));

      await tx
        .update(schema.matches)
        .set({ winnerId: null })
        .where(eq(schema.matches.winnerId, participantId));

      await tx
        .delete(schema.tournamentParticipants)
        .where(eq(schema.tournamentParticipants.id, participantId));

      const userIds = Array.from(new Set(mockRosters.map((roster) => roster.userId)));
      if (userIds.length > 0) {
        await tx
          .delete(schema.profiles)
          .where(inArray(schema.profiles.userId, userIds));
        await tx
          .delete(schema.users)
          .where(and(inArray(schema.users.id, userIds), eq(schema.users.isMock, true)));
      }

      return { count: 1 };
    });
  }

  async updateParticipantStatus(participantId: string, status: string) {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(schema.tournamentParticipants)
        .where(eq(schema.tournamentParticipants.id, participantId))
        .limit(1);
      if (!existing) {
        return null;
      }

      const [updated] = await tx
        .update(schema.tournamentParticipants)
        .set({ teamStatus: status })
        .where(eq(schema.tournamentParticipants.id, participantId))
        .returning();

      if (status === 'REJECTED') {
        await this.invalidatePendingParticipantPayments(
          tx,
          existing.tournamentId,
          participantId,
          'PARTICIPANT_REJECTED',
        );
      }

      return updated ?? null;
    });
  }

  async findParticipantById(participantId: string) {
    const [participant] = await this.db
      .select()
      .from(schema.tournamentParticipants)
      .where(eq(schema.tournamentParticipants.id, participantId))
      .limit(1);
    return participant;
  }

  async getParticipantRosters(participantId: string) {
    return this.db
      .select({
        userId: schema.tournamentRosters.userId,
        role: schema.tournamentRosters.role,
      })
      .from(schema.tournamentRosters)
      .where(eq(schema.tournamentRosters.participantId, participantId));
  }

  async findUserByEmailOrPhone(emailOrPhone: string) {
    const [user] = await this.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(
        or(
          eq(schema.users.email, emailOrPhone),
          eq(schema.profiles.phoneNumber, emailOrPhone),
        )
      )
      .limit(1);
    return user;
  }

  async assignReservedSlot(
    tournamentId: string,
    userId: string,
    teamName: string,
    partnerId?: string,
    divisionId?: string,
  ) {
    return await this.db.transaction(async (tx) => {
      const tournament = await tx
        .select()
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, tournamentId))
        .limit(1)
        .then(res => res[0]);

      if (!tournament) throw new BadRequestException('Giải đấu không tồn tại');

      let divisionMatchType = tournament.matchType;
      if (divisionId) {
        const division = await tx
          .select()
          .from(schema.tournamentDivisions)
          .where(
            and(
              eq(schema.tournamentDivisions.id, divisionId),
              eq(schema.tournamentDivisions.tournamentId, tournamentId),
            ),
          )
          .limit(1)
          .then((res) => res[0]);

        if (!division) {
          throw new BadRequestException('Hình thức thi đấu không hợp lệ.');
        }

        divisionMatchType = division.matchType;
      }

      const isDoubles = divisionMatchType === 'DOUBLES' || divisionMatchType === 'MIXED_DOUBLES';
      const teamStatus = isDoubles ? (partnerId ? 'COMPLETE' : 'PENDING_PARTNER') : 'COMPLETE';

      const [participant] = await tx
        .insert(schema.tournamentParticipants)
        .values({
          tournamentId,
          tournamentDivisionId: divisionId ?? null,
          registeredBy: userId,
          teamName: teamName || 'Đội khách mời',
          isPaid: true,
          isWildcard: true,
          teamStatus,
        })
        .returning();

      await tx.insert(schema.tournamentRosters).values({
        participantId: participant.id,
        userId: userId,
        role: 'MAIN',
      });

      if (isDoubles && partnerId) {
        await tx.insert(schema.tournamentRosters).values({
          participantId: participant.id,
          userId: partnerId,
          role: 'MAIN',
        });
      }

      return participant;
    });
  }

  async getUserElo(userId: string, categoryId: string, matchType: string): Promise<number> {
    const result = await this.db
      .select({ eloPoints: schema.userRanks.eloPoints })
      .from(schema.userRanks)
      .where(
        and(
          eq(schema.userRanks.userId, userId),
          eq(schema.userRanks.categoryId, categoryId),
          eq(schema.userRanks.matchType, matchType),
          sql`${schema.userRanks.communityId} IS NULL`
        )
      )
      .limit(1);
    return result[0]?.eloPoints ?? 1000;
  }

  async getUserEloInTx(tx: Transaction, userId: string, categoryId: string, matchType: string): Promise<number> {
    const result = await tx
      .select({ eloPoints: schema.userRanks.eloPoints })
      .from(schema.userRanks)
      .where(
        and(
          eq(schema.userRanks.userId, userId),
          eq(schema.userRanks.categoryId, categoryId),
          eq(schema.userRanks.matchType, matchType),
          sql`${schema.userRanks.communityId} IS NULL`
        )
      )
      .limit(1);
    return result[0]?.eloPoints ?? 1000;
  }

  async findLeaderByParticipantId(participantId: string) {
    const result = await this.db
      .select()
      .from(schema.tournamentRosters)
      .where(
        and(
          eq(schema.tournamentRosters.participantId, participantId),
          eq(schema.tournamentRosters.role, 'MAIN')
        )
      )
      .limit(1);
    return result[0] || null;
  }

  async cancelTournament(tournamentId: string) {
    return await this.db.transaction(async (tx) => {
      // 1. Update tournament status to CANCELLED
      const [updatedTournament] = await tx
        .update(schema.tournaments)
        .set({ status: 'CANCELLED', updatedAt: new Date() })
        .where(eq(schema.tournaments.id, tournamentId))
        .returning();

      // 2. Fetch all active participants
      const activeParticipants = await tx
        .select()
        .from(schema.tournamentParticipants)
        .where(
          and(
            eq(schema.tournamentParticipants.tournamentId, tournamentId),
            ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
            ne(schema.tournamentParticipants.teamStatus, 'KICKED')
          )
        );

      // 3. Refund each paid participant
      for (const participant of activeParticipants) {
        await this.invalidatePendingParticipantPayments(
          tx,
          tournamentId,
          participant.id,
          'TOURNAMENT_CANCELLED',
        );

        if (participant.isPaid) {
          const entryFeeAmount = await this.resolveDivisionEntryFee(
            tx,
            updatedTournament,
            participant.tournamentDivisionId,
          );
          if (entryFeeAmount > 0) {
            await tx
              .update(schema.payments)
              .set({
                refundStatus: 'PENDING_REFUND',
                refundedAmount: '0.00',
              })
              .where(
                and(
                  eq(schema.payments.tournamentId, tournamentId),
                  eq(schema.payments.participantId, participant.id),
                  eq(schema.payments.status, 'COMPLETED')
                )
              );
          }
        }
      }

      // 4. Cancel all active matches
      const stages = await tx
        .select({ id: schema.tournamentStages.id })
        .from(schema.tournamentStages)
        .where(eq(schema.tournamentStages.tournamentId, tournamentId));
      const stageIds = stages.map((s) => s.id);

      if (stageIds.length > 0) {
        const groups = await tx
          .select({ id: schema.tournamentGroups.id })
          .from(schema.tournamentGroups)
          .where(inArray(schema.tournamentGroups.stageId, stageIds));
        const groupIds = groups.map((g) => g.id);

        if (groupIds.length > 0) {
          await tx
            .update(schema.matches)
            .set({ status: 'CANCELLED', updatedAt: new Date() })
            .where(
              and(
                inArray(schema.matches.groupId, groupIds),
                ne(schema.matches.status, 'COMPLETED'),
                ne(schema.matches.status, 'CANCELLED')
              )
            );
        }
      }

      return updatedTournament;
    });
  }

  async getParentWithAggregation(parentId: string) {
    const children = await this.db
      .select({
        id: schema.tournaments.id,
        status: schema.tournaments.status,
      })
      .from(schema.tournaments)
      .where(
        and(
          eq(schema.tournaments.parentId, parentId),
          sql`${schema.tournaments.deletedAt} IS NULL`
        )
      );

    const participantCounts = await Promise.all(
      children.map(async (child) => {
        const [result] = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.tournamentParticipants)
          .where(
            and(
              eq(schema.tournamentParticipants.tournamentId, child.id),
              ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
              ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
              ne(schema.tournamentParticipants.teamStatus, 'KICKED')
            )
          );
        return result?.count || 0;
      })
    );

    const totalParticipants = participantCounts.reduce((sum, c) => sum + c, 0);
    const statuses = children.map(c => c.status);

    return {
      totalParticipants,
      divisionCount: children.length,
      statuses,
    };
  }

  async getFeesConfig() {
    const getVal = async (key: string, def: string) => {
      const [existing] = await this.db
        .select()
        .from(schema.systemConfigs)
        .where(eq(schema.systemConfigs.key, key))
        .limit(1);
      return existing ? existing.value : def;
    };

    return {
      feePublicRanked: parseFloat(await getVal('TOURNAMENT_PUBLISH_FEE_PUBLIC_RANKED', '0')),
      feePublicUnranked: parseFloat(await getVal('TOURNAMENT_PUBLISH_FEE_PUBLIC_UNRANKED', '0')),
      feeClub: parseFloat(await getVal('TOURNAMENT_PUBLISH_FEE_CLUB', '0')),
      pctPublicRanked: parseFloat(await getVal('PLATFORM_FEE_PERCENTAGE_PUBLIC_RANKED', '5')),
      pctPublicUnranked: parseFloat(await getVal('PLATFORM_FEE_PERCENTAGE_PUBLIC_UNRANKED', '5')),
      pctClub: parseFloat(await getVal('PLATFORM_FEE_PERCENTAGE_CLUB', '0')),
      allowEntryFees: (await getVal('ALLOW_TOURNAMENT_ENTRY_FEES', 'true')).toLowerCase() === 'true',
    };
  }

  async cancelPendingRegistrationsIfFull(
    tournamentId: string,
  ): Promise<Array<{ leaderId: string; divisionId: string | null }>> {
    return await this.db.transaction(async (tx) => {
      const [tournament] = await tx
        .select({
          maxParticipants: schema.tournaments.maxParticipants,
          entryFee: schema.tournaments.entryFee,
        })
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, tournamentId))
        .limit(1);

      if (!tournament || !tournament.maxParticipants) return [];

      const [completedCount] = await tx
        .select({ count: count() })
        .from(schema.tournamentParticipants)
        .where(
          and(
            eq(schema.tournamentParticipants.tournamentId, tournamentId),
            eq(schema.tournamentParticipants.teamStatus, 'COMPLETE'),
            eq(schema.tournamentParticipants.isPaid, true),
          )
        );

      if (completedCount.count >= tournament.maxParticipants) {
        const pendingParts = await tx
          .select()
          .from(schema.tournamentParticipants)
          .where(
            and(
              eq(schema.tournamentParticipants.tournamentId, tournamentId),
              eq(schema.tournamentParticipants.teamStatus, 'PENDING_APPROVAL')
            )
          );

        if (pendingParts.length === 0) return [];

        const canceledLeaders: Array<{ leaderId: string; divisionId: string | null }> = [];

        for (const p of pendingParts) {
          await tx
            .update(schema.tournamentParticipants)
            .set({ teamStatus: 'KICKED', teamInviteToken: null })
            .where(eq(schema.tournamentParticipants.id, p.id));

          await this.invalidatePendingParticipantPayments(
            tx,
            tournamentId,
            p.id,
            'REGISTRATION_CANCELLED_TOURNAMENT_FULL',
          );

          const entryFeeAmount = await this.resolveDivisionEntryFee(
            tx,
            tournament,
            p.tournamentDivisionId,
          );
          if (entryFeeAmount > 0 && p.isPaid) {
            await tx
              .update(schema.payments)
              .set({
                refundStatus: 'PENDING_REFUND',
                refundedAmount: '0.00',
              })
              .where(
                and(
                  eq(schema.payments.tournamentId, tournamentId),
                  eq(schema.payments.participantId, p.id),
                  eq(schema.payments.status, 'COMPLETED')
                )
              );
          }

          canceledLeaders.push({
            leaderId: p.registeredBy,
            divisionId: p.tournamentDivisionId,
          });
        }
        return canceledLeaders;
      }
      return [];
    });
  }

  async processPendingRegistrationsTimeout(): Promise<
    Array<{
      leaderId: string;
      tournamentId: string;
      tournamentName: string;
      divisionId: string | null;
    }>
  > {
    return await this.db.transaction(async (tx) => {
      const timeoutThreshold = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago

      const expiredParts = await tx
        .select({
          participant: schema.tournamentParticipants,
          tournament: schema.tournaments,
        })
        .from(schema.tournamentParticipants)
        .innerJoin(schema.tournaments, eq(schema.tournamentParticipants.tournamentId, schema.tournaments.id))
        .where(
          and(
            eq(schema.tournamentParticipants.teamStatus, 'PENDING_PARTNER'),
            lt(schema.tournamentParticipants.registeredAt, timeoutThreshold)
          )
        );

      if (expiredParts.length === 0) return [];

      const results: Array<{
        leaderId: string;
        tournamentId: string;
        tournamentName: string;
        divisionId: string | null;
      }> = [];

      for (const { participant, tournament } of expiredParts) {
        await tx
          .update(schema.tournamentParticipants)
          .set({ teamStatus: 'KICKED', teamInviteToken: null })
          .where(eq(schema.tournamentParticipants.id, participant.id));

        await this.invalidatePendingParticipantPayments(
          tx,
          tournament.id,
          participant.id,
          'PARTNER_JOIN_TIMEOUT',
        );

        const entryFeeAmount = await this.resolveDivisionEntryFee(
          tx,
          tournament,
          participant.tournamentDivisionId,
        );
        if (entryFeeAmount > 0 && participant.isPaid) {
          await tx
            .update(schema.payments)
            .set({
              refundStatus: 'PENDING_REFUND',
              refundedAmount: '0.00',
            })
            .where(
              and(
                eq(schema.payments.tournamentId, tournament.id),
                eq(schema.payments.participantId, participant.id),
                eq(schema.payments.status, 'COMPLETED')
              )
            );
        }

        results.push({
          leaderId: participant.registeredBy,
          tournamentId: tournament.id,
          tournamentName: tournament.name,
          divisionId: participant.tournamentDivisionId,
        });
      }

      return results;
    });
  }

  /**
   * Promote first WAITLISTED participant to the next valid ready state when a slot opens up.
   * Skill: BE Skill 6 (Domain Logic) — waitlist tự động
   */
  private async promoteNextWaitlisted(
    tx: Transaction,
    tournamentId: string,
    divisionId?: string,
  ) {
    const divisionFilter = divisionId
      ? eq(schema.tournamentParticipants.tournamentDivisionId, divisionId)
      : undefined;

    const [nextWaitlisted] = await tx
      .select()
      .from(schema.tournamentParticipants)
      .where(
        and(
          eq(schema.tournamentParticipants.tournamentId, tournamentId),
          eq(schema.tournamentParticipants.teamStatus, 'WAITLISTED'),
          ...(divisionFilter ? [divisionFilter] : []),
        ),
      )
      .orderBy(asc(schema.tournamentParticipants.registeredAt))
      .limit(1);

    if (nextWaitlisted) {
      const [tournament] = await tx
        .select({
          matchType: schema.tournaments.matchType,
          entryFee: schema.tournaments.entryFee,
          tournamentConfig: schema.tournaments.tournamentConfig,
        })
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, tournamentId))
        .limit(1);

      const [division] = nextWaitlisted.tournamentDivisionId
        ? await tx
            .select({ matchType: schema.tournamentDivisions.matchType })
            .from(schema.tournamentDivisions)
            .where(eq(schema.tournamentDivisions.id, nextWaitlisted.tournamentDivisionId))
            .limit(1)
        : [null];

      const [rosterCount] = await tx
        .select({ count: count() })
        .from(schema.tournamentRosters)
        .where(eq(schema.tournamentRosters.participantId, nextWaitlisted.id));

      const matchType = division?.matchType ?? tournament?.matchType ?? null;
      const isDoubles = this.isDoublesMatchType(matchType);
      const entryFeeAmount = await this.resolveDivisionEntryFee(
        tx,
        { entryFee: tournament?.entryFee ?? null },
        nextWaitlisted.tournamentDivisionId,
      );
      const regMode =
        ((tournament?.tournamentConfig || {}) as Record<string, unknown>).registrationMode === 'APPROVAL'
          ? 'APPROVAL'
          : 'OPEN';
      const promotedStatus =
        isDoubles && Number(rosterCount.count) < 2
          ? 'PENDING_PARTNER'
          : regMode === 'APPROVAL'
            ? 'PENDING_APPROVAL'
            : 'COMPLETE';

      const [promoted] = await tx
        .update(schema.tournamentParticipants)
        .set({
          teamStatus: promotedStatus,
          isPaid: nextWaitlisted.isPaid || entryFeeAmount === 0,
        })
        .where(eq(schema.tournamentParticipants.id, nextWaitlisted.id))
        .returning();
      return promoted;
    }
    return null;
  }

  async findReferees(tournamentId: string) {
    return this.db
      .select({
        id: schema.tournamentReferees.id,
        userId: schema.tournamentReferees.userId,
        status: schema.tournamentReferees.status,
        fullName: schema.profiles.fullName,
        email: schema.users.email,
        avatarUrl: schema.profiles.avatarUrl,
      })
      .from(schema.tournamentReferees)
      .innerJoin(schema.users, eq(schema.tournamentReferees.userId, schema.users.id))
      .innerJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(eq(schema.tournamentReferees.tournamentId, tournamentId));
  }

  // ──────── Staff ────────

  async addStaffMember(tournamentId: string, userId: string, role: string, createdBy: string) {
    const [existing] = await this.db
      .select()
      .from(schema.tournamentStaff)
      .where(
        and(
          eq(schema.tournamentStaff.tournamentId, tournamentId),
          eq(schema.tournamentStaff.userId, userId),
        ),
      )
      .limit(1);
    if (existing) {
      const [updated] = await this.db
        .update(schema.tournamentStaff)
        .set({ role })
        .where(
          and(
            eq(schema.tournamentStaff.tournamentId, tournamentId),
            eq(schema.tournamentStaff.userId, userId),
          ),
        )
        .returning();
      return updated ?? existing;
    }
    const [record] = await this.db
      .insert(schema.tournamentStaff)
      .values({ tournamentId, userId, role, createdBy })
      .returning();
    return record;
  }

  async removeStaffMember(tournamentId: string, userId: string) {
    const [record] = await this.db
      .delete(schema.tournamentStaff)
      .where(
        and(
          eq(schema.tournamentStaff.tournamentId, tournamentId),
          eq(schema.tournamentStaff.userId, userId),
        ),
      )
      .returning();
    return record;
  }

  async isCoOrganizer(tournamentId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: schema.tournamentStaff.id })
      .from(schema.tournamentStaff)
      .where(
        and(
          eq(schema.tournamentStaff.tournamentId, tournamentId),
          eq(schema.tournamentStaff.userId, userId),
          eq(schema.tournamentStaff.role, 'CO_ORGANIZER'),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async findStaffByTournament(tournamentId: string, role?: string) {
    const conditions: SQL[] = [eq(schema.tournamentStaff.tournamentId, tournamentId)];
    if (role) conditions.push(eq(schema.tournamentStaff.role, role));
    const rows = await this.db
      .select({
        userId: schema.tournamentStaff.userId,
        role: schema.tournamentStaff.role,
        fullName: schema.profiles.fullName,
        email: schema.users.email,
        avatarUrl: schema.profiles.avatarUrl,
      })
      .from(schema.tournamentStaff)
      .innerJoin(schema.users, eq(schema.tournamentStaff.userId, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(and(...conditions));
    // Người được mời chưa có hồ sơ (profiles) vẫn phải xuất hiện trong danh sách
    // — dùng leftJoin + fallback để không bị lọc mất khi chưa tạo hồ sơ.
    return rows.map((row) => ({
      ...row,
      fullName: row.fullName || row.email,
      avatarUrl: row.avatarUrl || null,
    }));
  }

  async findParticipantsForSeeding(tournamentId: string, divisionId?: string) {
    const participants = await this.db
      .select()
      .from(schema.tournamentParticipants)
      .where(
        and(
          eq(schema.tournamentParticipants.tournamentId, tournamentId),
          divisionId
            ? eq(schema.tournamentParticipants.tournamentDivisionId, divisionId)
            : undefined,
          or(
            eq(schema.tournamentParticipants.isMock, true),
            and(
              eq(schema.tournamentParticipants.teamStatus, 'COMPLETE'),
              eq(schema.tournamentParticipants.isPaid, true),
            ),
          ),
        ),
      );

    const participantIds = participants.map((p) => p.id);
    const rosters = await this.db
      .select()
      .from(schema.tournamentRosters)
      .where(inArray(schema.tournamentRosters.participantId, participantIds));

    const rosterMap = new Map<string, typeof rosters>();
    for (const r of rosters) {
      const list = rosterMap.get(r.participantId) || [];
      list.push(r);
      rosterMap.set(r.participantId, list);
    }

    return participants.map((p) => ({
      ...p,
      members: rosterMap.get(p.id) || [],
    }));
  }

  async updateSeeds(tournamentId: string, seeds: { participantId: string; seed: number }[]) {
    return await this.db.transaction(async (tx) => {
      for (const item of seeds) {
        await tx
          .update(schema.tournamentParticipants)
          .set({ seed: item.seed })
          .where(
            and(
              eq(schema.tournamentParticipants.id, item.participantId),
              eq(schema.tournamentParticipants.tournamentId, tournamentId)
            )
          );
      }
      return { success: true };
    });
  }

  // Division-related methods
  async getDivisionsByTournament(tournamentId: string) {
    try {
      return await this.db
        .select()
        .from(schema.tournamentDivisions)
        .where(eq(schema.tournamentDivisions.tournamentId, tournamentId))
        .orderBy(schema.tournamentDivisions.createdAt);
    } catch (error) {
      console.error(`Failed to get divisions for tournament ${tournamentId}:`, error);
      throw error;
    }
  }

  async findDivisionById(id: string) {
    try {
      const [division] = await this.db
        .select()
        .from(schema.tournamentDivisions)
        .where(eq(schema.tournamentDivisions.id, id))
        .limit(1);

      return division ?? null;
    } catch (error) {
      console.error(`Failed to get division ${id}:`, error);
      throw error;
    }
  }

  async createDivision(division: CreateDivisionDto & { tournamentId: string }, userId: string | null) {
    try {
      return await this.db.transaction(async (tx) => {
        try {
          const [created] = await tx
            .insert(schema.tournamentDivisions)
            .values({
              tournamentId: division.tournamentId,
              name: division.name,
              matchType: division.matchType,
              genderRestriction: division.genderRestriction || null,
              maxParticipants: division.maxParticipants || null,
              entryFee: (division.entryFee ?? 0).toString(),
              isConfigOverride: division.isConfigOverride ?? false,
              venueId: division.venueId ?? null,
              bracketType: division.bracketType ?? null,
              roundConfig: division.roundConfig ?? null,
              startDate: division.startDate ? new Date(division.startDate) : null,
              registrationEndDate: division.registrationEndDate
                ? new Date(division.registrationEndDate)
                : null,
              minElo: division.minElo ?? null,
              maxElo: division.maxElo ?? null,
              prizeDescription: division.prizeDescription ?? null,
              status: 'DRAFT',
            })
            .returning();

          await this.auditService.logCreate(
            tx,
            userId,
            'tournament_divisions',
            created.id,
            created
          );

          return created;
        } catch (txError) {
          console.error('🔴 Transaction error details:', txError);
          throw txError;
        }
      });
    } catch (error) {
      console.error('Failed to create division:', error);
      throw error;
    }
  }

  async updateDivision(id: string, dto: UpdateDivisionDto, userId: string | null) {
    try {
      return await this.db.transaction(async (tx) => {
        const [oldRecord] = await tx
          .select()
          .from(schema.tournamentDivisions)
          .where(eq(schema.tournamentDivisions.id, id))
          .limit(1);

        if (!oldRecord) {
          throw new NotFoundException('Không tìm thấy nội dung thi đấu');
        }

        const mergedRoundConfig = dto.roundConfig === undefined
          ? undefined
          : this.mergeRoundConfig(oldRecord.roundConfig, dto.roundConfig);

        const [updated] = await tx
          .update(schema.tournamentDivisions)
          .set({
            ...(dto.name && { name: dto.name }),
            ...(dto.matchType && { matchType: dto.matchType }),
            ...(dto.genderRestriction !== undefined && {
              genderRestriction: dto.genderRestriction,
            }),
            ...(dto.maxParticipants !== undefined && {
              maxParticipants: dto.maxParticipants,
            }),
            ...(dto.entryFee !== undefined && {
              entryFee: dto.entryFee.toString(),
            }),
            ...(dto.status && { status: dto.status }),
            ...(dto.isConfigOverride !== undefined && {
              isConfigOverride: dto.isConfigOverride,
            }),
            ...(dto.venueId !== undefined && { venueId: dto.venueId }),
            ...(dto.bracketType !== undefined && { bracketType: dto.bracketType }),
            ...(mergedRoundConfig !== undefined && { roundConfig: mergedRoundConfig }),
            ...(dto.startDate !== undefined && {
              startDate: dto.startDate ? new Date(dto.startDate) : null,
            }),
            ...(dto.registrationEndDate !== undefined && {
              registrationEndDate: dto.registrationEndDate
                ? new Date(dto.registrationEndDate)
                : null,
            }),
            ...(dto.minElo !== undefined && { minElo: dto.minElo }),
            ...(dto.maxElo !== undefined && { maxElo: dto.maxElo }),
            ...(dto.prizeDescription !== undefined && {
              prizeDescription: dto.prizeDescription,
            }),
          })
          .where(eq(schema.tournamentDivisions.id, id))
          .returning();

        await this.auditService.logUpdate(
          tx,
          userId,
          'tournament_divisions',
          id,
          oldRecord,
          updated
        );

        return updated;
      });
    } catch (error) {
      console.error(`Failed to update division ${id}:`, error);
      throw error;
    }
  }

  async deleteDivision(id: string, userId: string | null) {
    try {
      return await this.db.transaction(async (tx) => {
        const [oldRecord] = await tx
          .select()
          .from(schema.tournamentDivisions)
          .where(eq(schema.tournamentDivisions.id, id))
          .limit(1);

        if (!oldRecord) {
          throw new NotFoundException('Không tìm thấy nội dung thi đấu');
        }

        const [{ value: remainingDivisions }] = await tx
          .select({ value: count() })
          .from(schema.tournamentDivisions)
          .where(eq(schema.tournamentDivisions.tournamentId, oldRecord.tournamentId));

        if (remainingDivisions <= 1) {
          throw new BadRequestException('Phải có ít nhất 1 hình thức thi đấu. Hãy xóa cả giải đấu nếu không cần.');
        }

        const [{ value: activeParticipants }] = await tx
          .select({ value: count() })
          .from(schema.tournamentParticipants)
          .where(
            and(
              eq(schema.tournamentParticipants.tournamentDivisionId, id),
              eq(schema.tournamentParticipants.isMock, false),
              ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
              ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
            ),
          );

        if (activeParticipants > 0) {
          throw new BadRequestException('Không thể xóa hình thức đang có người chơi thật. Hãy di chuyển hoặc loại bỏ người chơi thật trước.');
        }

        const mockParticipants = await tx
          .select({ id: schema.tournamentParticipants.id })
          .from(schema.tournamentParticipants)
          .where(
            and(
              eq(schema.tournamentParticipants.tournamentDivisionId, id),
              eq(schema.tournamentParticipants.isMock, true),
            ),
          );
        const mockParticipantIds = mockParticipants.map((participant) => participant.id);
        const mockRosterUsers = mockParticipantIds.length > 0
          ? await tx
              .select({ userId: schema.tournamentRosters.userId })
              .from(schema.tournamentRosters)
              .where(inArray(schema.tournamentRosters.participantId, mockParticipantIds))
          : [];

        // Hard delete since tournament_divisions doesn't have a deletedAt column
        // and cascade is handled by FK constraint
        await tx
          .delete(schema.tournamentDivisions)
          .where(eq(schema.tournamentDivisions.id, id));

        const mockUserIds = Array.from(new Set(mockRosterUsers.map((roster) => roster.userId)));
        if (mockUserIds.length > 0) {
          const remainingRosterUsers = await tx
            .select({ userId: schema.tournamentRosters.userId })
            .from(schema.tournamentRosters)
            .where(inArray(schema.tournamentRosters.userId, mockUserIds));
          const remainingRegistrants = await tx
            .select({ userId: schema.tournamentParticipants.registeredBy })
            .from(schema.tournamentParticipants)
            .where(inArray(schema.tournamentParticipants.registeredBy, mockUserIds));
          const referencedUserIds = new Set([
            ...remainingRosterUsers.map((row) => row.userId),
            ...remainingRegistrants.map((row) => row.userId),
          ]);
          const orphanMockUserIds = mockUserIds.filter((mockUserId) => !referencedUserIds.has(mockUserId));

          if (orphanMockUserIds.length > 0) {
            await tx
              .delete(schema.profiles)
              .where(inArray(schema.profiles.userId, orphanMockUserIds));
            await tx
              .delete(schema.users)
              .where(
                and(
                  inArray(schema.users.id, orphanMockUserIds),
                  eq(schema.users.isMock, true),
                ),
              );
          }
        }

        await this.auditService.logDelete(
          tx,
          userId,
          'tournament_divisions',
          id,
          oldRecord
        );

        return { success: true, removedMockParticipants: mockParticipantIds.length };
      });
    } catch (error) {
      console.error(`Failed to delete division ${id}:`, error);
      throw error;
    }
  }

  async updateDivisionConfig(id: string, dto: UpdateDivisionDto, userId: string | null) {
    return this.updateDivision(id, { ...dto, isConfigOverride: dto.isConfigOverride ?? true }, userId);
  }

  async getParticipantsByDivision(divisionId: string) {
    try {
      return await this.db
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
        .where(
          and(
            eq(schema.tournamentParticipants.tournamentDivisionId, divisionId),
            ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN')
          )
        );
    } catch (error) {
      console.error(`Failed to get participants for division ${divisionId}:`, error);
      throw error;
    }
  }

  async findUserByEmail(email: string) {
    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    return user;
  }

  async findUserBasicById(userId: string) {
    const [user] = await this.db
      .select({
        id: schema.users.id,
        fullName: schema.profiles.fullName,
        email: schema.users.email,
      })
      .from(schema.users)
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(eq(schema.users.id, userId))
      .limit(1);
    return user || null;
  }

  async addReferee(tournamentId: string, userId: string, assignedBy: string) {
    const [existing] = await this.db
      .select()
      .from(schema.tournamentReferees)
      .where(
        and(
          eq(schema.tournamentReferees.tournamentId, tournamentId),
          eq(schema.tournamentReferees.userId, userId),
        ),
      )
      .limit(1);

    if (existing) {
      if (existing.status !== 'INVITED') {
        await this.db
          .update(schema.tournamentReferees)
          .set({ status: 'INVITED', assignedBy, assignedAt: new Date() })
          .where(eq(schema.tournamentReferees.id, existing.id));
        return {
          ...existing,
          status: 'INVITED',
          assignedBy,
          assignedAt: new Date(),
        };
      }
      return existing;
    }

    const [referee] = await this.db
      .insert(schema.tournamentReferees)
      .values({
        tournamentId,
        userId,
        assignedBy,
        status: 'INVITED',
      })
      .returning();
    return referee;
  }

  async findRefereeById(refereeId: string) {
    const [ref] = await this.db
      .select()
      .from(schema.tournamentReferees)
      .where(eq(schema.tournamentReferees.id, refereeId))
      .limit(1);
    return ref || null;
  }

  async findRefereeByTournamentAndUser(tournamentId: string, userId: string) {
    const [referee] = await this.db
      .select()
      .from(schema.tournamentReferees)
      .where(
        and(
          eq(schema.tournamentReferees.tournamentId, tournamentId),
          eq(schema.tournamentReferees.userId, userId),
        ),
      )
      .limit(1);
    return referee || null;
  }

  async updateRefereeStatus(refereeId: string, status: 'ACCEPTED' | 'DECLINED') {
    const [updated] = await this.db
      .update(schema.tournamentReferees)
      .set({ status, assignedAt: new Date() })
      .where(eq(schema.tournamentReferees.id, refereeId))
      .returning();
    return updated;
  }

  async removeRefereeInvite(refereeId: string) {
    const [removed] = await this.db
      .delete(schema.tournamentReferees)
      .where(eq(schema.tournamentReferees.id, refereeId))
      .returning();
    return removed || null;
  }

  // ──────── Finalize stage ────────

  async cancelScheduledMatchesInStage(stageId: string) {
    const result = await this.db
      .update(schema.matches)
      .set({ status: 'CANCELLED', updatedAt: new Date() })
      .where(
        and(
          eq(schema.matches.stageId, stageId),
          ne(schema.matches.status, 'COMPLETED'),
        ),
      );
    return result;
  }

  // ──────── Playoff methods ────────

  async getGroupByStageId(stageId: string) {
    const [group] = await this.db
      .select()
      .from(schema.tournamentGroups)
      .where(eq(schema.tournamentGroups.stageId, stageId))
      .limit(1);
    return group || null;
  }

  async createPlayoffMatch(data: {
    tournamentId: string;
    stageId: string;
    groupId: string;
    participant1Id: string;
    participant2Id: string;
    roundNumber: number;
    matchOrder: number;
  }) {
    const { randomUUID } = await import('crypto');
    const [match] = await this.db
      .insert(schema.matches)
      .values({
        id: randomUUID(),
        tournamentId: data.tournamentId,
        stageId: data.stageId,
        groupId: data.groupId,
        participant1Id: data.participant1Id,
        participant2Id: data.participant2Id,
        roundNumber: data.roundNumber,
        matchOrder: data.matchOrder,
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
      })
      .returning();
    return match;
  }

  async getMaxRoundAndMatchOrder(stageId: string) {
    const result = await this.db
      .select({
        maxRound: sql<number>`COALESCE(MAX(${schema.matches.roundNumber}), 0)`,
        maxOrder: sql<number>`COALESCE(MAX(${schema.matches.matchOrder}), 0)`,
      })
      .from(schema.matches)
      .where(eq(schema.matches.stageId, stageId));
    return result[0] || { maxRound: 0, maxOrder: 0 };
  }

  // ─── Tournament Follow ──────────────────────────────────────

  async followTournament(tournamentId: string, userId: string) {
    const [existing] = await this.db
      .select()
      .from(schema.tournamentFollows)
      .where(and(
        eq(schema.tournamentFollows.tournamentId, tournamentId),
        eq(schema.tournamentFollows.userId, userId),
      ))
      .limit(1);

    if (existing) return existing;

    const [follow] = await this.db
      .insert(schema.tournamentFollows)
      .values({ tournamentId, userId })
      .returning();
    return follow;
  }

  async unfollowTournament(tournamentId: string, userId: string) {
    await this.db
      .delete(schema.tournamentFollows)
      .where(and(
        eq(schema.tournamentFollows.tournamentId, tournamentId),
        eq(schema.tournamentFollows.userId, userId),
      ));
  }

  async getFollowedTournamentIds(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ tournamentId: schema.tournamentFollows.tournamentId })
      .from(schema.tournamentFollows)
      .where(eq(schema.tournamentFollows.userId, userId));
    return rows.map(r => r.tournamentId);
  }

  async getFollowerUserIds(tournamentId: string): Promise<string[]> {
    const rows = await this.db
      .select({ userId: schema.tournamentFollows.userId })
      .from(schema.tournamentFollows)
      .where(eq(schema.tournamentFollows.tournamentId, tournamentId));
    return rows.map(r => r.userId);
  }

  async getFollowedTournaments(userId: string) {
    return this.db
      .select()
      .from(schema.tournamentFollows)
      .innerJoin(
        schema.tournaments,
        eq(schema.tournamentFollows.tournamentId, schema.tournaments.id),
      )
      .where(eq(schema.tournamentFollows.userId, userId));
  }

  // ──────── Lite pairing helpers ────────

  async countLiteActiveRosterUsers(tournamentId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`count(distinct ${schema.tournamentRosters.userId})` })
      .from(schema.tournamentRosters)
      .innerJoin(
        schema.tournamentParticipants,
        eq(schema.tournamentRosters.participantId, schema.tournamentParticipants.id),
      )
      .where(
        and(
          eq(schema.tournamentParticipants.tournamentId, tournamentId),
          ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
          ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
          ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
        ),
      );
    return Number(result?.count ?? 0);
  }

  async findLiteParticipantsWithRosters(tournamentId: string) {
    const participants = await this.db
      .select()
      .from(schema.tournamentParticipants)
      .where(
        and(
          eq(schema.tournamentParticipants.tournamentId, tournamentId),
          ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
          ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
          ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
        ),
      )
      .orderBy(schema.tournamentParticipants.registeredAt);

    const pIds = participants.map((p) => p.id);
    const rosters = pIds.length > 0
      ? await this.db
          .select()
          .from(schema.tournamentRosters)
          .where(inArray(schema.tournamentRosters.participantId, pIds))
      : [];

    const rosterMap = new Map<string, typeof rosters>();
    for (const r of rosters) {
      const list = rosterMap.get(r.participantId) || [];
      list.push(r);
      rosterMap.set(r.participantId, list);
    }

    // Fetch user profiles for roster members
    const userIds = [...new Set(rosters.map((r) => r.userId))];
    const profiles = userIds.length > 0
      ? await this.db
          .select({
            userId: schema.profiles.userId,
            fullName: schema.profiles.fullName,
            avatarUrl: schema.profiles.avatarUrl,
          })
          .from(schema.profiles)
          .where(inArray(schema.profiles.userId, userIds))
      : [];
    const profileMap = new Map(profiles.map((p) => [p.userId, p]));

    return participants.map((p) => ({
      ...p,
      rosters: (rosterMap.get(p.id) || []).map((r) => ({
        ...r,
        profile: profileMap.get(r.userId) || null,
      })),
    }));
  }

  async findLitePendingPartnerParticipants(tournamentId: string) {
    const allParticipants = await this.findLiteParticipantsWithRosters(tournamentId);
    return allParticipants.filter(
      (p) =>
        p.teamStatus === 'PENDING_PARTNER' &&
        (p.rosters?.length ?? 0) === 1,
    );
  }

  async hasNonDeletedStagesOrMatches(tournamentId: string): Promise<boolean> {
    const [stageCount] = await this.db
      .select({ count: count() })
      .from(schema.tournamentStages)
      .where(
        and(
          eq(schema.tournamentStages.tournamentId, tournamentId),
          isNull(schema.tournamentStages.deletedAt),
        ),
      );
    if (stageCount.count > 0) return true;

    const [matchCount] = await this.db
      .select({ count: count() })
      .from(schema.matches)
      .where(
        and(
          eq(schema.matches.tournamentId, tournamentId),
          isNull(schema.matches.deletedAt),
        ),
      );
    return matchCount.count > 0;
  }

  async pairLiteParticipantsInTx(
    tx: Transaction,
    tournamentId: string,
    p1Id: string,
    p2Id: string,
    userId: string,
    registrationMode: string,
    teamName: string,
  ) {
    // Lock participants in sorted order to prevent deadlocks
    const sortedIds = [p1Id, p2Id].sort();
    const lockedRows: Record<string, typeof schema.tournamentParticipants.$inferSelect> = {};

    for (const id of sortedIds) {
      const [p] = await tx
        .select()
        .from(schema.tournamentParticipants)
        .where(eq(schema.tournamentParticipants.id, id))
        .limit(1)
        .for('update');
      if (!p || p.tournamentId !== tournamentId) {
        throw new BadRequestException(`Participant ${id} không hợp lệ`);
      }
      lockedRows[id] = p;
    }

    const p1 = lockedRows[p1Id];
    const p2 = lockedRows[p2Id];

    if (p1Id === p2Id) {
      throw new BadRequestException('Không thể ghép cặp với chính mình');
    }

    // Idempotency: if p1 is already COMPLETE/PENDING_APPROVAL, p2 is WITHDRAWN,
    // and p2.registeredBy user is now rostered under p1 with exactly 2 rosters, return p1
    if (
      (p1.teamStatus === 'COMPLETE' || p1.teamStatus === 'PENDING_APPROVAL') &&
      p2.teamStatus === 'WITHDRAWN'
    ) {
      const p1RostersCheck = await tx
        .select()
        .from(schema.tournamentRosters)
        .where(eq(schema.tournamentRosters.participantId, p1Id));
      if (p1RostersCheck.length === 2) {
        // Verify p2's registeredBy user is one of p1's rosters
        const p2UserInP1 = p1RostersCheck.some((r) => r.userId === p2.registeredBy);
        if (p2UserInP1) {
          return p1;
        }
      }
    }

    // Reject non-PENDING_PARTNER states (idempotency check already handled COMPLETE/PENDING_APPROVAL)
    if (p1.teamStatus !== 'PENDING_PARTNER') {
      throw new BadRequestException(`Participant 1 đang ở trạng thái ${p1.teamStatus}, không thể ghép cặp`);
    }
    if (p2.teamStatus !== 'PENDING_PARTNER') {
      throw new BadRequestException(`Participant 2 đang ở trạng thái ${p2.teamStatus}, không thể ghép cặp`);
    }

    // Check each has exactly 1 roster
    const p1Rosters = await tx
      .select()
      .from(schema.tournamentRosters)
      .where(eq(schema.tournamentRosters.participantId, p1Id));
    const p2Rosters = await tx
      .select()
      .from(schema.tournamentRosters)
      .where(eq(schema.tournamentRosters.participantId, p2Id));

    if (p1Rosters.length !== 1) {
      throw new BadRequestException('Participant 1 phải có đúng 1 thành viên');
    }
    if (p2Rosters.length !== 1) {
      throw new BadRequestException('Participant 2 phải có đúng 1 thành viên');
    }

    // Verify neither roster user already appears in another active participant
    const p2UserId = p2Rosters[0].userId;
    const allRostersCheck = await tx
      .select({ userId: schema.tournamentRosters.userId })
      .from(schema.tournamentRosters)
      .innerJoin(
        schema.tournamentParticipants,
        eq(schema.tournamentRosters.participantId, schema.tournamentParticipants.id),
      )
      .where(
        and(
          eq(schema.tournamentParticipants.tournamentId, tournamentId),
          ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
          ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
          ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
          eq(schema.tournamentRosters.userId, p2UserId),
          ne(schema.tournamentRosters.participantId, p2Id),
        ),
      );
    if (allRostersCheck.length > 0) {
      throw new BadRequestException('Thành viên của Participant 2 đã tham gia đội khác trong giải này');
    }

    // Move p2 roster to p1
    const p2Roster = p2Rosters[0];
    await tx
      .update(schema.tournamentRosters)
      .set({ participantId: p1Id })
      .where(eq(schema.tournamentRosters.id, p2Roster.id));

    // Update p1
    const targetStatus = registrationMode === 'APPROVAL' ? 'PENDING_APPROVAL' : 'COMPLETE';
    const [updatedP1] = await tx
      .update(schema.tournamentParticipants)
      .set({
        teamStatus: targetStatus,
        isPaid: true,
        teamInviteToken: null,
        teamName,
      })
      .where(eq(schema.tournamentParticipants.id, p1Id))
      .returning();

    // Mark p2 WITHDRAWN, clear token
    const [updatedP2] = await tx
      .update(schema.tournamentParticipants)
      .set({
        teamStatus: 'WITHDRAWN',
        teamInviteToken: null,
      })
      .where(eq(schema.tournamentParticipants.id, p2Id))
      .returning();

    // Audit
    await this.auditService.logUpdate(tx, userId, 'tournament_participants', p1Id, p1, updatedP1);
    await this.auditService.logUpdate(tx, userId, 'tournament_participants', p2Id, p2, updatedP2);

    return updatedP1;
  }

  async unpairParticipantInTx(
    tx: Transaction,
    tournamentId: string,
    participantId: string,
    userId: string,
  ) {
    // Lock participant
    const [participant] = await tx
      .select()
      .from(schema.tournamentParticipants)
      .where(eq(schema.tournamentParticipants.id, participantId))
      .limit(1)
      .for('update');

    if (!participant || participant.tournamentId !== tournamentId) {
      throw new BadRequestException('Participant không hợp lệ');
    }

    if (participant.teamStatus !== 'COMPLETE' && participant.teamStatus !== 'PENDING_APPROVAL') {
      throw new BadRequestException(`Không thể tách cặp participant ở trạng thái ${participant.teamStatus}`);
    }

    // Must have exactly 2 rosters
    const rosters = await tx
      .select()
      .from(schema.tournamentRosters)
      .where(eq(schema.tournamentRosters.participantId, participantId));

    if (rosters.length !== 2) {
      throw new BadRequestException('Participant phải có đúng 2 thành viên để tách cặp');
    }

    // Deterministic leader: roster whose userId == participant.registeredBy
    const leaderRoster = rosters.find((r) => r.userId === participant.registeredBy);
    const partnerRoster = rosters.find((r) => r.userId !== participant.registeredBy);

    if (!leaderRoster || !partnerRoster) {
      throw new BadRequestException('Không thể xác định đội trưởng — lỗi dữ liệu.');
    }

    // Create invite tokens
    const leaderToken = crypto.randomUUID().replace(/-/g, '').substring(0, 12).toUpperCase();
    const partnerToken = crypto.randomUUID().replace(/-/g, '').substring(0, 12).toUpperCase();

    // Get profile names
    const [leaderProfile] = await tx
      .select({ fullName: schema.profiles.fullName })
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, leaderRoster.userId))
      .limit(1);
    const [partnerProfile] = await tx
      .select({ fullName: schema.profiles.fullName })
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, partnerRoster.userId))
      .limit(1);

    // Create new participant for partner
    const [newParticipant] = await tx
      .insert(schema.tournamentParticipants)
      .values({
        tournamentId,
        tournamentDivisionId: participant.tournamentDivisionId,
        registeredBy: partnerRoster.userId,
        teamName: partnerProfile?.fullName || 'Vận động viên',
        isPaid: true,
        teamInviteToken: partnerToken,
        teamStatus: 'PENDING_PARTNER',
      })
      .returning();

    // Move partner roster to new participant
    await tx
      .update(schema.tournamentRosters)
      .set({ participantId: newParticipant.id })
      .where(eq(schema.tournamentRosters.id, partnerRoster.id));

    // Update original participant back to PENDING_PARTNER
    const [updatedOriginal] = await tx
      .update(schema.tournamentParticipants)
      .set({
        teamStatus: 'PENDING_PARTNER',
        isPaid: true,
        teamInviteToken: leaderToken,
        teamName: leaderProfile?.fullName || 'Vận động viên',
      })
      .where(eq(schema.tournamentParticipants.id, participantId))
      .returning();

    // Audit
    await this.auditService.logCreate(tx, userId, 'tournament_participants', newParticipant.id, newParticipant);
    await this.auditService.logUpdate(tx, userId, 'tournament_participants', participantId, participant, updatedOriginal);

    return { leader: updatedOriginal, partner: newParticipant };
  }

  /**
   * Check inside the transaction that the tournament is LITE DOUBLES and has no active bracket.
   * Call after locking the tournament row (FOR UPDATE).
   */
  private async assertLitePairableInTx(
    tx: Transaction,
    tournamentId: string,
  ): Promise<typeof schema.tournaments.$inferSelect> {
    const [tournament] = await tx
      .select()
      .from(schema.tournaments)
      .where(eq(schema.tournaments.id, tournamentId))
      .limit(1)
      .for('update');

    if (!tournament) throw new BadRequestException('Giải đấu không tồn tại');

    const tCfg = (tournament.tournamentConfig || {}) as Record<string, unknown>;
    if (tCfg.mode !== 'LITE') {
      throw new BadRequestException('Thao tác này chỉ hỗ trợ giải đấu Lite.');
    }
    if (tournament.matchType !== 'DOUBLES' && tournament.matchType !== 'MIXED_DOUBLES') {
      throw new BadRequestException('Ghép cặp chỉ hỗ trợ giải đấu đánh đôi.');
    }

    // Check active stages/matches via tx (fixes TOCTOU)
    const [stageCount] = await tx
      .select({ count: count() })
      .from(schema.tournamentStages)
      .where(
        and(
          eq(schema.tournamentStages.tournamentId, tournamentId),
          isNull(schema.tournamentStages.deletedAt),
        ),
      );
    if (stageCount.count > 0) {
      throw new BadRequestException('Không thể ghép cặp sau khi đã sinh nhánh đấu.');
    }
    const [matchCount] = await tx
      .select({ count: count() })
      .from(schema.matches)
      .where(
        and(
          eq(schema.matches.tournamentId, tournamentId),
          isNull(schema.matches.deletedAt),
        ),
      );
    if (matchCount.count > 0) {
      throw new BadRequestException('Không thể ghép cặp sau khi đã sinh trận đấu.');
    }

    return tournament;
  }

  async lockTournamentAndPair(
    tournamentId: string,
    p1Id: string,
    p2Id: string,
    userId: string,
    registrationMode: string,
    teamName: string,
  ) {
    return await this.db.transaction(async (tx) => {
      // Lock tournament and validate LITE/DOUBLES/bracket-gate in one tx
      await this.assertLitePairableInTx(tx, tournamentId);
      return this.pairLiteParticipantsInTx(tx, tournamentId, p1Id, p2Id, userId, registrationMode, teamName);
    });
  }

  async lockTournamentAndUnpair(tournamentId: string, participantId: string, userId: string) {
    return await this.db.transaction(async (tx) => {
      await this.assertLitePairableInTx(tx, tournamentId);
      return this.unpairParticipantInTx(tx, tournamentId, participantId, userId);
    });
  }

  async generateLitePairsTx(
    tournamentId: string,
    userId: string,
    strategy: 'RANDOM' | 'ELO_BALANCED',
  ) {
    return await this.db.transaction(async (tx) => {
      // Lock tournament and validate
      const tournament = await this.assertLitePairableInTx(tx, tournamentId);
      const registrationMode = ((tournament.tournamentConfig || {}) as Record<string, unknown>).registrationMode as string || 'OPEN';

      // Query pending participants INSIDE the transaction with FOR UPDATE (fixes TOCTOU + no lock outside tx)
      const pendingParticipants = await tx
        .select()
        .from(schema.tournamentParticipants)
        .where(
          and(
            eq(schema.tournamentParticipants.tournamentId, tournamentId),
            eq(schema.tournamentParticipants.teamStatus, 'PENDING_PARTNER'),
          ),
        )
        .for('update')
        .orderBy(schema.tournamentParticipants.id); // deterministic order

      // Filter to those with exactly 1 roster; fetch rosters via tx
      const pIds = pendingParticipants.map((p) => p.id);
      const allRosters = pIds.length > 0
        ? await tx
            .select()
            .from(schema.tournamentRosters)
            .where(inArray(schema.tournamentRosters.participantId, pIds))
        : [];

      const rosterMap = new Map<string, typeof allRosters>();
      for (const r of allRosters) {
        const list = rosterMap.get(r.participantId) || [];
        list.push(r);
        rosterMap.set(r.participantId, list);
      }

      // Fetch profiles for roster users via tx
      const userIds = [...new Set(allRosters.map((r) => r.userId))];
      const profiles = userIds.length > 0
        ? await tx
            .select({
              userId: schema.profiles.userId,
              fullName: schema.profiles.fullName,
            })
            .from(schema.profiles)
            .where(inArray(schema.profiles.userId, userIds))
        : [];
      const profileMap = new Map(profiles.map((p) => [p.userId, p]));

      const pending = pendingParticipants
        .filter((p) => (rosterMap.get(p.id)?.length ?? 0) === 1)
        .map((p) => ({
          ...p,
          rosters: (rosterMap.get(p.id) || []).map((r) => ({
            ...r,
            profile: profileMap.get(r.userId) || null,
          })),
        }));

      if (pending.length < 2) {
        throw new BadRequestException('Cần ít nhất 2 người chơi đang chờ ghép cặp.');
      }

      let ordered = [...pending];

      if (strategy === 'RANDOM') {
        for (let i = ordered.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
        }
      } else {
        // ELO_BALANCED
        const eloEntries = await Promise.all(
          ordered.map(async (p) => {
            const rosterUser = p.rosters?.[0];
            const elo = rosterUser?.userId
              ? await this.getUserEloInTx(tx, rosterUser.userId, tournament.categoryId, tournament.matchType)
              : 1000;
            return { participant: p, elo };
          }),
        );

        eloEntries.sort((a: any, b: any) => b.elo - a.elo);
        ordered = eloEntries.map((e: any) => e.participant);

        const reordered: any[] = [];
        let left = 0;
        let right = ordered.length - 1;
        while (left <= right) {
          if (left !== right) {
            reordered.push(ordered[left]);
            reordered.push(ordered[right]);
          } else {
            reordered.push(ordered[left]);
          }
          left++;
          right--;
        }
        ordered = reordered;
      }

      const paired: Array<{ participant1Id: string; participant2Id: string; teamName: string }> = [];
      const unpairedIds: string[] = [];

      for (let i = 0; i < ordered.length; i += 2) {
        if (i + 1 >= ordered.length) {
          unpairedIds.push(ordered[i].id);
          break;
        }

        const p1 = ordered[i];
        const p2 = ordered[i + 1];

        const p1User = p1.rosters?.[0]?.userId;
        const p2User = p2.rosters?.[0]?.userId;
        const p1Profile = p1User ? profileMap.get(p1User) : null;
        const p2Profile = p2User ? profileMap.get(p2User) : null;
        const p1Name = p1Profile?.fullName || 'VĐV';
        const p2Name = p2Profile?.fullName || 'VĐV';
        const teamName = `${p1Name} / ${p2Name}`;

        await this.pairLiteParticipantsInTx(tx, tournamentId, p1.id, p2.id, userId, registrationMode, teamName);
        paired.push({ participant1Id: p1.id, participant2Id: p2.id, teamName });
      }

      return {
        message: `Đã ghép ${paired.length} cặp thành công.`,
        paired,
        unpairedParticipantIds: unpairedIds,
        strategy,
      };
    });
  }

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

    const stageIds = stages.map(s => s.id);

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

    const groupIds = groups.map(g => g.id);

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

    // Lấy participant info kèm seed
    const participantIds = [...new Set(standings.map(s => s.participantId))];
    const participants = participantIds.length > 0
      ? await this.db
          .select({
            id: schema.tournamentParticipants.id,
            teamName: schema.tournamentParticipants.teamName,
            seed: schema.tournamentParticipants.seed,
          })
          .from(schema.tournamentParticipants)
          .where(inArray(schema.tournamentParticipants.id, participantIds))
      : [];

    const participantMap = new Map(participants.map(p => [p.id, { teamName: p.teamName, seed: p.seed }]));

    return {
      stages: stages.map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        order: s.order,
      })),
      groups: groups.map(g => ({
        id: g.id,
        name: g.name,
        stageId: g.stageId,
      })),
      standings: standings.map(s => ({
        id: s.id,
        groupId: s.groupId,
        participantId: s.participantId,
        teamName: participantMap.get(s.participantId)?.teamName || 'Unknown',
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
    if (divisionId) conditions.push(eq(schema.tournamentStages.tournamentDivisionId, divisionId));

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
      .innerJoin(schema.tournamentStages, eq(schema.matches.stageId, schema.tournamentStages.id))
      .leftJoin(sql`"tournament_participants" p1`, sql`p1.id = ${schema.matches.participant1Id}`)
      .leftJoin(sql`"tournament_participants" p2`, sql`p2.id = ${schema.matches.participant2Id}`)
      .where(and(...conditions))
      .orderBy(schema.matches.roundNumber, schema.matches.matchOrder);
  }
}
