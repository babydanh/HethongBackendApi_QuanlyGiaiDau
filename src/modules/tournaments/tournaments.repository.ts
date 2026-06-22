import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb, AppDbOrTx } from '../../database/db.types';
import * as schema from '../../database/schema';
import { eq, ne, ilike, and, or, count, SQL, inArray, sql, lt } from 'drizzle-orm';
import { AuditService, Transaction } from '../audit/audit.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { QueryTournamentDto } from './dto/query-tournament.dto';
import { RegisterTournamentDto } from './dto/register-tournament.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { CreateParentTournamentDto } from './dto/create-parent-tournament.dto';
import { UpdateParentTournamentDto } from './dto/update-parent-tournament.dto';
import { CreateDivisionDto } from './dto/create-division.dto';
import { UpdateDivisionDto } from './dto/update-division.dto';
import { RosterMember, BracketMatch, BracketGroup, BracketStage } from './interfaces/tournament-config.interface';
import { SeriesService } from '../series/series.service';
import { ExclusionRuleException } from '../series/exceptions/exclusion-rule.exception';

@Injectable()
export class TournamentsRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
    private readonly auditService: AuditService,
    private readonly seriesService: SeriesService,
  ) {}

  async findAll(query: QueryTournamentDto) {
    const { page = 1, limit = 10, search, categoryId, status, tournamentType, matchType, communityId, visibility, region, createdBy } = query;
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [];

    // Always exclude soft-deleted tournaments
    conditions.push(sql`${schema.tournaments.deletedAt} IS NULL`);

    // Exclude DRAFT, PENDING_APPROVAL, SUSPENDED, and CANCELLED tournaments from public listing (unless createdBy is specified)
    if (!createdBy) {
      conditions.push(ne(schema.tournaments.status, 'DRAFT'));
      conditions.push(ne(schema.tournaments.status, 'PENDING_APPROVAL'));
      conditions.push(ne(schema.tournaments.status, 'SUSPENDED'));
      conditions.push(ne(schema.tournaments.status, 'CANCELLED'));
    }

    if (search) {
      conditions.push(ilike(schema.tournaments.name, `%${search}%`));
    }
    if (categoryId) {
      conditions.push(eq(schema.tournaments.categoryId, categoryId));
    }
    if (status) {
      conditions.push(eq(schema.tournaments.status, status));
    }
    if (communityId) {
      conditions.push(eq(schema.tournaments.communityId, communityId));
      const type = tournamentType || 'CLUB';
      conditions.push(eq(schema.tournaments.tournamentType, type));
    } else {
      const type = tournamentType || 'PUBLIC';
      conditions.push(eq(schema.tournaments.tournamentType, type));
    }
    if (matchType) {
      conditions.push(eq(schema.tournaments.matchType, matchType));
    }

    if (createdBy) {
      conditions.push(eq(schema.tournaments.createdBy, createdBy));
      if (visibility) {
        conditions.push(eq(schema.tournaments.visibility, visibility));
      }
    } else {
      const reqVisibility = visibility || 'PUBLIC';
      conditions.push(eq(schema.tournaments.visibility, reqVisibility));
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
      .limit(limit)
      .offset(offset);

    const data = await Promise.all(
      rows.map(async (row) => {
        const [participantCount] = await this.db
          .select({ count: count() })
          .from(schema.tournamentParticipants)
          .where(eq(schema.tournamentParticipants.tournamentId, row.tournament.id));

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
              .where(eq(schema.tournamentParticipants.tournamentDivisionId, d.id));
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
          .where(eq(schema.tournamentParticipants.tournamentDivisionId, division.id));

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
            const participants = await tx
              .select()
              .from(schema.tournamentParticipants)
              .where(
                and(
                  eq(schema.tournamentParticipants.tournamentId, id),
                  ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN')
                )
              );
            
            const participantIds = participants.map(p => p.id);
            let totalPlayers = 0;
            if (participantIds.length > 0) {
              const [rostersCount] = await tx
                .select({ count: count() })
                .from(schema.tournamentRosters)
                .where(inArray(schema.tournamentRosters.participantId, participantIds));
              totalPlayers = rostersCount.count;
            }

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

      // Cascade soft-delete to matches
      const stages = await tx
        .select({ id: schema.tournamentStages.id })
        .from(schema.tournamentStages)
        .where(eq(schema.tournamentStages.tournamentId, id));
      const stageIds = stages.map(s => s.id);

      if (stageIds.length > 0) {
        const groups = await tx
          .select({ id: schema.tournamentGroups.id })
          .from(schema.tournamentGroups)
          .where(inArray(schema.tournamentGroups.stageId, stageIds));
        const groupIds = groups.map(g => g.id);

        if (groupIds.length > 0) {
          await tx
            .update(schema.matches)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(inArray(schema.matches.groupId, groupIds));
        }
      }

      await this.auditService.logDelete(tx, userId, 'tournaments', id, oldRecord);
      return deleted;
    });
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
        throw new BadRequestException('Tournament not found');
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

      // 2. Kiểm tra trạng thái - phải mở đăng ký (REGISTRATION_OPEN hoặc UPCOMING)
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

      // 4. Kiểm tra mã mời nếu giải PRIVATE
      if (tournament.visibility === 'PRIVATE') {
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

        const gender = profile?.gender?.toUpperCase();
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

      const resolveMatchingDivision = async (
        partnerUserId: string | null,
      ): Promise<typeof schema.tournamentDivisions.$inferSelect | null> => {
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
                division.genderRestriction === targetGenderRestriction,
            );

        if (!selectedDivision) {
          const fallbackLabel = targetGenderRestriction === 'MIXED'
            ? 'Đôi Nam Nữ'
            : targetMatchType === 'SINGLES'
              ? targetGenderRestriction === 'MALE' ? 'Đơn Nam' : 'Đơn Nữ'
              : targetGenderRestriction === 'MALE' ? 'Đôi Nam' : 'Đôi Nữ';
          throw new BadRequestException(`Không có hình thức thi đấu ${fallbackLabel} phù hợp cho giải này.`);
        }

        if (
          selectedDivision.matchType !== targetMatchType ||
          selectedDivision.genderRestriction !== targetGenderRestriction
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
                ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
                ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
              ),
            );

          if (participantCount.count >= selectedDivision.maxParticipants) {
            throw new BadRequestException(`Hình thức ${selectedDivision.name} đã hết slot.`);
          }
        }

        return selectedDivision;
      };

      // 6. Kiểm tra số lượng tối đa cấp tournament cho backward-compatible.
      if (tournament.maxParticipants) {
        const [participantCount] = await tx
          .select({ count: count() })
          .from(schema.tournamentParticipants)
          .where(
            and(
              eq(schema.tournamentParticipants.tournamentId, tournamentId),
              ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
              ne(schema.tournamentParticipants.teamStatus, 'KICKED')
            )
          );
        
        if (participantCount.count >= tournament.maxParticipants) {
          throw new BadRequestException('Giải đấu đã đầy.');
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
            ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN')
          )
        );
      if (existingRosters.length > 0) {
        throw new BadRequestException('Bạn đã đăng ký tham gia giải đấu này rồi.');
      }

      // 9. Thêm participant
      const isDoubles = tournament.matchType === 'DOUBLES' || tournament.matchType === 'MIXED_DOUBLES';
      
      let partnerId: string | null = null;
      if (isDoubles && data.partnerEmailOrPhone) {
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
          throw new BadRequestException('Không tìm thấy tài khoản Baseline của đồng đội. Vui lòng kiểm tra lại Email hoặc SĐT.');
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
              ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN')
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
          const leaderGenderVal = leaderProfileRes[0]?.gender?.toUpperCase();
          const partnerGenderVal = partnerProfile.gender.toUpperCase();
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

      const selectedDivision = await resolveMatchingDivision(partnerId);
      const effectiveEntryFeeAmount = selectedDivision?.entryFee
        ? parseFloat(selectedDivision.entryFee)
        : parseFloat(tournament.entryFee || '0');

      const teamInviteToken = isDoubles ? Math.random().toString(36).substring(2, 14).toUpperCase() : null;
      const teamStatus = isDoubles ? (partnerId ? 'COMPLETE' : 'PENDING') : 'COMPLETE';
      // Bypass payment check for testing
      const isPaid = true; // entryFeeAmount === 0;

      const [participant] = await tx
        .insert(schema.tournamentParticipants)
        .values({
          tournamentId,
          tournamentDivisionId: selectedDivision?.id ?? null,
          registeredBy: userId,
          teamName: data.teamName,
          isPaid,
          teamInviteToken: partnerId ? null : teamInviteToken,
          teamStatus,
        })
        .returning();

      // 10. Thêm rosters cho Leader
      await tx.insert(schema.tournamentRosters).values({
        participantId: participant.id,
        userId: userId,
        role: 'MAIN',
      });

      // 10.5 Thêm rosters cho Partner nếu có
      if (partnerId) {
        await tx.insert(schema.tournamentRosters).values({
          participantId: participant.id,
          userId: partnerId,
          role: 'MAIN',
        });
      }

      // 11. Xử lý Payment (Singles, hoặc Doubles khi đội hoàn thành và có phí)
      let paymentUrl: string | null = null;
      if (effectiveEntryFeeAmount > 0 && (teamStatus === 'COMPLETE')) {
        const [payment] = await tx
          .insert(schema.payments)
          .values({
            userId,
            tournamentId,
            divisionId: selectedDivision?.id ?? null,
            participantId: participant.id,
            amount: effectiveEntryFeeAmount.toString(),
            status: 'PENDING',
            paymentGateway: 'VNPAY',
          })
          .returning();
        
        paymentUrl = `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_TxnRef=${payment.id}&vnp_Amount=${effectiveEntryFeeAmount * 100}`;
      }

      // 12. Audit log
      await this.auditService.logCreate(tx, userId, 'tournament_participants', participant.id, participant);

      return {
        participant,
        paymentUrl,
        teamInviteLink: (isDoubles && !partnerId)
          ? `/tournaments/${tournamentId}/join-team?pid=${participant.id}&token=${teamInviteToken}`
          : null
      };
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
      if (!tournament) throw new NotFoundException('Tournament not found');

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
        .limit(1);

      if (!participant) {
        throw new BadRequestException('Mã mời đồng đội hoặc đội thi đấu không hợp lệ.');
      }

      if (participant.teamStatus !== 'PENDING') {
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
            ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN')
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

      const leaderGender = leaderProfile?.gender?.toUpperCase();
      const partnerGender = partnerProfile?.gender?.toUpperCase();

      if (division) {
        if (
          (leaderGender !== 'MALE' && leaderGender !== 'FEMALE') ||
          (partnerGender !== 'MALE' && partnerGender !== 'FEMALE')
        ) {
          throw new BadRequestException('Cả hai VĐV cần cập nhật giới tính trong hồ sơ để tham gia.');
        }

        const targetGenderRestriction = leaderGender === partnerGender ? leaderGender : 'MIXED';
        const targetMatchType = targetGenderRestriction === 'MIXED' ? 'MIXED_DOUBLES' : 'DOUBLES';

        if (
          division.matchType !== targetMatchType ||
          division.genderRestriction !== targetGenderRestriction
        ) {
          throw new BadRequestException('Đồng đội không phù hợp với hình thức thi đấu đã đăng ký.');
        }
      } else if (tournament.genderRestriction) {
        if (!partnerGender) {
          throw new BadRequestException('Vui lòng cập nhật giới tính trong hồ sơ để tham gia.');
        }
        const restriction = tournament.genderRestriction.toUpperCase();

        if (restriction === 'MALE' && partnerGender !== 'MALE') {
          throw new BadRequestException('Giải đấu chỉ dành cho Nam.');
        }
        if (restriction === 'FEMALE' && partnerGender !== 'FEMALE') {
          throw new BadRequestException('Giải đấu chỉ dành cho Nữ.');
        }
        if (restriction === 'MIXED') {
          if (!leaderGender) {
            throw new BadRequestException('Không tìm thấy giới tính của trưởng nhóm để xác nhận Mixed Doubles.');
          }
          if (leaderGender === partnerGender) {
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

      // 6. Cập nhật trạng thái đội hoàn tất
      const entryFeeAmount = division?.entryFee
        ? parseFloat(division.entryFee)
        : parseFloat(tournament.entryFee || '0');
      // Bypass payment check for testing
      const isPaid = true; // entryFeeAmount === 0;

      const [updatedParticipant] = await tx
        .update(schema.tournamentParticipants)
        .set({
          teamStatus: 'COMPLETE',
          isPaid,
        })
        .where(eq(schema.tournamentParticipants.id, participantId))
        .returning();

      // 7. Tạo Payment cho Doubles khi đội hoàn tất (nếu có phí)
      let paymentUrl: string | null = null;
      if (entryFeeAmount > 0) {
        const [payment] = await tx
          .insert(schema.payments)
          .values({
            userId: participant.registeredBy, // Người đăng ký (Leader) thanh toán
            tournamentId,
            divisionId: participant.tournamentDivisionId,
            participantId: participant.id,
            amount: entryFeeAmount.toString(),
            status: 'PENDING',
            paymentGateway: 'VNPAY',
          })
          .returning();
        
        paymentUrl = `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_TxnRef=${payment.id}&vnp_Amount=${entryFeeAmount * 100}`;
      }

      await this.auditService.logUpdate(tx, userId, 'tournament_participants', participantId, participant, updatedParticipant);

      return {
        participant: updatedParticipant,
        paymentUrl,
      };
    });
  }

  async withdraw(tournamentId: string, userId: string) {
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
            ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN')
          )
        )
        .limit(1);

      if (userRoster.length === 0) {
        throw new BadRequestException('Bạn chưa đăng ký giải đấu này hoặc đã rút lui.');
      }

      const participantId = userRoster[0].participantId;

      // 2. Kiểm tra giải đấu chưa bắt đầu
      const [tournament] = await tx
        .select()
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, tournamentId))
        .limit(1);

      if (!tournament) throw new NotFoundException('Tournament not found');

      if (tournament.status === 'IN_PROGRESS' || tournament.status === 'COMPLETED') {
        throw new BadRequestException('Giải đấu đã bắt đầu hoặc kết thúc, không thể rút lui.');
      }

      // 3. Cập nhật trạng thái
      const [oldParticipant] = await tx
        .select()
        .from(schema.tournamentParticipants)
        .where(eq(schema.tournamentParticipants.id, participantId))
        .limit(1);

      const [updatedParticipant] = await tx
        .update(schema.tournamentParticipants)
        .set({ teamStatus: 'WITHDRAWN', teamInviteToken: null }) // clear invite code or invite tokens if any
        .where(eq(schema.tournamentParticipants.id, participantId))
        .returning();

      // 4. Nếu đã thanh toán, thực hiện hoàn tiền (mock refund log)
      let refundAmount: string | null = null;
      if (oldParticipant.isPaid) {
        const entryFeeAmount = parseFloat(tournament.entryFee || '0');
        if (entryFeeAmount > 0) {
          // Tạo một transaction refund trong bảng payments với trạng thái COMPLETED
          await tx
            .insert(schema.payments)
            .values({
              userId: oldParticipant.registeredBy,
              tournamentId,
              participantId,
              amount: `-${entryFeeAmount}`,
              status: 'COMPLETED',
              paymentGateway: 'REFUND',
            });
          refundAmount = entryFeeAmount.toString();
        }
      }

      await this.auditService.logUpdate(tx, userId, 'tournament_participants', participantId, oldParticipant, updatedParticipant);

      return {
        message: 'Đã rút khỏi giải đấu thành công.',
        refundAmount,
      };
    });
  }

  async kickParticipant(tournamentId: string, participantId: string, userId: string, reason?: string) {
    return await this.db.transaction(async (tx) => {
      // 1. Kiểm tra giải đấu
      const [tournament] = await tx
        .select()
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, tournamentId))
        .limit(1);

      if (!tournament) throw new NotFoundException('Tournament not found');

      // 2. Kiểm tra participant
      const [participant] = await tx
        .select()
        .from(schema.tournamentParticipants)
        .where(eq(schema.tournamentParticipants.id, participantId))
        .limit(1);

      if (!participant) throw new NotFoundException('Participant not found');

      // 3. Cập nhật trạng thái sang KICKED
      const [updatedParticipant] = await tx
        .update(schema.tournamentParticipants)
        .set({ teamStatus: 'KICKED', teamInviteToken: null })
        .where(eq(schema.tournamentParticipants.id, participantId))
        .returning();

      // 4. Hoàn tiền nếu đã nộp lệ phí
      let refundAmount: string | null = null;
      if (participant.isPaid) {
        const entryFeeAmount = parseFloat(tournament.entryFee || '0');
        if (entryFeeAmount > 0) {
          await tx
            .insert(schema.payments)
            .values({
              userId: participant.registeredBy,
              tournamentId,
              participantId,
              amount: `-${entryFeeAmount}`,
              status: 'COMPLETED',
              paymentGateway: 'REFUND',
            });
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

          let updateField: { participant1Id?: string | null; participant2Id?: string | null };

          if (nextMatch && nextMatch.bracketBranch === 'GRAND_FINALS') {
            if (match.bracketBranch === 'MAIN') {
              updateField = { participant1Id: winnerId };
            } else {
              updateField = { participant2Id: winnerId };
            }
          } else {
            if (match.bracketBranch === 'LOSERS') {
              if (match.roundNumber % 2 !== 0) {
                updateField = { participant1Id: winnerId };
              } else {
                const isOdd = (match.matchOrder % 2 !== 0);
                updateField = isOdd ? { participant1Id: winnerId } : { participant2Id: winnerId };
              }
            } else {
              const isOdd = (match.matchOrder % 2 !== 0);
              updateField = isOdd ? { participant1Id: winnerId } : { participant2Id: winnerId };
            }
          }

          await tx
            .update(schema.matches)
            .set(updateField)
            .where(eq(schema.matches.id, match.nextMatchId));
        }

        if (match.loserNextMatchId) {
          const isOdd = (match.matchOrder % 2 !== 0);
          let updateField: { participant1Id?: string | null; participant2Id?: string | null };

          if (match.roundNumber === 1) {
            updateField = isOdd ? { participant1Id: null } : { participant2Id: null };
          } else {
            updateField = { participant2Id: null };
          }

          await tx
            .update(schema.matches)
            .set(updateField)
            .where(eq(schema.matches.id, match.loserNextMatchId));
        }
      }

      await this.auditService.logUpdate(tx, userId, 'tournament_participants', participantId, participant, updatedParticipant);

      return {
        message: 'Đội thi đấu đã bị kick và hoàn tiền thành công.',
        refundAmount,
      };
    });
  }

  async myRegistration(tournamentId: string, userId: string) {
    const userRoster = await this.db
      .select({ participantId: schema.tournamentRosters.participantId })
      .from(schema.tournamentRosters)
      .innerJoin(schema.tournamentParticipants, eq(schema.tournamentRosters.participantId, schema.tournamentParticipants.id))
      .where(
        and(
          eq(schema.tournamentParticipants.tournamentId, tournamentId),
          eq(schema.tournamentRosters.userId, userId),
          ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN')
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
        isPaid: participant.isPaid,
        teamInviteToken: participant.teamInviteToken,
        teamMembers: members,
        teamInviteLink: participant.teamStatus === 'PENDING' && participant.registeredBy === userId
          ? `/tournaments/${tournamentId}/join-team?pid=${participant.id}&token=${participant.teamInviteToken}`
          : null
      }
    };
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
            )
          : and(
              eq(schema.tournamentParticipants.tournamentId, tournamentId),
              ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
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

  async findBracket(tournamentId: string, divisionId?: string): Promise<{ stages: BracketStage[] }> {
    const stages = await this.db
      .select()
      .from(schema.tournamentStages)
      .where(
        divisionId
          ? and(
              eq(schema.tournamentStages.tournamentId, tournamentId),
              eq(schema.tournamentStages.tournamentDivisionId, divisionId),
            )
          : eq(schema.tournamentStages.tournamentId, tournamentId),
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
              ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN')
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

      if (!tournament) throw new BadRequestException('Tournament not found');

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
            teamStatus: 'COMPLETE',
            isMock: true,
          }).returning();

          await tx.insert(schema.tournamentRosters).values({ participantId: participant.id, userId: user.id, role: 'MAIN' });

          createdParticipants.push(participant);
        }
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

  async updateParticipantStatus(participantId: string, status: string) {
    const [updated] = await this.db
      .update(schema.tournamentParticipants)
      .set({ teamStatus: status })
      .where(eq(schema.tournamentParticipants.id, participantId))
      .returning();
    return updated;
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
          eq(schema.profiles.phoneNumber, emailOrPhone)
        )
      )
      .limit(1);
    return user;
  }

  async assignReservedSlot(tournamentId: string, userId: string, teamName: string, partnerId?: string) {
    return await this.db.transaction(async (tx) => {
      const tournament = await tx
        .select()
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, tournamentId))
        .limit(1)
        .then(res => res[0]);

      if (!tournament) throw new BadRequestException('Tournament not found');

      const isDoubles = tournament.matchType === 'DOUBLES' || tournament.matchType === 'MIXED_DOUBLES';
      const teamStatus = isDoubles ? (partnerId ? 'COMPLETE' : 'PENDING') : 'COMPLETE';

      const [participant] = await tx
        .insert(schema.tournamentParticipants)
        .values({
          tournamentId,
          registeredBy: userId,
          teamName: teamName || 'Guest Team',
          isPaid: true,
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

  async cancelTournament(tournamentId: string, userId: string) {
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
        if (participant.isPaid) {
          const entryFeeAmount = parseFloat(updatedTournament.entryFee || '0');
          if (entryFeeAmount > 0) {
            await tx
              .insert(schema.payments)
              .values({
                userId: participant.registeredBy,
                tournamentId,
                participantId: participant.id,
                amount: `-${entryFeeAmount}`,
                status: 'COMPLETED',
                paymentGateway: 'REFUND',
              });
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
              ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN')
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
      feePublicRanked: parseFloat(await getVal('TOURNAMENT_PUBLISH_FEE_PUBLIC_RANKED', '100000')),
      feePublicUnranked: parseFloat(await getVal('TOURNAMENT_PUBLISH_FEE_PUBLIC_UNRANKED', '50000')),
      feeClub: parseFloat(await getVal('TOURNAMENT_PUBLISH_FEE_CLUB', '0')),
      pctPublicRanked: parseFloat(await getVal('PLATFORM_FEE_PERCENTAGE_PUBLIC_RANKED', '5')),
      pctPublicUnranked: parseFloat(await getVal('PLATFORM_FEE_PERCENTAGE_PUBLIC_UNRANKED', '5')),
      pctClub: parseFloat(await getVal('PLATFORM_FEE_PERCENTAGE_CLUB', '0')),
    };
  }

  async cancelPendingRegistrationsIfFull(tournamentId: string): Promise<string[]> {
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
            eq(schema.tournamentParticipants.teamStatus, 'COMPLETE')
          )
        );

      if (completedCount.count >= tournament.maxParticipants) {
        const pendingParts = await tx
          .select()
          .from(schema.tournamentParticipants)
          .where(
            and(
              eq(schema.tournamentParticipants.tournamentId, tournamentId),
              eq(schema.tournamentParticipants.teamStatus, 'PENDING')
            )
          );

        if (pendingParts.length === 0) return [];

        const canceledLeaderIds: string[] = [];
        const entryFeeAmount = parseFloat(tournament.entryFee || '0');

        for (const p of pendingParts) {
          await tx
            .update(schema.tournamentParticipants)
            .set({ teamStatus: 'KICKED', teamInviteToken: null })
            .where(eq(schema.tournamentParticipants.id, p.id));

          if (entryFeeAmount > 0 && p.isPaid) {
            await tx
              .insert(schema.payments)
              .values({
                userId: p.registeredBy,
                tournamentId,
                participantId: p.id,
                amount: `-${entryFeeAmount}`,
                status: 'COMPLETED',
                paymentGateway: 'REFUND',
              });
          }

          canceledLeaderIds.push(p.registeredBy);
        }
        return canceledLeaderIds;
      }
      return [];
    });
  }

  async processPendingRegistrationsTimeout(): Promise<{ leaderId: string; tournamentId: string; tournamentName: string }[]> {
    return await this.db.transaction(async (tx) => {
      const timeoutThreshold = new Date(Date.now() - 30 * 60 * 1000); // 30 mins ago

      const expiredParts = await tx
        .select({
          participant: schema.tournamentParticipants,
          tournament: schema.tournaments,
        })
        .from(schema.tournamentParticipants)
        .innerJoin(schema.tournaments, eq(schema.tournamentParticipants.tournamentId, schema.tournaments.id))
        .where(
          and(
            eq(schema.tournamentParticipants.teamStatus, 'PENDING'),
            lt(schema.tournamentParticipants.registeredAt, timeoutThreshold)
          )
        );

      if (expiredParts.length === 0) return [];

      const results: { leaderId: string; tournamentId: string; tournamentName: string }[] = [];

      for (const { participant, tournament } of expiredParts) {
        await tx
          .update(schema.tournamentParticipants)
          .set({ teamStatus: 'KICKED', teamInviteToken: null })
          .where(eq(schema.tournamentParticipants.id, participant.id));

        const entryFeeAmount = parseFloat(tournament.entryFee || '0');
        if (entryFeeAmount > 0 && participant.isPaid) {
          await tx
            .insert(schema.payments)
            .values({
              userId: participant.registeredBy,
              tournamentId: tournament.id,
              participantId: participant.id,
              amount: `-${entryFeeAmount}`,
              status: 'COMPLETED',
              paymentGateway: 'REFUND',
            });
        }

        results.push({
          leaderId: participant.registeredBy,
          tournamentId: tournament.id,
          tournamentName: tournament.name,
        });
      }

      return results;
    });
  }

  async findReferees(tournamentId: string) {
    return this.db
      .select({
        id: schema.tournamentReferees.id,
        userId: schema.tournamentReferees.userId,
        status: schema.tournamentReferees.status,
        fullName: schema.profiles.fullName,
        avatarUrl: schema.profiles.avatarUrl,
      })
      .from(schema.tournamentReferees)
      .innerJoin(schema.users, eq(schema.tournamentReferees.userId, schema.users.id))
      .innerJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(eq(schema.tournamentReferees.tournamentId, tournamentId));
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
          throw new NotFoundException('Division not found');
        }

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
            ...(dto.roundConfig !== undefined && { roundConfig: dto.roundConfig }),
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
          throw new NotFoundException('Division not found');
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
              ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
              ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
            ),
          );

        if (activeParticipants > 0) {
          throw new BadRequestException('Không thể xóa hình thức đã có người chơi. Hãy di chuyển hoặc loại bỏ người chơi trước.');
        }

        // Hard delete since tournament_divisions doesn't have a deletedAt column
        // and cascade is handled by FK constraint
        await tx
          .delete(schema.tournamentDivisions)
          .where(eq(schema.tournamentDivisions.id, id));

        await this.auditService.logDelete(
          tx,
          userId,
          'tournament_divisions',
          id,
          oldRecord
        );

        return { success: true };
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
      if (existing.status !== 'ACCEPTED') {
        await this.db
          .update(schema.tournamentReferees)
          .set({ status: 'ACCEPTED', assignedBy, assignedAt: new Date() })
          .where(eq(schema.tournamentReferees.id, existing.id));
      }
      return existing;
    }

    const [referee] = await this.db
      .insert(schema.tournamentReferees)
      .values({
        tournamentId,
        userId,
        assignedBy,
        status: 'ACCEPTED',
      })
      .returning();
    return referee;
  }
}

