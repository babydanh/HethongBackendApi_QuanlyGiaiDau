import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PG_CONNECTION } from '../../../database/database.module';
import type { AppDb, AppDbOrTx } from '../../../database/db.types';
import * as schema from '../../../database/schema';
import { PaymentStatus } from '../../../common/constants/enums';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  ne,
  notExists,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { AuditService, Transaction } from '../../audit/audit.service';
import { CreateTournamentDto } from '../dto/create-tournament.dto';
import { UpdateTournamentDto } from '../dto/update-tournament.dto';
import { QueryTournamentDto } from '../dto/query-tournament.dto';
import { QueryMyManagementTournamentsDto } from '../dto/query-my-management-tournaments.dto';
import { CreateParentTournamentDto } from '../dto/create-parent-tournament.dto';
import { UpdateParentTournamentDto } from '../dto/update-parent-tournament.dto';
import { SeriesService } from '../../series/series.service';
import { CursorPaginationHelper } from '../../../common/helpers/cursor-pagination.helper';
import {
  normalizeGenderRestriction,
  normalizeProfileGender,
} from '../../../common/helpers/gender.helper';
import { TournamentPaymentRepository } from './tournament-payment.repository';

@Injectable()
export class TournamentCatalogRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
    private readonly auditService: AuditService,
    private readonly seriesService: SeriesService,
    private readonly tournamentPaymentRepository: TournamentPaymentRepository,
  ) {}
  async findAll(
    query: QueryTournamentDto,
    options?: {
      defaultTournamentType?: 'CLUB' | 'PUBLIC' | null;
      defaultVisibility?: 'PUBLIC' | 'PRIVATE' | null;
      includeInviteCode?: boolean;
    },
  ) {
    const includeInviteCode = options?.includeInviteCode === true;
    const {
      page = 1,
      limit = 10,
      cursor,
      search,
      categoryId,
      status,
      tournamentType,
      matchType,
      communityId,
      visibility,
      region,
      createdBy,
      startDate,
      endDate,
      bracketType,
      genderRestriction,
      isRanked,
    } = query;
    const defaultTournamentType = options?.defaultTournamentType;
    const defaultVisibility = options?.defaultVisibility;

    const conditions: SQL[] = [];

    // Always exclude soft-deleted tournaments
    conditions.push(sql`${schema.tournaments.deletedAt} IS NULL`);

    // Exclude DRAFT, PENDING_APPROVAL, SUSPENDED, CANCELLED, and PENDING_DELETE tournaments from public listing
    conditions.push(
      sql`${schema.tournaments.status} NOT IN ('DRAFT', 'PENDING_APPROVAL', 'SUSPENDED', 'CANCELLED', 'PENDING_DELETE', 'pending_delete')`,
    );

    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        sql`(${schema.tournaments.name}::text ILIKE ${pattern} OR ${schema.tournaments.description}::text ILIKE ${pattern} OR ${schema.tournaments.city}::text ILIKE ${pattern})`,
      );
    }
    if (categoryId) {
      conditions.push(eq(schema.tournaments.categoryId, categoryId));
    }
    if (status) {
      const statuses = status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (statuses.length === 1) {
        if (statuses[0] === 'UPCOMING') {
          conditions.push(
            inArray(schema.tournaments.status, [
              'UPCOMING',
              'REGISTRATION_CLOSED',
            ]),
          );
        } else {
          conditions.push(eq(schema.tournaments.status, statuses[0]));
        }
      } else if (statuses.length > 1) {
        const expandedStatuses = new Set<string>();
        for (const s of statuses) {
          if (s === 'UPCOMING') {
            expandedStatuses.add('UPCOMING');
            expandedStatuses.add('REGISTRATION_CLOSED');
          } else {
            expandedStatuses.add(s);
          }
        }
        conditions.push(
          inArray(schema.tournaments.status, Array.from(expandedStatuses)),
        );
      }
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
            isNull(schema.tournaments.genderRestriction),
          ) as SQL,
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
          )`,
        ) as SQL,
      );
    }
    if (bracketType) {
      conditions.push(
        sql`${schema.tournaments.tournamentConfig}->>'bracketType' = ${bracketType}`,
      );
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
        )`,
      );
    }

    if (startDate) {
      conditions.push(
        sql`date(${schema.tournaments.endDate}) >= ${startDate}::date`,
      );
    }

    if (endDate) {
      conditions.push(
        sql`date(coalesce(${schema.tournaments.registrationStartDate}, ${schema.tournaments.startDate})) <= ${endDate}::date`,
      );
    }

    const baseWhereClause =
      conditions.length > 0 ? and(...conditions) : undefined;
    const [decodedCursor] = cursor
      ? [
          CursorPaginationHelper.decodeCursor<{
            id: string;
            createdAt: string;
          }>(cursor),
        ]
      : [null];
    if (decodedCursor) {
      conditions.push(
        or(
          lt(schema.tournaments.createdAt, new Date(decodedCursor.createdAt)),
          and(
            eq(schema.tournaments.createdAt, new Date(decodedCursor.createdAt)),
            lt(schema.tournaments.id, decodedCursor.id),
          ),
        ) as SQL,
      );
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRecord] = await this.db
      .select({ count: count() })
      .from(schema.tournaments)
      .where(baseWhereClause);

    const rows = this.db
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
      .leftJoin(
        schema.categories,
        eq(schema.tournaments.categoryId, schema.categories.id),
      )
      .leftJoin(
        schema.tournamentVenues,
        eq(schema.tournaments.venueId, schema.tournamentVenues.id),
      )
      .where(whereClause)
      .orderBy(
        sql`${schema.tournaments.createdAt} DESC`,
        sql`${schema.tournaments.id} DESC`,
      )
      .limit(limit + 1)
      .$dynamic();
    const resolvedRows = await rows;
    const hasMore = resolvedRows.length > limit;
    const rowData = hasMore ? resolvedRows.slice(0, limit) : resolvedRows;

    const data = await Promise.all(
      rowData.map(async (row) => {
        const [participantCount] = await this.db
          .select({ count: count() })
          .from(schema.tournamentParticipants)
          .where(
            and(
              eq(schema.tournamentParticipants.tournamentId, row.tournament.id),
              ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
              ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
              ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
              ne(schema.tournamentParticipants.teamStatus, 'EXPIRED'),
              ne(schema.tournamentParticipants.teamStatus, 'CANCELLED'),
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
          entryFee: string | null;
          entryFeeOverride: string | null;
          entryFeeOverrideEnabled: boolean;
          effectiveEntryFee: string | null;
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
            entryFee: schema.tournamentDivisions.entryFee,
            entryFeeOverrideEnabled:
              schema.tournamentDivisions.entryFeeOverrideEnabled,
          })
          .from(schema.tournamentDivisions)
          .where(
            eq(schema.tournamentDivisions.tournamentId, row.tournament.id),
          );

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
                  ne(schema.tournamentParticipants.teamStatus, 'EXPIRED'),
                  ne(schema.tournamentParticipants.teamStatus, 'CANCELLED'),
                ),
              );
            const division = {
              ...d,
              categoryId: row.tournament.categoryId,
              entryFee: d.entryFeeOverrideEnabled
                ? d.entryFee
                : row.tournament.entryFee,
              entryFeeOverride: d.entryFeeOverrideEnabled ? d.entryFee : null,
              effectiveEntryFee: d.entryFeeOverrideEnabled
                ? d.entryFee
                : row.tournament.entryFee,
              _count: {
                participants: dCount.count,
              },
            };
            return {
              ...division,
              inviteCode: includeInviteCode ? row.tournament.inviteCode : null,
            };
          }),
        );

        const { inviteCode: _inviteCode, ...safeTournament } = row.tournament;
        return {
          ...safeTournament,
          inviteCode: includeInviteCode ? _inviteCode : null,
          category: row.category?.id ? row.category : null,
          venue: row.venue?.id ? row.venue : null,
          _count: {
            participants: participantCount.count,
          },
          divisions: divisions.length > 0 ? divisions : null,
        };
      }),
    );

    return {
      data,
      meta: {
        total: totalRecord.count,
        page,
        limit,
        totalPages: Math.ceil(totalRecord.count / limit),
        nextCursor:
          hasMore && data.length > 0
            ? CursorPaginationHelper.encodeCursor({
                id: data[data.length - 1].id,
                createdAt: data[data.length - 1].createdAt,
              })
            : null,
        hasMore,
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
  async findById(id: string, options?: { includeInviteCode?: boolean }) {
    const includeInviteCode = options?.includeInviteCode === true;
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
      .leftJoin(
        schema.categories,
        eq(schema.tournaments.categoryId, schema.categories.id),
      )
      .leftJoin(
        schema.communities,
        eq(schema.tournaments.communityId, schema.communities.id),
      )
      .leftJoin(
        schema.tournamentVenues,
        eq(schema.tournaments.venueId, schema.tournamentVenues.id),
      )
      .leftJoin(schema.users, eq(schema.tournaments.createdBy, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(
        and(
          eq(schema.tournaments.id, id),
          isNull(schema.tournaments.deletedAt),
        ),
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
          ne(schema.tournamentParticipants.teamStatus, 'EXPIRED'),
          ne(schema.tournamentParticipants.teamStatus, 'CANCELLED'),
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
        .innerJoin(
          schema.tournamentGroups,
          eq(schema.matches.groupId, schema.tournamentGroups.id),
        )
        .innerJoin(
          schema.tournamentStages,
          eq(schema.tournamentGroups.stageId, schema.tournamentStages.id),
        )
        .where(
          and(
            eq(schema.tournamentStages.tournamentId, id),
            isNull(schema.tournamentStages.deletedAt),
            isNull(schema.matches.deletedAt),
          ),
        );
      matchesTotal = totalCount.count;

      const [completedCount] = await this.db
        .select({ count: count() })
        .from(schema.matches)
        .innerJoin(
          schema.tournamentGroups,
          eq(schema.matches.groupId, schema.tournamentGroups.id),
        )
        .innerJoin(
          schema.tournamentStages,
          eq(schema.tournamentGroups.stageId, schema.tournamentStages.id),
        )
        .where(
          and(
            eq(schema.tournamentStages.tournamentId, id),
            isNull(schema.tournamentStages.deletedAt),
            isNull(schema.matches.deletedAt),
            eq(schema.matches.status, 'COMPLETED'),
          ),
        );
      matchesCompleted = completedCount.count;

      const [liveCount] = await this.db
        .select({ count: count() })
        .from(schema.matches)
        .innerJoin(
          schema.tournamentGroups,
          eq(schema.matches.groupId, schema.tournamentGroups.id),
        )
        .innerJoin(
          schema.tournamentStages,
          eq(schema.tournamentGroups.stageId, schema.tournamentStages.id),
        )
        .where(
          and(
            eq(schema.tournamentStages.tournamentId, id),
            isNull(schema.tournamentStages.deletedAt),
            isNull(schema.matches.deletedAt),
            eq(schema.matches.status, 'ONGOING'),
          ),
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
            sql`${schema.tournaments.deletedAt} IS NULL`,
          ),
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
      entryFee: string | null;
      entryFeeOverride: string | null;
      entryFeeOverrideEnabled: boolean;
      effectiveEntryFee: string | null;
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
        entryFee: schema.tournamentDivisions.entryFee,
        entryFeeOverrideEnabled:
          schema.tournamentDivisions.entryFeeOverrideEnabled,
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
              eq(
                schema.tournamentParticipants.tournamentDivisionId,
                division.id,
              ),
              ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
              ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
              ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
              ne(schema.tournamentParticipants.teamStatus, 'EXPIRED'),
              ne(schema.tournamentParticipants.teamStatus, 'CANCELLED'),
            ),
          );

        const [matchCountByDivision] = await this.db
          .select({ count: count() })
          .from(schema.tournamentStages)
          .where(eq(schema.tournamentStages.tournamentDivisionId, division.id));

        const divisionWithCounts = {
          ...division,
          categoryId: row.tournament.categoryId,
          entryFee: division.entryFeeOverrideEnabled
            ? division.entryFee
            : row.tournament.entryFee,
          entryFeeOverride: division.entryFeeOverrideEnabled
            ? division.entryFee
            : null,
          effectiveEntryFee: division.entryFeeOverrideEnabled
            ? division.entryFee
            : row.tournament.entryFee,
          _count: {
            participants: participantCountByDivision.count,
            matches: matchCountByDivision.count,
          },
        };
        return {
          ...divisionWithCounts,
          inviteCode: includeInviteCode ? row.tournament.inviteCode : null,
        };
      }),
    );

    const { inviteCode: _inviteCode, ...safeTournament } = row.tournament;
    return {
      ...safeTournament,
      inviteCode: includeInviteCode ? _inviteCode : null,
      category: row.category?.id ? row.category : null,
      community: row.community?.id ? row.community : null,
      venue: row.venue?.id ? row.venue : null,
      creator: row.creator?.id ? row.creator : null,
      organizer: row.creator?.id
        ? {
            id: row.creator.id,
            fullName: row.creator.fullName,
            avatarUrl: row.creator.avatarUrl,
            isTrusted,
          }
        : null,
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

      // The create forms keep the venue draft in tournamentConfig.location.
      // Materialize that draft in the same transaction so the manage page can
      // immediately load the tournament venue card instead of showing an
      // unlinked location snapshot.
      const sourceTournamentConfig =
        data.tournamentConfig && typeof data.tournamentConfig === 'object'
          ? data.tournamentConfig
          : {};
      const rawLocation = sourceTournamentConfig.location;
      const location =
        rawLocation &&
        typeof rawLocation === 'object' &&
        !Array.isArray(rawLocation)
          ? (rawLocation as Record<string, unknown>)
          : null;
      const readLocationText = (key: string) => {
        const value = location?.[key];
        return typeof value === 'string' ? value.trim() : '';
      };
      let venueId = data.venueId || null;
      let tournamentConfig = sourceTournamentConfig;

      if (!venueId && location) {
        const venueName = readLocationText('venueName');
        const locationAddress = [
          readLocationText('address'),
          readLocationText('ward'),
          readLocationText('district'),
          readLocationText('province'),
        ]
          .filter(Boolean)
          .join(', ');

        if (venueName && locationAddress) {
          const [createdVenue] = await tx
            .insert(schema.tournamentVenues)
            .values({
              ownerUserId: userId,
              name: venueName,
              locationAddress,
            })
            .returning({ id: schema.tournamentVenues.id });
          venueId = createdVenue.id;

          const configuredVenueIds = Array.isArray(
            sourceTournamentConfig.venueIds,
          )
            ? sourceTournamentConfig.venueIds.filter(
                (value): value is string => typeof value === 'string',
              )
            : [];
          tournamentConfig = {
            ...sourceTournamentConfig,
            venueIds: Array.from(new Set([...configuredVenueIds, venueId])),
          };
        }
      }

      // Get platform fee percentage from configs dynamically
      let configKey = 'PLATFORM_FEE_PERCENTAGE_CLUB';
      let defaultPct = '0';
      if (data.tournamentType === 'PUBLIC') {
        configKey = data.isRanked
          ? 'PLATFORM_FEE_PERCENTAGE_PUBLIC_RANKED'
          : 'PLATFORM_FEE_PERCENTAGE_PUBLIC_UNRANKED';
        defaultPct = '5';
      }

      const [configRecord] = await tx
        .select()
        .from(schema.systemConfigs)
        .where(eq(schema.systemConfigs.key, configKey))
        .limit(1);
      const platformFeePercentage =
        data.platformFeePercentage !== undefined
          ? data.platformFeePercentage.toString()
          : configRecord
            ? configRecord.value
            : defaultPct;

      const feeRuleKeys = [
        'PLATFORM_FEE_LOW_ENTRY_THRESHOLD',
        'PLATFORM_FEE_LOW_ENTRY_FIXED_AMOUNT',
      ] as const;
      const feeRuleConfigRows = await tx
        .select({
          key: schema.systemConfigs.key,
          value: schema.systemConfigs.value,
        })
        .from(schema.systemConfigs)
        .where(inArray(schema.systemConfigs.key, [...feeRuleKeys]));
      const feeRuleConfig = new Map(
        feeRuleConfigRows.map((config) => [config.key, config.value]),
      );
      const parseNonNegativeInteger = (
        value: string | undefined,
        fallback: number,
      ) => {
        const parsed = Number(value ?? fallback);
        return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
      };
      const platformFeeThreshold = parseNonNegativeInteger(
        feeRuleConfig.get('PLATFORM_FEE_LOW_ENTRY_THRESHOLD'),
        100000,
      );
      const platformFeeFixedAmount = parseNonNegativeInteger(
        feeRuleConfig.get('PLATFORM_FEE_LOW_ENTRY_FIXED_AMOUNT'),
        5000,
      );
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
          tournamentConfig,
          entryFee: (data.entryFee || 0).toString(),
          platformFeePercentage,
          platformFeeThreshold: platformFeeThreshold.toString(),
          platformFeeFixedAmount: platformFeeFixedAmount.toString(),
          registrationStartDate: data.registrationStartDate
            ? new Date(data.registrationStartDate)
            : null,
          registrationEndDate: data.registrationEndDate
            ? new Date(data.registrationEndDate)
            : null,
          maxParticipants: data.maxParticipants || null,
          startDate: data.startDate ? new Date(data.startDate) : null,
          endDate: data.endDate ? new Date(data.endDate) : null,
          venueId,
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

      await this.auditService.logCreate(
        tx,
        userId,
        'tournaments',
        record.id,
        record,
      );
      return record;
    });
  }
  async update(id: string, userId: string, data: UpdateTournamentDto) {
    const updatedResult = await this.db.transaction(async (tx) => {
      const [oldRecord] = await tx
        .select()
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, id))
        .for('update')
        .limit(1);

      if (!oldRecord) {
        throw new NotFoundException('Giải đấu không tồn tại');
      }

      await this.tournamentPaymentRepository.assertEntryFeeChangeAllowed(
        tx,
        {
          id: oldRecord.id,
          status: data.status ?? oldRecord.status,
          isRegistrationLocked: oldRecord.isRegistrationLocked,
        },
        oldRecord.entryFee,
        data.entryFee,
      );

      const [updated] = await tx
        .update(schema.tournaments)
        .set({
          ...(data.name && { name: data.name }),
          ...(data.categoryId && { categoryId: data.categoryId }),
          ...(data.communityId !== undefined && {
            communityId: data.communityId,
          }),
          ...(data.description !== undefined && {
            description: data.description,
          }),
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
            registrationStartDate: data.registrationStartDate
              ? new Date(data.registrationStartDate)
              : null,
          }),
          ...(data.registrationEndDate !== undefined && {
            registrationEndDate: data.registrationEndDate
              ? new Date(data.registrationEndDate)
              : null,
          }),
          ...(data.maxParticipants !== undefined && {
            maxParticipants: data.maxParticipants,
          }),
          ...(data.startDate && { startDate: new Date(data.startDate) }),
          ...(data.endDate && { endDate: new Date(data.endDate) }),
          ...(data.venueId !== undefined && { venueId: data.venueId }),
          ...(data.city !== undefined && { city: data.city || null }),
          ...(data.tournamentType && { tournamentType: data.tournamentType }),
          ...(data.bannerUrl !== undefined && { bannerUrl: data.bannerUrl }),
          ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
          ...(data.galleryImages !== undefined && {
            galleryImages: data.galleryImages,
          }),
          ...(data.prizeDescription !== undefined && {
            prizeDescription: data.prizeDescription,
          }),
          ...(data.prizes !== undefined && { prizes: data.prizes }),
          ...(data.contactInfo !== undefined && {
            contactInfo: data.contactInfo,
          }),
          ...(data.visibility !== undefined && { visibility: data.visibility }),
          ...(data.genderRestriction !== undefined && {
            genderRestriction: data.genderRestriction,
          }),
          ...(data.parentId !== undefined && { parentId: data.parentId }),
          ...(data.isRegistrationLocked !== undefined && {
            isRegistrationLocked: data.isRegistrationLocked,
          }),
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
            eq(
              schema.tournamentRosters.participantId,
              schema.tournamentParticipants.id,
            ),
          )
          .where(eq(schema.tournamentParticipants.tournamentId, id));

        const userIdsToLock = [
          ...new Set(
            participantsRoster
              .map((r) => r.userId)
              .filter((uid): uid is string => !!uid),
          ),
        ];

        if (userIdsToLock.length > 0) {
          await tx
            .update(schema.profiles)
            .set({ isGenderLocked: true, updatedAt: new Date() })
            .where(inArray(schema.profiles.userId, userIdsToLock));
        }
      }

      // Escrow / Payout Logic when status transitions to REGISTRATION_CLOSED
      if (
        data.status === 'REGISTRATION_CLOSED' &&
        oldRecord.status !== 'REGISTRATION_CLOSED'
      ) {
        const isPaidPublic = oldRecord.tournamentType === 'PUBLIC';
        if (isPaidPublic) {
          const [resultPayments] = await tx
            .select({
              totalCollected: sql<string>`coalesce(sum(${schema.payments.amount}), '0')`,
              platformFeeRetained: sql<string>`coalesce(sum(${schema.payments.platformFeeAmount}), '0')`,
            })
            .from(schema.payments)
            .where(
              and(
                eq(schema.payments.tournamentId, id),
                eq(schema.payments.purpose, 'REGISTRATION_FEE'),
                eq(schema.payments.status, 'COMPLETED'),
              ),
            );
          const totalCollected = parseFloat(resultPayments.totalCollected);
          const platformFeeRetained = parseFloat(
            resultPayments.platformFeeRetained,
          );
          const amountRequested = totalCollected - platformFeeRetained;

          if (
            totalCollected > 0 &&
            platformFeeRetained >= 0 &&
            amountRequested >= 0
          ) {
            if (amountRequested > 0) {
              const [resultCount] = await tx
                .select({ count: count() })
                .from(schema.tournaments)
                .where(
                  and(
                    eq(schema.tournaments.createdBy, oldRecord.createdBy),
                    eq(schema.tournaments.visibility, 'PUBLIC'),
                    eq(schema.tournaments.status, 'COMPLETED'),
                    sql`${schema.tournaments.deletedAt} IS NULL`,
                  ),
                );

              const isTrusted = resultCount.count >= 3;
              const targetPayoutStatus = isTrusted
                ? 'PENDING_DISBURSEMENT'
                : 'HELD_IN_ESCROW';
              const payoutTrigger = isTrusted
                ? 'AUTO_ON_LOCK'
                : 'MANUAL_ON_COMPLETE';

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
                  holdUntil: isTrusted
                    ? null
                    : oldRecord.endDate
                      ? new Date(oldRecord.endDate)
                      : null,
                })
                .returning();

              await tx.insert(schema.payoutStatusLogs).values({
                payoutId: payoutRecord.id,
                previousStatus: 'NONE',
                newStatus: targetPayoutStatus,
                changedBy: userId,
                note: isTrusted
                  ? 'AUTO_CREATED_TRUSTED_ORGANIZER'
                  : 'AUTO_CREATED_ESCROW_HOLD',
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
              eq(schema.organizerPayouts.status, 'HELD_IN_ESCROW'),
            ),
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

      await this.auditService.logUpdate(
        tx,
        userId,
        'tournaments',
        id,
        oldRecord,
        updated,
      );
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
      const [oldRecord] = await tx
        .select()
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, id))
        .limit(1);

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

      await this.auditService.logDelete(
        tx,
        userId,
        'tournaments',
        id,
        oldRecord,
      );
      return deleted;
    });
  }
  async archive(id: string, userId: string) {
    return this.db.transaction(async (tx) => {
      const [oldRecord] = await tx
        .select()
        .from(schema.tournaments)
        .where(
          and(
            eq(schema.tournaments.id, id),
            isNull(schema.tournaments.deletedAt),
          ),
        )
        .limit(1);

      if (!oldRecord) return null;

      const now = new Date();
      const [archived] = await tx
        .update(schema.tournaments)
        .set({ archivedAt: now, updatedAt: now })
        .where(eq(schema.tournaments.id, id))
        .returning();

      await this.auditService.logUpdate(
        tx,
        userId,
        'tournaments',
        id,
        oldRecord,
        archived,
      );
      return archived;
    });
  }
  async updateStatus(id: string, status: string) {
    return this.db
      .update(schema.tournaments)
      .set({ status, updatedAt: new Date() })
      .where(eq(schema.tournaments.id, id))
      .returning();
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
          sql`${schema.tournaments.deletedAt} IS NULL`,
        ),
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
          isNull(schema.tournaments.deletedAt),
        ),
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
          sql`${schema.tournaments.deletedAt} IS NULL`,
        ),
      );

    // 2. Tournaments joined by user
    const joined = await this.db
      .select({ id: schema.tournaments.id })
      .from(schema.tournaments)
      .innerJoin(
        schema.tournamentParticipants,
        eq(schema.tournaments.id, schema.tournamentParticipants.tournamentId),
      )
      .innerJoin(
        schema.tournamentRosters,
        eq(
          schema.tournamentParticipants.id,
          schema.tournamentRosters.participantId,
        ),
      )
      .where(
        and(
          eq(schema.tournamentRosters.userId, userId),
          sql`${schema.tournaments.deletedAt} IS NULL`,
        ),
      );

    // 3. Tournaments where the user is a co-organizer (invited via staff)
    const coOrganized = await this.db
      .select({ id: schema.tournaments.id })
      .from(schema.tournaments)
      .innerJoin(
        schema.tournamentStaff,
        eq(schema.tournaments.id, schema.tournamentStaff.tournamentId),
      )
      .where(
        and(
          eq(schema.tournamentStaff.userId, userId),
          eq(schema.tournamentStaff.role, 'CO_ORGANIZER'),
          sql`${schema.tournaments.deletedAt} IS NULL`,
        ),
      );

    const ids = Array.from(
      new Set([
        ...created.map((t) => t.id),
        ...joined.map((t) => t.id),
        ...coOrganized.map((t) => t.id),
      ]),
    );
    if (ids.length === 0) return [];

    const rows = await this.db
      .select({
        tournament: schema.tournaments,
        category: {
          id: schema.categories.id,
          name: schema.categories.name,
        },
        community: {
          id: schema.communities.id,
          name: schema.communities.name,
          logoUrl: schema.communities.logoUrl,
        },
      })
      .from(schema.tournaments)
      .leftJoin(
        schema.categories,
        eq(schema.tournaments.categoryId, schema.categories.id),
      )
      .leftJoin(
        schema.communities,
        eq(schema.tournaments.communityId, schema.communities.id),
      )
      .where(
        and(
          inArray(schema.tournaments.id, ids),
          sql`${schema.tournaments.deletedAt} IS NULL`,
        ),
      )
      .orderBy(desc(schema.tournaments.createdAt));

    return await Promise.all(
      rows.map(async (r) => {
        const [participantCount] = await this.db
          .select({ count: count() })
          .from(schema.tournamentParticipants)
          .where(
            and(
              eq(schema.tournamentParticipants.tournamentId, r.tournament.id),
              ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
              ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
              ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
            ),
          );

        const pCount = participantCount?.count || 0;
        return {
          ...r.tournament,
          category: r.category?.id ? r.category : null,
          community: r.community?.id ? r.community : null,
          participantCount: pCount,
          _count: {
            participants: pCount,
          },
          _summary: {
            participantCount: pCount,
          },
        };
      }),
    );
  }
  async findMyManagementTournaments(
    userId: string,
    query: QueryMyManagementTournamentsDto,
  ) {
    const limit = Math.min(Math.max(Number(query.limit ?? 9), 1), 9);
    const offset =
      query.offset === undefined ? null : Math.max(Number(query.offset), 0);
    const windowSize = offset === null ? limit + 1 : offset + limit + 1;
    const useOffsetPagination = offset !== null;
    const decodedCursor = query.cursor
      ? CursorPaginationHelper.decodeCursor<{
          id?: string;
          createdAt?: string;
        }>(query.cursor)
      : null;
    const cursorDate = decodedCursor?.createdAt
      ? new Date(decodedCursor.createdAt)
      : null;
    const hasValidCursor =
      !useOffsetPagination &&
      Boolean(
        decodedCursor?.id && cursorDate && !Number.isNaN(cursorDate.getTime()),
      );
    const completedOnly =
      String(query.status ?? '').toUpperCase() === 'COMPLETED';

    const parentBaseConditions: SQL[] = [
      eq(schema.parentTournaments.createdBy, userId),
      isNull(schema.parentTournaments.deletedAt),
    ];
    // This endpoint feeds the organizer management dashboard. Being listed
    // in a roster is participation access, not management access; only the
    // owner or an explicitly assigned co-organizer belongs in this scope.
    const standaloneAccessCondition = or(
      eq(schema.tournaments.createdBy, userId),
      sql`exists (
        select 1
        from ${schema.tournamentStaff} ts
        where ts.tournament_id = ${schema.tournaments.id}
          and ts.user_id = ${userId}
          and ts.role = 'CO_ORGANIZER'
      )`,
    ) as SQL;
    const standaloneBaseConditions: SQL[] = [
      isNull(schema.tournaments.parentId),
      isNull(schema.tournaments.deletedAt),
      standaloneAccessCondition,
    ];

    // Parent tournaments do not store a lifecycle status. They are completed
    // only when they have active child tournaments and every child is complete.
    // Keep this predicate in both page and count queries so cursor metadata
    // describes the same filtered collection that is returned.
    const completedParentCondition = sql`exists (
      select 1
      from "tournaments" child_tournament
      where child_tournament.parent_id = ${schema.parentTournaments.id}
        and child_tournament.deleted_at is null
    ) and not exists (
      select 1
      from "tournaments" child_tournament
      where child_tournament.parent_id = ${schema.parentTournaments.id}
        and child_tournament.deleted_at is null
        and child_tournament.status <> 'COMPLETED'
    )`;

    if (completedOnly) {
      parentBaseConditions.push(completedParentCondition);
      standaloneBaseConditions.push(eq(schema.tournaments.status, 'COMPLETED'));
    }

    if (hasValidCursor && cursorDate && decodedCursor?.id) {
      parentBaseConditions.push(
        or(
          lt(schema.parentTournaments.createdAt, cursorDate),
          and(
            eq(schema.parentTournaments.createdAt, cursorDate),
            lt(schema.parentTournaments.id, decodedCursor.id),
          ),
        ) as SQL,
      );
      standaloneBaseConditions.push(
        or(
          lt(schema.tournaments.createdAt, cursorDate),
          and(
            eq(schema.tournaments.createdAt, cursorDate),
            lt(schema.tournaments.id, decodedCursor.id),
          ),
        ) as SQL,
      );
    }

    const parentCountConditions: SQL[] = [
      eq(schema.parentTournaments.createdBy, userId),
      isNull(schema.parentTournaments.deletedAt),
    ];
    const standaloneCountConditions: SQL[] = [
      isNull(schema.tournaments.parentId),
      isNull(schema.tournaments.deletedAt),
      standaloneAccessCondition,
    ];

    if (completedOnly) {
      parentCountConditions.push(completedParentCondition);
      standaloneCountConditions.push(
        eq(schema.tournaments.status, 'COMPLETED'),
      );
    }

    const [parentRows, standaloneRows, parentTotal, standaloneTotal] =
      await Promise.all([
        this.db
          .select()
          .from(schema.parentTournaments)
          .where(and(...parentBaseConditions))
          .orderBy(
            desc(schema.parentTournaments.createdAt),
            desc(schema.parentTournaments.id),
          )
          .limit(windowSize),
        this.db
          .select({
            tournament: schema.tournaments,
            category: {
              id: schema.categories.id,
              name: schema.categories.name,
            },
            community: {
              id: schema.communities.id,
              name: schema.communities.name,
              logoUrl: schema.communities.logoUrl,
            },
          })
          .from(schema.tournaments)
          .leftJoin(
            schema.categories,
            eq(schema.tournaments.categoryId, schema.categories.id),
          )
          .leftJoin(
            schema.communities,
            eq(schema.tournaments.communityId, schema.communities.id),
          )
          .where(and(...standaloneBaseConditions))
          .orderBy(
            desc(schema.tournaments.createdAt),
            desc(schema.tournaments.id),
          )
          .limit(windowSize),
        this.db
          .select({ count: count() })
          .from(schema.parentTournaments)
          .where(and(...parentCountConditions)),
        this.db
          .select({ count: count() })
          .from(schema.tournaments)
          .where(and(...standaloneCountConditions)),
      ]);

    const parentItems = parentRows.map((parent) => ({
      itemType: 'PARENT' as const,
      ...parent,
      divisions: [] as unknown[],
    }));
    const standaloneItems = standaloneRows.map((row) => ({
      itemType: 'STANDALONE' as const,
      ...row.tournament,
      category: row.category?.id ? row.category : null,
      community: row.community?.id ? row.community : null,
    }));

    const candidates = [...parentItems, ...standaloneItems].sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      if (bTime !== aTime) return bTime - aTime;
      return b.id === a.id ? 0 : b.id > a.id ? 1 : -1;
    });
    const total =
      Number(parentTotal?.[0]?.count ?? 0) +
      Number(standaloneTotal?.[0]?.count ?? 0);
    const hasMore =
      offset === null ? candidates.length > limit : offset + limit < total;
    const pageItems =
      offset === null
        ? hasMore
          ? candidates.slice(0, limit)
          : candidates
        : candidates.slice(offset, offset + limit);

    const visibleStandaloneIds = pageItems
      .filter((item) => item.itemType === 'STANDALONE')
      .map((item) => item.id);
    const visibleParentIds = pageItems
      .filter((item) => item.itemType === 'PARENT')
      .map((item) => item.id);

    // The organizer card needs a small division preview. Load all visible
    // previews in batches so the web page does not fan out into one detail or
    // division request per card.
    const [
      parentChildRows,
      standaloneParticipantCounts,
      standaloneDivisionRows,
    ] = await Promise.all([
      visibleParentIds.length
        ? this.db
            .select({
              tournament: schema.tournaments,
              category: {
                id: schema.categories.id,
                name: schema.categories.name,
              },
            })
            .from(schema.tournaments)
            .leftJoin(
              schema.categories,
              eq(schema.tournaments.categoryId, schema.categories.id),
            )
            .where(
              and(
                inArray(schema.tournaments.parentId, visibleParentIds),
                isNull(schema.tournaments.deletedAt),
                notInArray(schema.tournaments.status, [
                  'PENDING_APPROVAL',
                  'SUSPENDED',
                  'CANCELLED',
                  'PENDING_DELETE',
                  'pending_delete',
                ]),
              ),
            )
            .orderBy(
              asc(schema.tournaments.createdAt),
              asc(schema.tournaments.id),
            )
        : Promise.resolve([]),
      visibleStandaloneIds.length
        ? this.db
            .select({
              tournamentId: schema.tournamentParticipants.tournamentId,
              count: count(),
            })
            .from(schema.tournamentParticipants)
            .where(
              and(
                inArray(
                  schema.tournamentParticipants.tournamentId,
                  visibleStandaloneIds,
                ),
                notInArray(schema.tournamentParticipants.teamStatus, [
                  'REJECTED',
                  'WITHDRAWN',
                  'KICKED',
                  'EXPIRED',
                  'CANCELLED',
                ]),
              ),
            )
            .groupBy(schema.tournamentParticipants.tournamentId)
        : Promise.resolve([]),
      visibleStandaloneIds.length
        ? this.db
            .select({ division: schema.tournamentDivisions })
            .from(schema.tournamentDivisions)
            .where(
              inArray(
                schema.tournamentDivisions.tournamentId,
                visibleStandaloneIds,
              ),
            )
            .orderBy(
              asc(schema.tournamentDivisions.createdAt),
              asc(schema.tournamentDivisions.id),
            )
        : Promise.resolve([]),
    ]);

    const parentChildIds = parentChildRows.map((row) => row.tournament.id);
    const standaloneDivisionIds = standaloneDivisionRows.map(
      (row) => row.division.id,
    );
    const [parentParticipantCounts, divisionParticipantCounts] =
      await Promise.all([
        parentChildIds.length
          ? this.db
              .select({
                tournamentId: schema.tournamentParticipants.tournamentId,
                count: count(),
              })
              .from(schema.tournamentParticipants)
              .where(
                and(
                  inArray(
                    schema.tournamentParticipants.tournamentId,
                    parentChildIds,
                  ),
                  notInArray(schema.tournamentParticipants.teamStatus, [
                    'REJECTED',
                    'WITHDRAWN',
                    'KICKED',
                  ]),
                ),
              )
              .groupBy(schema.tournamentParticipants.tournamentId)
          : Promise.resolve([]),
        standaloneDivisionIds.length
          ? this.db
              .select({
                divisionId: schema.tournamentParticipants.tournamentDivisionId,
                count: count(),
              })
              .from(schema.tournamentParticipants)
              .where(
                and(
                  inArray(
                    schema.tournamentParticipants.tournamentDivisionId,
                    standaloneDivisionIds,
                  ),
                  notInArray(schema.tournamentParticipants.teamStatus, [
                    'REJECTED',
                    'WITHDRAWN',
                    'KICKED',
                    'EXPIRED',
                    'CANCELLED',
                  ]),
                ),
              )
              .groupBy(schema.tournamentParticipants.tournamentDivisionId)
          : Promise.resolve([]),
      ]);

    const countByTournamentId = new Map<string, number>();
    for (const row of [
      ...standaloneParticipantCounts,
      ...parentParticipantCounts,
    ]) {
      countByTournamentId.set(row.tournamentId, Number(row.count ?? 0));
    }
    const countByDivisionId = new Map<string, number>();
    for (const row of divisionParticipantCounts) {
      if (row.divisionId) {
        countByDivisionId.set(row.divisionId, Number(row.count ?? 0));
      }
    }

    const childrenByParentId = new Map<string, typeof parentChildRows>();
    for (const row of parentChildRows) {
      const parentId = row.tournament.parentId;
      if (!parentId) continue;
      const children = childrenByParentId.get(parentId) ?? [];
      children.push(row);
      childrenByParentId.set(parentId, children);
    }
    const divisionsByTournamentId = new Map<
      string,
      typeof standaloneDivisionRows
    >();
    for (const row of standaloneDivisionRows) {
      const tournamentId = row.division.tournamentId;
      const divisions = divisionsByTournamentId.get(tournamentId) ?? [];
      divisions.push(row);
      divisionsByTournamentId.set(tournamentId, divisions);
    }

    const data = pageItems.map((item) => {
      if (item.itemType === 'PARENT') {
        const divisions = (childrenByParentId.get(item.id) ?? []).map((row) => {
          const participantCount =
            countByTournamentId.get(row.tournament.id) ?? 0;
          return {
            ...row.tournament,
            category: row.category?.id ? row.category : null,
            participantCount,
            _count: { participants: participantCount },
            _summary: { participantCount },
          };
        });
        return { ...item, divisions };
      }

      const participantCount = countByTournamentId.get(item.id) ?? 0;
      const configuredDivisions = divisionsByTournamentId.get(item.id) ?? [];
      const divisions = configuredDivisions.map((row) => {
        const division = row.division;
        const divisionParticipantCount =
          countByDivisionId.get(division.id) ?? 0;
        return {
          ...division,
          participantCount: divisionParticipantCount,
          _count: { participants: divisionParticipantCount, matches: 0 },
          _summary: { participantCount: divisionParticipantCount },
        };
      });

      return {
        ...item,
        participantCount,
        _count: { participants: participantCount },
        _summary: { participantCount },
        // A standalone tournament without configured sub-divisions is itself
        // the card's only division. This preserves the old UI fallback without
        // a follow-up GET /divisions request.
        divisions: divisions.length
          ? divisions
          : [{ ...item, participantCount, _summary: { participantCount } }],
      };
    });
    const lastItem = data[data.length - 1];
    const page = offset === null ? 1 : Math.floor(offset / limit) + 1;

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        nextCursor:
          offset === null && hasMore && lastItem
            ? CursorPaginationHelper.encodeCursor({
                id: lastItem.id,
                createdAt: lastItem.createdAt,
              })
            : null,
        hasMore,
      },
    };
  }
  async findMyWorkspace(userId: string, includeRefereeMatches = true) {
    const tournamentSummarySelect = {
      id: schema.tournaments.id,
      name: schema.tournaments.name,
      status: schema.tournaments.status,
      startDate: schema.tournaments.startDate,
      endDate: schema.tournaments.endDate,
      registrationEndDate: schema.tournaments.registrationEndDate,
      locationAddress: schema.tournamentVenues.locationAddress,
      city: schema.tournaments.city,
      matchType: schema.tournaments.matchType,
      tournamentType: schema.tournaments.tournamentType,
      logoUrl: schema.tournaments.logoUrl,
      categoryId: schema.tournaments.categoryId,
      communityId: schema.tournaments.communityId,
      tournamentConfig: schema.tournaments.tournamentConfig,
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
    } as const;

    const [
      organizedRaw,
      participatingRaw,
      coOrganizerRaw,
      refereeInvites,
      refereeTournaments,
      refereeMatchesRaw,
    ] = await Promise.all([
      this.db
        .select(tournamentSummarySelect)
        .from(schema.tournaments)
        .leftJoin(
          schema.categories,
          eq(schema.tournaments.categoryId, schema.categories.id),
        )
        .leftJoin(
          schema.communities,
          eq(schema.tournaments.communityId, schema.communities.id),
        )
        .leftJoin(
          schema.tournamentVenues,
          eq(schema.tournaments.venueId, schema.tournamentVenues.id),
        )
        .where(
          and(
            eq(schema.tournaments.createdBy, userId),
            isNull(schema.tournaments.deletedAt),
          ),
        )
        .orderBy(desc(schema.tournaments.updatedAt)),
      this.db
        .select(tournamentSummarySelect)
        .from(schema.tournamentRosters)
        .innerJoin(
          schema.tournamentParticipants,
          eq(
            schema.tournamentRosters.participantId,
            schema.tournamentParticipants.id,
          ),
        )
        .innerJoin(
          schema.tournaments,
          eq(schema.tournamentParticipants.tournamentId, schema.tournaments.id),
        )
        .leftJoin(
          schema.categories,
          eq(schema.tournaments.categoryId, schema.categories.id),
        )
        .leftJoin(
          schema.communities,
          eq(schema.tournaments.communityId, schema.communities.id),
        )
        .leftJoin(
          schema.tournamentVenues,
          eq(schema.tournaments.venueId, schema.tournamentVenues.id),
        )
        .where(
          and(
            eq(schema.tournamentRosters.userId, userId),
            isNull(schema.tournaments.deletedAt),
          ),
        )
        .orderBy(desc(schema.tournaments.updatedAt)),
      this.db
        .select(tournamentSummarySelect)
        .from(schema.tournamentStaff)
        .innerJoin(
          schema.tournaments,
          eq(schema.tournamentStaff.tournamentId, schema.tournaments.id),
        )
        .leftJoin(
          schema.categories,
          eq(schema.tournaments.categoryId, schema.categories.id),
        )
        .leftJoin(
          schema.communities,
          eq(schema.tournaments.communityId, schema.communities.id),
        )
        .leftJoin(
          schema.tournamentVenues,
          eq(schema.tournaments.venueId, schema.tournamentVenues.id),
        )
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
        .innerJoin(
          schema.tournaments,
          eq(schema.tournamentReferees.tournamentId, schema.tournaments.id),
        )
        .leftJoin(
          schema.categories,
          eq(schema.tournaments.categoryId, schema.categories.id),
        )
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
        .innerJoin(
          schema.tournaments,
          eq(schema.tournamentReferees.tournamentId, schema.tournaments.id),
        )
        .leftJoin(
          schema.categories,
          eq(schema.tournaments.categoryId, schema.categories.id),
        )
        .where(
          and(
            eq(schema.tournamentReferees.userId, userId),
            eq(schema.tournamentReferees.status, 'ACCEPTED'),
            isNull(schema.tournaments.deletedAt),
          ),
        )
        .orderBy(desc(schema.tournamentReferees.createdAt)),
      includeRefereeMatches
        ? this.db
            .select({
              id: schema.matches.id,
              tournamentId: schema.tournaments.id,
              tournamentName: schema.tournaments.name,
              logoUrl: schema.tournaments.logoUrl,
              categoryName: schema.categories.name,
              venueName: schema.tournamentVenues.name,
              venueAddress: schema.tournamentVenues.locationAddress,
              city: schema.tournaments.city,
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
            .innerJoin(
              schema.tournamentStages,
              eq(schema.matches.stageId, schema.tournamentStages.id),
            )
            .innerJoin(
              schema.tournamentGroups,
              eq(schema.matches.groupId, schema.tournamentGroups.id),
            )
            .innerJoin(
              schema.tournaments,
              eq(schema.tournamentStages.tournamentId, schema.tournaments.id),
            )
            .leftJoin(
              schema.categories,
              eq(schema.tournaments.categoryId, schema.categories.id),
            )
            .leftJoin(
              schema.tournamentVenues,
              eq(schema.tournaments.venueId, schema.tournamentVenues.id),
            )
            .where(
              and(
                eq(schema.matches.refereeId, userId),
                isNull(schema.matches.deletedAt),
                isNull(schema.tournaments.deletedAt),
              ),
            )
            .orderBy(
              asc(schema.matches.scheduledAt),
              asc(schema.matches.roundNumber),
              asc(schema.matches.matchOrder),
            )
        : Promise.resolve([]),
    ]);

    const organizedIds = new Set(
      organizedRaw.map((tournament) => tournament.id),
    );
    const dedupeByTournamentId = <T extends { id: string }>(items: T[]) => {
      const map = new Map<string, T>();
      for (const item of items) {
        if (!map.has(item.id)) {
          map.set(item.id, item);
        }
      }
      return Array.from(map.values());
    };

    const participantIds = includeRefereeMatches
      ? Array.from(
          new Set(
            refereeMatchesRaw.flatMap((match) =>
              [match.participant1Id, match.participant2Id].filter(
                (id): id is string => Boolean(id),
              ),
            ),
          ),
        )
      : [];

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

    const participantsMap = new Map(
      participants.map((participant) => [participant.id, participant.teamName]),
    );

    return {
      organizedTournaments: dedupeByTournamentId(organizedRaw),
      participatingTournaments: dedupeByTournamentId(
        participatingRaw.filter(
          (tournament) => !organizedIds.has(tournament.id),
        ),
      ),
      coOrganizerTournaments: dedupeByTournamentId(
        coOrganizerRaw.filter((tournament) => !organizedIds.has(tournament.id)),
      ),
      refereeInvites,
      refereeTournaments,
      refereeMatches: refereeMatchesRaw.map((match) => ({
        ...match,
        participant1Name: match.participant1Id
          ? (participantsMap.get(match.participant1Id) ?? null)
          : null,
        participant2Name: match.participant2Id
          ? (participantsMap.get(match.participant2Id) ?? null)
          : null,
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
      const [oldRecord] = await tx
        .select()
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, id))
        .limit(1);

      const [updated] = await tx
        .update(schema.tournaments)
        .set({ inviteCode: newCode, updatedAt: new Date() })
        .where(eq(schema.tournaments.id, id))
        .returning();

      await this.auditService.logUpdate(
        tx,
        userId,
        'tournaments',
        id,
        oldRecord,
        updated,
      );
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
      await this.auditService.logCreate(
        tx,
        userId,
        'parent_tournaments',
        record.id,
        record,
      );
      return record;
    });
  }
  async updateParent(
    id: string,
    userId: string,
    data: UpdateParentTournamentDto,
  ) {
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
          ...(data.description !== undefined && {
            description: data.description,
          }),
          ...(data.bannerUrl !== undefined && { bannerUrl: data.bannerUrl }),
          ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
          updatedAt: new Date(),
        })
        .where(eq(schema.parentTournaments.id, id))
        .returning();

      await this.auditService.logUpdate(
        tx,
        userId,
        'parent_tournaments',
        id,
        oldRecord,
        updated,
      );
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
          sql`${schema.parentTournaments.deletedAt} IS NULL`,
        ),
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
        tournamentType: schema.tournaments.tournamentType,
        isRanked: schema.tournaments.isRanked,
        tournamentConfig: schema.tournaments.tournamentConfig,
        sportRules: schema.tournaments.sportRules,
        entryFee: schema.tournaments.entryFee,
        maxParticipants: schema.tournaments.maxParticipants,
        bannerUrl: schema.tournaments.bannerUrl,
        logoUrl: schema.tournaments.logoUrl,
        createdAt: schema.tournaments.createdAt,
        updatedAt: schema.tournaments.updatedAt,
        category: {
          id: schema.categories.id,
          name: schema.categories.name,
        },
      })
      .from(schema.tournaments)
      .leftJoin(
        schema.categories,
        eq(schema.tournaments.categoryId, schema.categories.id),
      )
      .where(
        and(
          eq(schema.tournaments.parentId, id),
          sql`${schema.tournaments.deletedAt} IS NULL`,
          sql`${schema.tournaments.status} NOT IN ('PENDING_APPROVAL', 'SUSPENDED', 'CANCELLED', 'PENDING_DELETE', 'pending_delete')`,
        ),
      )
      .orderBy(asc(schema.tournaments.createdAt));

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
              ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
            ),
          );

        const countVal = pCount?.count || 0;
        return {
          ...div,
          participantCount: countVal,
          _count: {
            participants: countVal,
          },
          _summary: {
            participantCount: countVal,
          },
        };
      }),
    );

    return {
      ...parent,
      divisions,
      _aggregation: {
        totalDivisions: divisions.length,
        totalParticipants: divisions.reduce(
          (sum, d) => sum + (d._summary?.participantCount || 0),
          0,
        ),
        divisionStatuses: divisions.map((d) => ({
          name: d.name,
          status: d.status,
        })),
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
          sql`${schema.tournaments.deletedAt} IS NULL`,
        ),
      );
  }
  async findParentsByUser(userId: string) {
    return await this.db
      .select()
      .from(schema.parentTournaments)
      .where(
        and(
          eq(schema.parentTournaments.createdBy, userId),
          sql`${schema.parentTournaments.deletedAt} IS NULL`,
        ),
      )
      .orderBy(desc(schema.parentTournaments.createdAt));
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

      await this.auditService.logDelete(
        tx,
        userId,
        'parent_tournaments',
        id,
        oldRecord,
      );
      return deleted;
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
          sql`${schema.tournaments.deletedAt} IS NULL`,
        ),
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
              ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
            ),
          );
        return result?.count || 0;
      }),
    );

    const totalParticipants = participantCounts.reduce((sum, c) => sum + c, 0);
    const statuses = children.map((c) => c.status);

    return {
      totalParticipants,
      divisionCount: children.length,
      statuses,
    };
  }
}
