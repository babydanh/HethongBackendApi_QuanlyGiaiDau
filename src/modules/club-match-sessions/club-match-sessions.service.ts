import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import * as schema from '../../database/schema';
import { LiveScoreGateway } from '../matches/live-score.gateway';
import { UpdateMatchScoreDto } from '../matches/dto/update-match-score.dto';
import { EloOutboxProcessor } from '../rankings/elo-outbox.processor';
import { RankingsService } from '../rankings/rankings.service';
import {
  CreateClubMatchDto,
  CreateClubMatchMockParticipantDto,
  CreateClubStandaloneMatchDto,
  CreateClubMatchSessionDto,
  ForceClubMatchParticipantsDto,
  QueryClubMatchChildrenDto,
  QueryClubMatchSessionsDto,
  QueryClubStandaloneMatchesDto,
  RemoveClubMatchParticipantDto,
  TransitionClubMatchSessionDto,
  UpdateClubMatchPreferencesDto,
  UpdateClubMatchSessionDto,
} from './dto/club-match-session.dto';
import { ClubMatchSessionsRepository } from './club-match-sessions.repository';
import { selectScoringPreset } from './scoring-preset';

type Actor = { id: string; roles?: string[] };

const MANAGER_ROLES = new Set(['OWNER', 'ADMIN', 'MODERATOR']);
const TERMINAL_SESSION_STATUSES = new Set(['ENDED', 'CANCELLED']);
function calculateNextRecurringDate(
  frequency: string,
  daysOfWeek: number[] | number,
  timeOfDay: string,
  fromDate = new Date(),
): Date {
  const [hours, minutes] = (timeOfDay || '18:00').split(':').map(Number);
  const target = new Date(fromDate);
  target.setHours(hours, minutes, 0, 0);
  if (frequency === 'DAILY') {
    target.setDate(target.getDate() + 1);
    return target;
  }
  if (frequency === 'MONTHLY') {
    target.setMonth(target.getMonth() + 1);
    return target;
  }
  const days = Array.isArray(daysOfWeek)
    ? daysOfWeek.length > 0
      ? daysOfWeek
      : [6]
    : [daysOfWeek];
  const currentDay = fromDate.getDay();
  const isTodayPast = fromDate.getTime() >= target.getTime();
  let minDaysAhead = 999;
  for (const day of days) {
    let diff = (day - currentDay + 7) % 7;
    if (diff === 0 && isTodayPast) diff = frequency === 'BIWEEKLY' ? 14 : 7;
    if (diff > 0 && diff < minDaysAhead) minDaysAhead = diff;
  }
  target.setDate(
    fromDate.getDate() + (minDaysAhead === 999 ? 7 : minDaysAhead),
  );
  target.setHours(hours, minutes, 0, 0);
  return target;
}

function apiError(
  ExceptionType:
    | typeof BadRequestException
    | typeof ConflictException
    | typeof ForbiddenException
    | typeof NotFoundException,
  code: string,
  details?: Record<string, unknown>,
): never {
  throw new ExceptionType({ code, ...details });
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

@Injectable()
export class ClubMatchSessionsService {
  constructor(
    private readonly repository: ClubMatchSessionsRepository,
    private readonly liveScoreGateway: LiveScoreGateway,
    private readonly eloOutboxProcessor: EloOutboxProcessor,
    private readonly rankingsService: RankingsService,
  ) {
    this.eloOutboxProcessor.setClubMatchUpdatePublisher?.(async (matchId) => {
      const match = await this.repository.findMatch(matchId);
      const projected = await this.repository.projectMatch(matchId);
      if (match && projected) {
        this.liveScoreGateway.broadcastClubSessionMatchUpdate(
          match.sessionId,
          matchId,
          projected,
          'elo:update',
        );
      }
    });
    this.eloOutboxProcessor.setStandaloneMatchUpdatePublisher?.(async (matchId) => {
      const projected = await this.repository.projectStandaloneMatch(matchId);
      if (projected) {
        this.liveScoreGateway.broadcastClubStandaloneMatchUpdate(
          matchId,
          projected,
          'elo:update',
        );
      }
    });
  }

  private isPlatformAdmin(actor: Actor): boolean {
    return Boolean(actor.roles?.some((role) => role === 'ADMIN'));
  }

  private async requireCommunityAccess(communityId: string, actor: Actor) {
    const context = await this.repository.findCommunityContext(
      communityId,
      actor.id,
    );
    if (!context || context.status !== 'ACTIVE') {
      apiError(NotFoundException, 'CLUB_NOT_FOUND');
    }
    if (!this.isPlatformAdmin(actor) && context.memberStatus !== 'JOINED') {
      apiError(ForbiddenException, 'CLUB_ACTIVE_MEMBERSHIP_REQUIRED');
    }
    return context;
  }

  private async requireManager(communityId: string, actor: Actor) {
    const context = await this.requireCommunityAccess(communityId, actor);
    if (
      !this.isPlatformAdmin(actor) &&
      !MANAGER_ROLES.has(context.memberRole ?? '')
    ) {
      apiError(ForbiddenException, 'CLUB_MANAGER_REQUIRED');
    }
    return context;
  }

  private async requireSession(sessionId: string, actor: Actor) {
    const row = await this.repository.findSession(sessionId);
    if (!row) apiError(NotFoundException, 'CLUB_MATCH_SESSION_NOT_FOUND');
    await this.requireCommunityAccess(row.session.communityId, actor);
    return row;
  }

  private validateMaxSets(dto: UpdateMatchScoreDto) {
    if (dto.p1SetsWon > 10 || dto.p2SetsWon > 10) {
      apiError(BadRequestException, 'MATCH_MAX_SETS_EXCEEDED', {
        maxSets: 10,
      });
    }
    const sets = dto.scoreDetails?.sets;
    if (Array.isArray(sets) && sets.length > 10) {
      apiError(BadRequestException, 'MATCH_MAX_SETS_EXCEEDED', {
        maxSets: 10,
      });
    }
  }

  private resolveName(
    name: string | null,
    communityName: string,
    locale?: string,
  ): string {
    if (name?.trim()) return name.trim();
    return locale?.toLowerCase().startsWith('en')
      ? `Club social match session ${communityName}`
      : `Buổi giao lưu CLB ${communityName}`;
  }

  private projectSession(
    row: Awaited<ReturnType<ClubMatchSessionsRepository['findSession']>>,
    locale?: string,
    canManage = false,
  ) {
    if (!row) return null;
    return {
      ...row.session,
      registrationMode: 'MIXED' as const,
      resolvedName: this.resolveName(
        row.session.name,
        row.communityName,
        locale,
      ),
      category: {
        id: row.session.categoryId,
        name: row.categoryName,
        slug: row.categorySlug,
        config: row.categoryConfig,
      },
      capabilities: {
        pairingMode: 'FREE',
        bracket: false,
        registrationOpenImmediately: true,
        canManage,
      },
    };
  }

  async create(actor: Actor, dto: CreateClubMatchSessionDto, locale?: string) {
    const community = await this.requireManager(dto.communityId, actor);
    if (!community.categoryId) {
      apiError(BadRequestException, 'CLUB_SPORT_REQUIRED');
    }
    if (dto.categoryId && dto.categoryId !== community.categoryId) {
      apiError(BadRequestException, 'CATEGORY_NOT_ALLOWED_FOR_CLUB');
    }
    let startAt = dto.startAt ? new Date(dto.startAt) : null;
    let endAt = dto.endAt ? new Date(dto.endAt) : null;
    if (startAt && endAt && endAt < startAt) {
      apiError(BadRequestException, 'INVALID_SESSION_DATE_RANGE');
    }
    let sessionConfig: Record<string, unknown> = {};
    if (dto.isRecurring) {
      const frequency = dto.recurringFrequency ?? 'WEEKLY';
      const timeOfDay = dto.recurringTimeOfDay ?? '18:00';
      const daysOfWeek = dto.recurringDaysOfWeek?.length
        ? dto.recurringDaysOfWeek
        : [dto.recurringDayOfWeek ?? startAt?.getDay() ?? 6];
      const requestedStart =
        startAt && !Number.isNaN(startAt.getTime()) ? startAt : null;
      const firstEventAt =
        requestedStart && requestedStart.getTime() > Date.now()
          ? requestedStart
          : calculateNextRecurringDate(frequency, daysOfWeek, timeOfDay);
      const durationMinutes =
        startAt && endAt
          ? Math.max(
              1,
              Math.round((endAt.getTime() - startAt.getTime()) / 60000),
            )
          : 60;
      startAt = firstEventAt;
      endAt = new Date(firstEventAt.getTime() + durationMinutes * 60000);
      const advanceDays = dto.recurringAdvanceDays ?? 0;
      const nextRunAt = new Date(
        firstEventAt.getTime() - advanceDays * 86400000,
      );
      sessionConfig = {
        recurring: {
          enabled: true,
          frequency,
          dayOfWeek: daysOfWeek[0],
          daysOfWeek,
          timeOfDay,
          advanceDays,
          durationMinutes,
          templateName: dto.name?.trim() || null,
          nextRunAt: nextRunAt.toISOString(),
          nextEventAt: firstEventAt.toISOString(),
          lastGeneratedAt: new Date().toISOString(),
        },
      };
    }
    const created = await this.repository.createSession({
      communityId: dto.communityId,
      categoryId: community.categoryId,
      createdBy: actor.id,
      name: dto.name?.trim() || null,
      description: dto.description?.trim() || null,
      registrationMode: 'MIXED',
      isRanked: dto.isRanked ?? true,
      maxParticipants: dto.maxParticipants ?? 16,
      sessionConfig,
      startAt,
      endAt,
    });
    return this.get(created.id, actor, locale);
  }

  async list(actor: Actor, query: QueryClubMatchSessionsDto, locale?: string) {
    const access = await this.requireCommunityAccess(query.communityId, actor);
    const canManage =
      this.isPlatformAdmin(actor) || MANAGER_ROLES.has(access.memberRole ?? '');
    const result = await this.repository.listSessions({
      communityId: query.communityId,
      status: query.status,
      cursor: query.cursor,
      limit: query.limit ?? 20,
    });
    if (result.invalidCursor) {
      apiError(BadRequestException, 'INVALID_CURSOR');
    }
    return {
      data: result.items.map((item) => ({
        ...item.session,
        registrationMode: 'MIXED' as const,
        resolvedName: this.resolveName(
          item.session.name,
          item.communityName,
          locale,
        ),
        participantCount: item.participantCount,
        matchCount: item.matchCount,
        capabilities: { canManage },
      })),
      meta: result.meta,
    };
  }

  async get(sessionId: string, actor: Actor, locale?: string) {
    const row = await this.requireSession(sessionId, actor);
    const [membership, viewerParticipant, viewerPreferences] =
      await Promise.all([
        this.repository.findMembership(row.session.communityId, actor.id),
        this.repository.findParticipant(sessionId, actor.id),
        this.repository.findPreference(sessionId, actor.id),
      ]);
    const canManage =
      this.isPlatformAdmin(actor) || MANAGER_ROLES.has(membership?.role ?? '');
    const projected = this.projectSession(row, locale, canManage);
    return projected
      ? {
          ...projected,
          viewerParticipant,
          viewerPreferences,
          capabilities: {
            ...projected.capabilities,
            canJoin:
              row.session.status === 'OPEN' &&
              viewerParticipant?.status !== 'ACTIVE',
            canWithdraw:
              !TERMINAL_SESSION_STATUSES.has(row.session.status) &&
              viewerParticipant?.status === 'ACTIVE' &&
              viewerParticipant.source === 'SELF',
            canCreateMatch:
              ['OPEN', 'LIVE'].includes(row.session.status) &&
              (canManage || viewerParticipant?.status === 'ACTIVE'),
          },
        }
      : null;
  }

  async getLiveMatch(matchId: string, actor: Actor) {
    const match = await this.repository.findMatch(matchId);
    if (match) {
      await this.requireSession(match.sessionId, actor);
      return this.repository.projectMatch(matchId);
    }
    const standalone = await this.repository.findStandaloneMatch(matchId);
    if (!standalone) return null;
    await this.requireCommunityAccess(standalone.communityId, actor);
    return this.repository.projectStandaloneMatch(matchId);
  }

  async update(
    sessionId: string,
    actor: Actor,
    dto: UpdateClubMatchSessionDto,
    locale?: string,
  ) {
    const current = await this.requireSession(sessionId, actor);
    await this.requireManager(current.session.communityId, actor);
    if (TERMINAL_SESSION_STATUSES.has(current.session.status)) {
      apiError(ConflictException, 'SESSION_IS_TERMINAL');
    }
    const startAt =
      dto.startAt === undefined
        ? current.session.startAt
        : dto.startAt
          ? new Date(dto.startAt)
          : null;
    const endAt =
      dto.endAt === undefined
        ? current.session.endAt
        : dto.endAt
          ? new Date(dto.endAt)
          : null;
    if (startAt && endAt && endAt < startAt) {
      apiError(BadRequestException, 'INVALID_SESSION_DATE_RANGE');
    }
    const db = this.repository.getDb();
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(schema.clubMatchSessions)
        .set({
          name:
            dto.name === undefined
              ? current.session.name
              : dto.name?.trim() || null,
          description:
            dto.description === undefined
              ? current.session.description
              : dto.description?.trim() || null,
          registrationMode: 'MIXED',
          isRanked: dto.isRanked ?? current.session.isRanked,
          maxParticipants:
            dto.maxParticipants ?? current.session.maxParticipants,
          startAt,
          endAt,
          updatedAt: new Date(),
          version: sql`${schema.clubMatchSessions.version} + 1`,
        })
        .where(
          and(
            eq(schema.clubMatchSessions.id, sessionId),
            eq(schema.clubMatchSessions.version, dto.version),
            isNull(schema.clubMatchSessions.deletedAt),
          ),
        )
        .returning();
      if (!row) apiError(ConflictException, 'STALE_SESSION_VERSION');
      await this.repository.auditUpdate(
        tx,
        actor.id,
        'club_match_sessions',
        sessionId,
        { version: current.session.version },
        { version: row.version },
      );
      return row;
    });
    return this.get(updated.id, actor, locale);
  }

  async transition(
    sessionId: string,
    actor: Actor,
    dto: TransitionClubMatchSessionDto,
    locale?: string,
  ) {
    const current = await this.requireSession(sessionId, actor);
    await this.requireManager(current.session.communityId, actor);
    const nextStatus =
      dto.action === 'CLOSE'
        ? 'CLOSED'
        : dto.action === 'END'
          ? 'ENDED'
          : 'CANCELLED';
    const allowed =
      (nextStatus === 'CLOSED' &&
        ['OPEN', 'LIVE'].includes(current.session.status)) ||
      (nextStatus === 'ENDED' &&
        ['OPEN', 'LIVE', 'CLOSED'].includes(current.session.status)) ||
      (nextStatus === 'CANCELLED' &&
        !TERMINAL_SESSION_STATUSES.has(current.session.status));
    if (!allowed) apiError(ConflictException, 'INVALID_SESSION_TRANSITION');
    const db = this.repository.getDb();
    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(schema.clubMatchSessions)
        .set({
          status: nextStatus,
          registrationClosedAt:
            nextStatus === 'CLOSED' || nextStatus === 'ENDED'
              ? new Date()
              : current.session.registrationClosedAt,
          endedAt:
            nextStatus === 'ENDED' ? new Date() : current.session.endedAt,
          version: sql`${schema.clubMatchSessions.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.clubMatchSessions.id, sessionId),
            eq(schema.clubMatchSessions.version, dto.version),
          ),
        )
        .returning();
      if (!updated) apiError(ConflictException, 'STALE_SESSION_VERSION');
      if (nextStatus === 'CANCELLED') {
        await tx
          .update(schema.clubMatchSessionMatches)
          .set({
            status: 'CANCELLED',
            eloStatus: 'SKIPPED_CANCELLED',
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.clubMatchSessionMatches.sessionId, sessionId),
              inArray(schema.clubMatchSessionMatches.status, [
                'SCHEDULED',
                'ONGOING',
              ]),
            ),
          );
      }
      await this.repository.auditUpdate(
        tx,
        actor.id,
        'club_match_sessions',
        sessionId,
        { status: current.session.status, version: current.session.version },
        { status: nextStatus, version: updated.version },
      );
    });
    return this.get(sessionId, actor, locale);
  }

  async listParticipants(
    sessionId: string,
    actor: Actor,
    query: QueryClubMatchChildrenDto,
  ) {
    await this.requireSession(sessionId, actor);
    const result = await this.repository.listParticipants(sessionId, {
      // The participant tab and match builder are active-roster surfaces.
      // Keep withdrawn/kicked rows queryable explicitly for audit/history,
      // but never mix them into the default active count/list.
      status: query.status ?? 'ACTIVE',
      cursor: query.cursor,
      limit: query.limit ?? 30,
    });
    if (result.invalidCursor) apiError(BadRequestException, 'INVALID_CURSOR');
    return { data: result.items, meta: result.meta };
  }

  async selfJoin(sessionId: string, actor: Actor) {
    const current = await this.requireSession(sessionId, actor);
    if (current.session.status !== 'OPEN') {
      apiError(ConflictException, 'SESSION_REGISTRATION_CLOSED');
    }
    const db = this.repository.getDb();
    return db.transaction(async (tx) => {
      const lockedSession = await this.repository.findSessionForUpdate(
        sessionId,
        tx,
      );
      if (!lockedSession) apiError(NotFoundException, 'SESSION_NOT_FOUND');
      if (lockedSession.status !== 'OPEN') {
        apiError(ConflictException, 'SESSION_REGISTRATION_CLOSED');
      }
      const existing = await this.repository.findParticipant(
        sessionId,
        actor.id,
        tx,
      );
      if (existing?.status === 'ACTIVE') return existing;
      if (existing?.source === 'MANDATORY') {
        apiError(ConflictException, 'MANDATORY_PARTICIPANT_CANNOT_SELF_CHANGE');
      }
      const activeCount = await this.repository.countActiveParticipants(
        sessionId,
        tx,
      );
      if (activeCount >= lockedSession.maxParticipants) {
        apiError(ConflictException, 'SESSION_CAPACITY_REACHED', {
          maxParticipants: lockedSession.maxParticipants,
        });
      }
      const [participant] = existing
        ? await tx
            .update(schema.clubMatchSessionParticipants)
            .set({
              status: 'ACTIVE',
              withdrawnAt: null,
              updatedAt: new Date(),
              version: sql`${schema.clubMatchSessionParticipants.version} + 1`,
            })
            .where(eq(schema.clubMatchSessionParticipants.id, existing.id))
            .returning()
        : await tx
            .insert(schema.clubMatchSessionParticipants)
            .values({
              sessionId,
              userId: actor.id,
              source: 'SELF',
              status: 'ACTIVE',
            })
            .returning();
      await this.repository.auditUpdate(
        tx,
        actor.id,
        'club_match_session_participants',
        participant.id,
        existing ? { status: existing.status } : {},
        { status: participant.status, source: participant.source },
      );
      return participant;
    });
  }

  async withdraw(sessionId: string, actor: Actor) {
    const current = await this.requireSession(sessionId, actor);
    if (TERMINAL_SESSION_STATUSES.has(current.session.status)) {
      apiError(ConflictException, 'SESSION_IS_TERMINAL');
    }
    const participant = await this.repository.findParticipant(
      sessionId,
      actor.id,
    );
    if (!participant || participant.status !== 'ACTIVE') {
      apiError(NotFoundException, 'ACTIVE_PARTICIPANT_NOT_FOUND');
    }
    if (participant.source === 'MANDATORY') {
      apiError(ForbiddenException, 'MANDATORY_PARTICIPANT_CANNOT_WITHDRAW');
    }
    const db = this.repository.getDb();
    return db.transaction(async (tx) => {
      const activeMatches = await tx
        .select({ id: schema.clubMatchSessionMatches.id })
        .from(schema.clubMatchSessionMatches)
        .where(
          and(
            eq(schema.clubMatchSessionMatches.sessionId, sessionId),
            inArray(schema.clubMatchSessionMatches.status, [
              'SCHEDULED',
              'ONGOING',
            ]),
            isNull(schema.clubMatchSessionMatches.deletedAt),
          ),
        );
      if (
        activeMatches.length > 0 &&
        (
          await Promise.all(
            activeMatches.map((match) =>
              this.repository.findMatch(match.id, tx),
            ),
          )
        ).some(
          (match) =>
            match &&
            [...match.sideAUserIds, ...match.sideBUserIds].includes(actor.id),
        )
      ) {
        apiError(ConflictException, 'PARTICIPANT_HAS_ACTIVE_MATCH');
      }
      const [updated] = await tx
        .update(schema.clubMatchSessionParticipants)
        .set({
          status: 'WITHDRAWN',
          withdrawnAt: new Date(),
          updatedAt: new Date(),
          version: sql`${schema.clubMatchSessionParticipants.version} + 1`,
        })
        .where(
          and(
            eq(schema.clubMatchSessionParticipants.id, participant.id),
            eq(
              schema.clubMatchSessionParticipants.version,
              participant.version,
            ),
          ),
        )
        .returning();
      if (!updated) apiError(ConflictException, 'STALE_PARTICIPANT_VERSION');
      await this.repository.auditUpdate(
        tx,
        actor.id,
        'club_match_session_participants',
        participant.id,
        { status: 'ACTIVE' },
        { status: 'WITHDRAWN' },
      );
      return updated;
    });
  }

  async forceParticipants(
    sessionId: string,
    actor: Actor,
    dto: ForceClubMatchParticipantsDto,
    idempotencyKey?: string,
  ) {
    if (!idempotencyKey?.trim()) {
      apiError(BadRequestException, 'IDEMPOTENCY_KEY_REQUIRED');
    }
    const current = await this.requireSession(sessionId, actor);
    await this.requireManager(current.session.communityId, actor);
    if (current.session.status !== 'OPEN') {
      apiError(ConflictException, 'SESSION_REGISTRATION_CLOSED');
    }
    const userIds = uniqueSorted(dto.userIds);
    const request = { sessionId, userIds };
    const db = this.repository.getDb();
    return db.transaction(async (tx) => {
      const replay = await this.repository.findCommand(tx, {
        actorId: actor.id,
        operation: 'FORCE_PARTICIPANTS',
        idempotencyKey: idempotencyKey.trim(),
        request,
      });
      if (replay) {
        if (!replay.sameRequest)
          apiError(ConflictException, 'IDEMPOTENCY_KEY_REUSED');
        return replay.result;
      }
      const lockedSession = await this.repository.findSessionForUpdate(
        sessionId,
        tx,
      );
      if (!lockedSession) apiError(NotFoundException, 'SESSION_NOT_FOUND');
      if (lockedSession.status !== 'OPEN') {
        apiError(ConflictException, 'SESSION_REGISTRATION_CLOSED');
      }
      const members = await tx
        .select({ userId: schema.communityMembers.userId })
        .from(schema.communityMembers)
        .where(
          and(
            eq(
              schema.communityMembers.communityId,
              current.session.communityId,
            ),
            eq(schema.communityMembers.status, 'JOINED'),
            inArray(schema.communityMembers.userId, userIds),
          ),
        );
      if (members.length !== userIds.length) {
        apiError(
          BadRequestException,
          'ALL_PARTICIPANTS_MUST_BE_ACTIVE_CLUB_MEMBERS',
        );
      }
      const activeCount = await this.repository.countActiveParticipants(
        sessionId,
        tx,
      );
      let newActiveCount = 0;
      for (const userId of userIds) {
        const existing = await this.repository.findParticipant(
          sessionId,
          userId,
          tx,
        );
        if (existing?.status !== 'ACTIVE') newActiveCount += 1;
      }
      if (activeCount + newActiveCount > lockedSession.maxParticipants) {
        apiError(ConflictException, 'SESSION_CAPACITY_REACHED', {
          maxParticipants: lockedSession.maxParticipants,
          activeCount,
        });
      }
      const assigned = [] as Array<
        typeof schema.clubMatchSessionParticipants.$inferSelect
      >;
      for (const userId of userIds) {
        const existing = await this.repository.findParticipant(
          sessionId,
          userId,
          tx,
        );
        const [row] = existing
          ? await tx
              .update(schema.clubMatchSessionParticipants)
              .set({
                source: 'MANDATORY',
                status: 'ACTIVE',
                assignedBy: actor.id,
                assignedAt: new Date(),
                withdrawnAt: null,
                updatedAt: new Date(),
                version: sql`${schema.clubMatchSessionParticipants.version} + 1`,
              })
              .where(eq(schema.clubMatchSessionParticipants.id, existing.id))
              .returning()
          : await tx
              .insert(schema.clubMatchSessionParticipants)
              .values({
                sessionId,
                userId,
                source: 'MANDATORY',
                status: 'ACTIVE',
                assignedBy: actor.id,
                assignedAt: new Date(),
              })
              .returning();
        assigned.push(row);
        await this.repository.auditUpdate(
          tx,
          actor.id,
          'club_match_session_participants',
          row.id,
          existing ? { status: existing.status, source: existing.source } : {},
          { status: row.status, source: row.source, assignedBy: actor.id },
        );
      }
      const result = { assignedUserIds: userIds, replayed: false };
      await this.repository.saveCommand(tx, {
        sessionId,
        actorId: actor.id,
        operation: 'FORCE_PARTICIPANTS',
        idempotencyKey: idempotencyKey.trim(),
        request,
        result,
      });
      return result;
    });
  }

  async createMockParticipant(
    sessionId: string,
    actor: Actor,
    dto: CreateClubMatchMockParticipantDto,
  ) {
    const current = await this.requireSession(sessionId, actor);
    await this.requireManager(current.session.communityId, actor);
    if (current.session.status !== 'OPEN') {
      apiError(ConflictException, 'SESSION_REGISTRATION_CLOSED');
    }
    const name = dto.name.trim();
    if (!name) apiError(BadRequestException, 'MOCK_PARTICIPANT_NAME_REQUIRED');

    const db = this.repository.getDb();
    return db.transaction(async (tx) => {
      const lockedSession = await this.repository.findSessionForUpdate(
        sessionId,
        tx,
      );
      if (!lockedSession) apiError(NotFoundException, 'SESSION_NOT_FOUND');
      if (lockedSession.status !== 'OPEN') {
        apiError(ConflictException, 'SESSION_REGISTRATION_CLOSED');
      }
      const activeCount = await this.repository.countActiveParticipants(
        sessionId,
        tx,
      );
      if (activeCount >= lockedSession.maxParticipants) {
        apiError(ConflictException, 'SESSION_CAPACITY_REACHED', {
          maxParticipants: lockedSession.maxParticipants,
          activeCount,
        });
      }

      const email = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 9)}@mock.com`;
      const [mockUser] = await tx
        .insert(schema.users)
        .values({ email, isMock: true })
        .returning({ id: schema.users.id });
      await tx.insert(schema.profiles).values({
        userId: mockUser.id,
        fullName: name,
        allowStrangerMessages: false,
      });
      const [participant] = await tx
        .insert(schema.clubMatchSessionParticipants)
        .values({
          sessionId,
          userId: mockUser.id,
          source: 'MANDATORY',
          status: 'ACTIVE',
          assignedBy: actor.id,
          assignedAt: new Date(),
        })
        .returning();
      await this.repository.auditUpdate(
        tx,
        actor.id,
        'club_match_session_participants',
        participant.id,
        {},
        { status: participant.status, source: participant.source, isMock: true },
      );
      return {
        participant,
        fullName: name,
        avatarUrl: null,
        isMock: true,
      };
    });
  }

  async removeParticipant(
    sessionId: string,
    userId: string,
    actor: Actor,
    dto: RemoveClubMatchParticipantDto,
  ) {
    const current = await this.requireSession(sessionId, actor);
    await this.requireManager(current.session.communityId, actor);
    const participant = await this.repository.findParticipant(
      sessionId,
      userId,
    );
    if (!participant) apiError(NotFoundException, 'PARTICIPANT_NOT_FOUND');
    const db = this.repository.getDb();
    return db.transaction(async (tx) => {
      const [updated] = await tx
        .update(schema.clubMatchSessionParticipants)
        .set({
          status: 'KICKED',
          withdrawnAt: new Date(),
          updatedAt: new Date(),
          version: sql`${schema.clubMatchSessionParticipants.version} + 1`,
        })
        .where(
          and(
            eq(schema.clubMatchSessionParticipants.id, participant.id),
            eq(schema.clubMatchSessionParticipants.version, dto.version),
          ),
        )
        .returning();
      if (!updated) apiError(ConflictException, 'STALE_PARTICIPANT_VERSION');
      await this.repository.auditUpdate(
        tx,
        actor.id,
        'club_match_session_participants',
        participant.id,
        { status: participant.status },
        { status: 'KICKED' },
      );
      return updated;
    });
  }

  async updatePreferences(
    sessionId: string,
    actor: Actor,
    dto: UpdateClubMatchPreferencesDto,
  ) {
    const current = await this.requireSession(sessionId, actor);
    const participant = await this.repository.findParticipant(
      sessionId,
      actor.id,
    );
    if (!participant || participant.status !== 'ACTIVE') {
      apiError(ForbiddenException, 'ACTIVE_PARTICIPANT_REQUIRED');
    }
    const partner = uniqueSorted(dto.preferredPartnerUserIds);
    const opponent = uniqueSorted(dto.preferredOpponentUserIds);
    const avoid = uniqueSorted(dto.avoidUserIds);
    const all = [...partner, ...opponent, ...avoid];
    if (all.includes(actor.id) || new Set(all).size !== all.length) {
      apiError(BadRequestException, 'INVALID_OR_OVERLAPPING_PREFERENCES');
    }
    const db = this.repository.getDb();
    return db.transaction(async (tx) => {
      if (all.length > 0) {
        const targets = await tx
          .select({ userId: schema.clubMatchSessionParticipants.userId })
          .from(schema.clubMatchSessionParticipants)
          .innerJoin(
            schema.communityMembers,
            and(
              eq(
                schema.communityMembers.userId,
                schema.clubMatchSessionParticipants.userId,
              ),
              eq(
                schema.communityMembers.communityId,
                current.session.communityId,
              ),
              eq(schema.communityMembers.status, 'JOINED'),
            ),
          )
          .where(
            and(
              eq(schema.clubMatchSessionParticipants.sessionId, sessionId),
              eq(schema.clubMatchSessionParticipants.status, 'ACTIVE'),
              inArray(schema.clubMatchSessionParticipants.userId, all),
            ),
          );
        if (targets.length !== all.length) {
          apiError(
            BadRequestException,
            'PREFERENCE_TARGET_MUST_BE_ACTIVE_PARTICIPANT',
          );
        }
      }
      const [existing] = await tx
        .select()
        .from(schema.clubMatchPreferences)
        .where(
          and(
            eq(schema.clubMatchPreferences.sessionId, sessionId),
            eq(schema.clubMatchPreferences.userId, actor.id),
          ),
        )
        .limit(1);
      if (
        existing &&
        dto.version !== undefined &&
        dto.version !== existing.version
      ) {
        apiError(ConflictException, 'STALE_PREFERENCE_VERSION');
      }
      const [saved] = existing
        ? await tx
            .update(schema.clubMatchPreferences)
            .set({
              preferredPartnerUserIds: partner,
              preferredOpponentUserIds: opponent,
              avoidUserIds: avoid,
              updatedAt: new Date(),
              version: sql`${schema.clubMatchPreferences.version} + 1`,
            })
            .where(eq(schema.clubMatchPreferences.id, existing.id))
            .returning()
        : await tx
            .insert(schema.clubMatchPreferences)
            .values({
              sessionId,
              userId: actor.id,
              preferredPartnerUserIds: partner,
              preferredOpponentUserIds: opponent,
              avoidUserIds: avoid,
            })
            .returning();
      await this.repository.auditUpdate(
        tx,
        actor.id,
        'club_match_preferences',
        saved.id,
        existing ? { version: existing.version } : {},
        { version: saved.version },
      );
      return saved;
    });
  }

  async createMatch(
    sessionId: string,
    actor: Actor,
    dto: CreateClubMatchDto,
    idempotencyKey?: string,
  ) {
    if (!idempotencyKey?.trim())
      apiError(BadRequestException, 'IDEMPOTENCY_KEY_REQUIRED');
    const current = await this.requireSession(sessionId, actor);
    const membership = await this.repository.findMembership(
      current.session.communityId,
      actor.id,
    );
    const community = await this.repository.findCommunityContext(
      current.session.communityId,
      actor.id,
    );
    const actorParticipant = await this.repository.findParticipant(
      sessionId,
      actor.id,
    );
    const canCreate =
      this.isPlatformAdmin(actor) ||
      MANAGER_ROLES.has(membership?.role ?? '') ||
      (community?.memberMatchCreationEnabled !== false &&
        (actorParticipant?.status === 'ACTIVE' ||
          membership?.status === 'JOINED'));
    if (!canCreate) apiError(ForbiddenException, 'MATCH_CREATION_NOT_ALLOWED');
    if (!['OPEN', 'LIVE'].includes(current.session.status))
      apiError(ConflictException, 'SESSION_NOT_ACCEPTING_MATCHES');
    const sideA = uniqueSorted(dto.sideAUserIds);
    const sideB = uniqueSorted(dto.sideBUserIds);
    const sideSize = sideA.length;
    const inferredMatchType =
      dto.matchType ?? (sideSize === 1 ? 'SINGLES' : 'DOUBLES');
    const expectedSize = inferredMatchType === 'SINGLES' ? 1 : 2;
    const all = [...sideA, ...sideB];
    if (
      sideA.length !== expectedSize ||
      sideB.length !== expectedSize ||
      new Set(all).size !== all.length
    ) {
      apiError(BadRequestException, 'INVALID_MATCH_SIDES');
    }
    const request = {
      sessionId,
      sideA,
      sideB,
      matchType: inferredMatchType,
      scheduledAt: dto.scheduledAt ?? null,
      confirmWarnings: Boolean(dto.confirmWarnings),
    };
    const db = this.repository.getDb();
    const result = await db.transaction(async (tx) => {
      const replay = await this.repository.findCommand(tx, {
        actorId: actor.id,
        operation: 'CREATE_MATCH',
        idempotencyKey: idempotencyKey.trim(),
        request,
      });
      if (replay) {
        if (!replay.sameRequest)
          apiError(ConflictException, 'IDEMPOTENCY_KEY_REUSED');
        return replay.result;
      }
      const participants = await tx
        .select({
          userId: schema.clubMatchSessionParticipants.userId,
          isMock: schema.users.isMock,
        })
        .from(schema.clubMatchSessionParticipants)
        .leftJoin(
          schema.users,
          eq(schema.users.id, schema.clubMatchSessionParticipants.userId),
        )
        .leftJoin(
          schema.communityMembers,
          and(
            eq(
              schema.communityMembers.userId,
              schema.clubMatchSessionParticipants.userId,
            ),
            eq(
              schema.communityMembers.communityId,
              current.session.communityId,
            ),
            eq(schema.communityMembers.status, 'JOINED'),
          ),
        )
        .where(
          and(
            eq(schema.clubMatchSessionParticipants.sessionId, sessionId),
            eq(schema.clubMatchSessionParticipants.status, 'ACTIVE'),
            inArray(schema.clubMatchSessionParticipants.userId, all),
            or(
              eq(schema.users.isMock, true),
              eq(schema.communityMembers.status, 'JOINED'),
            ),
          ),
        );
      if (participants.length !== all.length)
        apiError(
          BadRequestException,
          'MATCH_PLAYERS_MUST_BE_ACTIVE_PARTICIPANTS',
        );
      const warnings = await this.repository.getPairingWarnings(
        tx,
        sessionId,
        sideA,
        sideB,
      );
      if (warnings.length > 0 && !dto.confirmWarnings) {
        apiError(ConflictException, 'PAIRING_WARNINGS_REQUIRE_CONFIRMATION', {
          warnings,
        });
      }
      const [created] = await tx
        .insert(schema.clubMatchSessionMatches)
        .values({
          sessionId,
          createdBy: actor.id,
          sideAUserIds: sideA,
          sideBUserIds: sideB,
          matchType: inferredMatchType,
          scoreConfig: (() => {
            const preset = selectScoringPreset(
              community?.matchScoringPresets,
              current.categorySlug,
            );
            return Object.keys(preset).length > 0 ? preset : null;
          })(),
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
          eloStatus: current.session.isRanked ? 'WAITING_RESULT' : 'NOT_RANKED',
        })
        .returning();
      await this.repository.auditUpdate(
        tx,
        actor.id,
        'club_match_session_matches',
        created.id,
        {},
        { status: created.status, sideAUserIds: sideA, sideBUserIds: sideB },
      );
      const commandResult = { matchId: created.id, warnings, replayed: false };
      await this.repository.saveCommand(tx, {
        sessionId,
        actorId: actor.id,
        operation: 'CREATE_MATCH',
        idempotencyKey: idempotencyKey.trim(),
        request,
        result: commandResult,
      });
      return commandResult;
    });
    return {
      ...result,
      match: await this.repository.projectMatch(String(result.matchId)),
    };
  }

  async createStandaloneMatch(
    actor: Actor,
    dto: CreateClubStandaloneMatchDto,
    idempotencyKey?: string,
  ) {
    if (!idempotencyKey?.trim())
      apiError(BadRequestException, 'IDEMPOTENCY_KEY_REQUIRED');
    const community = await this.requireCommunityAccess(dto.communityId, actor);
    if (!community.categoryId) apiError(BadRequestException, 'CLUB_SPORT_REQUIRED');
    const isManager =
      this.isPlatformAdmin(actor) ||
      MANAGER_ROLES.has(community.memberRole ?? '');
    if (!isManager && community.memberMatchCreationEnabled === false) {
      apiError(ForbiddenException, 'MATCH_CREATION_NOT_ALLOWED');
    }
    const categoryId = community.categoryId;

    const sideA = uniqueSorted(dto.sideAUserIds);
    const sideB = uniqueSorted(dto.sideBUserIds);
    const matchType = dto.matchType ?? (sideA.length === 1 ? 'SINGLES' : 'DOUBLES');
    const expectedSize = matchType === 'SINGLES' ? 1 : 2;
    const all = [...sideA, ...sideB];
    if (
      sideA.length !== expectedSize ||
      sideB.length !== expectedSize ||
      new Set(all).size !== all.length
    ) {
      apiError(BadRequestException, 'INVALID_MATCH_SIDES');
    }

    const db = this.repository.getDb();
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${actor.id}:CREATE_STANDALONE_MATCH:${idempotencyKey.trim()}`}))`,
      );
      const [replay] = await tx
        .select()
        .from(schema.clubStandaloneMatches)
        .where(
          and(
            eq(schema.clubStandaloneMatches.createdBy, actor.id),
            eq(schema.clubStandaloneMatches.idempotencyKey, idempotencyKey.trim()),
          ),
        )
        .limit(1);
      if (replay) return { matchId: replay.id, replayed: true };

      const members = await tx
        .select({ userId: schema.communityMembers.userId })
        .from(schema.communityMembers)
        .where(
          and(
            eq(schema.communityMembers.communityId, dto.communityId),
            eq(schema.communityMembers.status, 'JOINED'),
            inArray(schema.communityMembers.userId, all),
          ),
        );
      if (members.length !== all.length) {
        apiError(BadRequestException, 'MATCH_PLAYERS_MUST_BE_CLUB_MEMBERS');
      }
      const isRanked = dto.isRanked !== false;
      const scoreConfig = selectScoringPreset(
        community.matchScoringPresets,
        community.categorySlug,
      );
      const [created] = await tx
        .insert(schema.clubStandaloneMatches)
        .values({
          communityId: dto.communityId,
          categoryId,
          createdBy: actor.id,
          idempotencyKey: idempotencyKey.trim(),
          sideAUserIds: sideA,
          sideBUserIds: sideB,
          matchType,
          isRanked,
          scoreConfig:
            Object.keys(scoreConfig).length > 0 ? scoreConfig : null,
          eloStatus: isRanked ? 'WAITING_RESULT' : 'NOT_RANKED',
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        })
        .returning({ id: schema.clubStandaloneMatches.id });
      await this.repository.auditUpdate(
        tx,
        actor.id,
        'club_standalone_matches',
        created.id,
        {},
        {
          communityId: dto.communityId,
          categoryId,
          matchType,
          sideAUserIds: sideA,
          sideBUserIds: sideB,
          isRanked,
          scoreConfig,
        },
      );
      return { matchId: created.id, replayed: false };
    });
    return {
      ...result,
      match: await this.repository.projectStandaloneMatch(result.matchId),
    };
  }

  async listStandaloneMatches(
    actor: Actor | undefined,
    query: QueryClubStandaloneMatchesDto,
  ) {
    // Public read: only require the community exists and is ACTIVE.
    // Non-members (and unauthenticated web visitors) can view the club activity feed.
    const context = await this.repository.findCommunityContext(
      query.communityId,
      actor?.id,
    );
    if (!context || context.status !== 'ACTIVE') {
      apiError(NotFoundException, 'CLUB_NOT_FOUND');
    }
    const result = await this.repository.listStandaloneMatches(query.communityId, {
      status: query.status,
      cursor: query.cursor,
      limit: query.limit ?? 30,
    });
    if (result.invalidCursor) apiError(BadRequestException, 'INVALID_CURSOR');
    return { data: result.items, meta: result.meta };
  }

  async deleteStandaloneMatch(matchId: string, actor: Actor) {
    const match = await this.repository.findStandaloneMatch(matchId);
    if (!match) {
      const deletedMatch =
        await this.repository.findStandaloneMatchIncludingDeleted(matchId);
      if (!deletedMatch) apiError(NotFoundException, 'CLUB_MATCH_NOT_FOUND');
      await this.requireCommunityAccess(deletedMatch.communityId, actor);
      return { deleted: true, eloReverted: false, replayed: true };
    }
    const community = await this.requireCommunityAccess(match.communityId, actor);
    const membership = await this.repository.findMembership(
      match.communityId,
      actor.id,
    );
    const isManager =
      this.isPlatformAdmin(actor) ||
      MANAGER_ROLES.has(community.memberRole ?? '');
    const isCompleted = match.status === 'COMPLETED';
    const canDelete =
      isManager ||
      (isCompleted &&
        (match.createdBy === actor.id ||
          (community.memberMatchDeletionEnabled === true &&
            membership?.status === 'JOINED')));
    if (!canDelete) apiError(ForbiddenException, 'MATCH_DELETE_PERMISSION_REQUIRED');

    const db = this.repository.getDb();
    let eloReverted = false;
    const deleted = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(schema.clubStandaloneMatches)
        .where(
          and(
            eq(schema.clubStandaloneMatches.id, matchId),
            isNull(schema.clubStandaloneMatches.deletedAt),
          ),
        )
        .for('update')
        .limit(1);
      if (!locked) return false;
      if (locked.eloStatus === 'APPLIED') {
        await this.rankingsService.rollbackStandaloneMatchResult(matchId, tx);
        eloReverted = true;
      }
      await tx
        .delete(schema.matchEloOutbox)
        .where(eq(schema.matchEloOutbox.standaloneMatchId, matchId));
      const [updated] = await tx
        .update(schema.clubStandaloneMatches)
        .set({
          status: 'CANCELLED',
          eloStatus: eloReverted ? 'REVERTED' : locked.eloStatus,
          deletedAt: new Date(),
          updatedAt: new Date(),
          revision: sql`${schema.clubStandaloneMatches.revision} + 1`,
        })
        .where(eq(schema.clubStandaloneMatches.id, matchId))
        .returning();
      await this.repository.auditUpdate(
        tx,
        actor.id,
        'club_standalone_matches',
        matchId,
        { status: locked.status, eloStatus: locked.eloStatus },
        { status: 'CANCELLED', eloStatus: updated.eloStatus, deleted: true },
      );
      return Boolean(updated);
    });
    if (!deleted) return { deleted: true, eloReverted: false, replayed: true };
    this.liveScoreGateway.broadcastClubStandaloneMatchUpdate(
      matchId,
      { id: matchId, status: 'CANCELLED', deleted: true },
      'match:status',
    );
    return { deleted: true, eloReverted };
  }

  async listMatches(
    sessionId: string,
    actor: Actor,
    query: QueryClubMatchChildrenDto,
  ) {
    await this.requireSession(sessionId, actor);
    const result = await this.repository.listMatches(sessionId, {
      status: query.status,
      cursor: query.cursor,
      limit: query.limit ?? 30,
    });
    if (result.invalidCursor) apiError(BadRequestException, 'INVALID_CURSOR');
    return { data: result.items, meta: result.meta };
  }

  private async requireMatchEditor(matchId: string, actor: Actor) {
    const match = await this.repository.findMatch(matchId);
    if (!match) apiError(NotFoundException, 'CLUB_MATCH_NOT_FOUND');
    const session = await this.requireSession(match.sessionId, actor);
    const membership = await this.repository.findMembership(
      session.session.communityId,
      actor.id,
    );
    const community = await this.repository.findCommunityContext(
      session.session.communityId,
      actor.id,
    );
    const canEdit =
      this.isPlatformAdmin(actor) ||
      MANAGER_ROLES.has(membership?.role ?? '') ||
      (membership?.status === 'JOINED' &&
        community?.memberMatchScoringEnabled !== false);
    if (!canEdit)
      apiError(ForbiddenException, 'MATCH_SCORE_PERMISSION_REQUIRED');
    return { match, session };
  }

  private async requireStandaloneMatchEditor(matchId: string, actor: Actor) {
    const match = await this.repository.findStandaloneMatch(matchId);
    if (!match) apiError(NotFoundException, 'CLUB_MATCH_NOT_FOUND');
    const community = await this.requireCommunityAccess(match.communityId, actor);
    const membership = await this.repository.findMembership(match.communityId, actor.id);
    const canEdit =
      this.isPlatformAdmin(actor) ||
      MANAGER_ROLES.has(membership?.role ?? '') ||
      (membership?.status === 'JOINED' &&
        community.memberMatchScoringEnabled !== false);
    if (!canEdit) apiError(ForbiddenException, 'MATCH_SCORE_PERMISSION_REQUIRED');
    return { match, community };
  }

  private async startStandaloneMatch(
    matchId: string,
    actor: Actor,
    expectedRevision?: number,
  ) {
    const { match } = await this.requireStandaloneMatchEditor(matchId, actor);
    if (match.status === 'ONGOING') return this.repository.projectStandaloneMatch(matchId);
    if (match.status !== 'SCHEDULED') apiError(ConflictException, 'MATCH_CANNOT_START');
    const revision = expectedRevision ?? match.revision;
    const [updated] = await this.repository.getDb()
      .update(schema.clubStandaloneMatches)
      .set({
        status: 'ONGOING',
        startedAt: new Date(),
        updatedAt: new Date(),
        revision: sql`${schema.clubStandaloneMatches.revision} + 1`,
      })
      .where(
        and(
          eq(schema.clubStandaloneMatches.id, matchId),
          eq(schema.clubStandaloneMatches.revision, revision),
          eq(schema.clubStandaloneMatches.status, 'SCHEDULED'),
        ),
      )
      .returning();
    if (!updated) apiError(ConflictException, 'STALE_MATCH_REVISION', { currentRevision: match.revision });
    const projected = await this.repository.projectStandaloneMatch(matchId);
    this.liveScoreGateway.broadcastClubStandaloneMatchUpdate(matchId, projected ?? updated, 'match:status');
    return projected;
  }

  private async updateStandaloneScore(
    matchId: string,
    actor: Actor,
    dto: UpdateMatchScoreDto,
  ) {
    const { match } = await this.requireStandaloneMatchEditor(matchId, actor);
    this.validateMaxSets(dto);
    if (!['SCHEDULED', 'ONGOING'].includes(match.status))
      apiError(ConflictException, 'MATCH_SCORE_LOCKED');
    const revision = dto.expectedRevision ?? match.revision;
    const [updated] = await this.repository.getDb()
      .update(schema.clubStandaloneMatches)
      .set({
        status: 'ONGOING',
        startedAt: match.startedAt ?? new Date(),
        p1SetsWon: dto.p1SetsWon,
        p2SetsWon: dto.p2SetsWon,
        ...(dto.scoreDetails !== undefined ? { scoreDetails: dto.scoreDetails } : {}),
        updatedAt: new Date(),
        revision: sql`${schema.clubStandaloneMatches.revision} + 1`,
      })
      .where(
        and(
          eq(schema.clubStandaloneMatches.id, matchId),
          eq(schema.clubStandaloneMatches.revision, revision),
          inArray(schema.clubStandaloneMatches.status, ['SCHEDULED', 'ONGOING']),
        ),
      )
      .returning();
    if (!updated) apiError(ConflictException, 'STALE_MATCH_REVISION', { currentRevision: match.revision });
    const projected = await this.repository.projectStandaloneMatch(matchId);
    this.liveScoreGateway.broadcastClubStandaloneMatchUpdate(matchId, projected ?? updated, 'score:update');
    return projected;
  }

  private async completeStandaloneMatch(
    matchId: string,
    actor: Actor,
    dto: UpdateMatchScoreDto,
  ) {
    const { match } = await this.requireStandaloneMatchEditor(matchId, actor);
    this.validateMaxSets(dto);
    if (match.status === 'COMPLETED') return this.repository.projectStandaloneMatch(matchId);
    if (!['SCHEDULED', 'ONGOING'].includes(match.status))
      apiError(ConflictException, 'MATCH_CANNOT_COMPLETE');
    if (dto.p1SetsWon === dto.p2SetsWon)
      apiError(BadRequestException, 'MATCH_WINNER_REQUIRED');
    const winnerSide = dto.p1SetsWon > dto.p2SetsWon ? 'A' : 'B';
    const revision = dto.expectedRevision ?? match.revision;
    const updated = await this.repository.getDb().transaction(async (tx) => {
      const playerIds = [...match.sideAUserIds, ...match.sideBUserIds];
      const users = await tx
        .select({ id: schema.users.id, isMock: schema.users.isMock })
        .from(schema.users)
        .where(inArray(schema.users.id, playerIds));
      const hasMock = users.some((user) => user.isMock);
      const eloStatus = !match.isRanked
        ? 'NOT_RANKED'
        : hasMock
          ? 'SKIPPED_MOCK'
          : 'PENDING';
      const [row] = await tx
        .update(schema.clubStandaloneMatches)
        .set({
          status: 'COMPLETED',
          p1SetsWon: dto.p1SetsWon,
          p2SetsWon: dto.p2SetsWon,
          ...(dto.scoreDetails !== undefined ? { scoreDetails: dto.scoreDetails } : {}),
          winnerSide,
          completedAt: new Date(),
          scoreConfirmedBy: actor.id,
          eloStatus,
          updatedAt: new Date(),
          revision: sql`${schema.clubStandaloneMatches.revision} + 1`,
        })
        .where(
          and(
            eq(schema.clubStandaloneMatches.id, matchId),
            eq(schema.clubStandaloneMatches.revision, revision),
            inArray(schema.clubStandaloneMatches.status, ['SCHEDULED', 'ONGOING']),
          ),
        )
        .returning();
      if (!row) apiError(ConflictException, 'STALE_MATCH_REVISION', { currentRevision: match.revision });
      if (eloStatus === 'PENDING') {
        await tx.insert(schema.matchEloOutbox).values({
          matchId: null,
          clubMatchSessionMatchId: null,
          standaloneMatchId: matchId,
          status: 'PENDING',
          attempts: 0,
        });
      }
      await this.repository.auditUpdate(
        tx,
        actor.id,
        'club_standalone_matches',
        matchId,
        { status: match.status, revision: match.revision },
        { status: 'COMPLETED', revision: row.revision, winnerSide, eloStatus },
      );
      return row;
    });
    const projected = await this.repository.projectStandaloneMatch(matchId);
    this.liveScoreGateway.broadcastClubStandaloneMatchUpdate(matchId, projected ?? updated, 'match:status');
    this.liveScoreGateway.broadcastClubStandaloneMatchUpdate(matchId, projected ?? updated, 'score:update');
    void this.eloOutboxProcessor.dispatchNow();
    return projected;
  }

  async startMatch(matchId: string, actor: Actor, expectedRevision?: number) {
    if (!(await this.repository.findMatch(matchId))) {
      return this.startStandaloneMatch(matchId, actor, expectedRevision);
    }
    const { match } = await this.requireMatchEditor(matchId, actor);
    if (match.status === 'ONGOING')
      return this.repository.projectMatch(matchId);
    if (match.status !== 'SCHEDULED')
      apiError(ConflictException, 'MATCH_CANNOT_START');
    const revision = expectedRevision ?? match.revision;
    const db = this.repository.getDb();
    const [updated] = await db
      .update(schema.clubMatchSessionMatches)
      .set({
        status: 'ONGOING',
        startedAt: new Date(),
        updatedAt: new Date(),
        revision: sql`${schema.clubMatchSessionMatches.revision} + 1`,
      })
      .where(
        and(
          eq(schema.clubMatchSessionMatches.id, matchId),
          eq(schema.clubMatchSessionMatches.revision, revision),
          eq(schema.clubMatchSessionMatches.status, 'SCHEDULED'),
        ),
      )
      .returning();
    if (!updated)
      apiError(ConflictException, 'STALE_MATCH_REVISION', {
        currentRevision: match.revision,
      });
    const projected = await this.repository.projectMatch(matchId);
    this.liveScoreGateway.broadcastClubSessionMatchUpdate(
      match.sessionId,
      matchId,
      projected ?? updated,
      'match:status',
    );
    return projected;
  }

  async updateScore(matchId: string, actor: Actor, dto: UpdateMatchScoreDto) {
    if (!(await this.repository.findMatch(matchId))) {
      return this.updateStandaloneScore(matchId, actor, dto);
    }
    const { match } = await this.requireMatchEditor(matchId, actor);
    this.validateMaxSets(dto);
    if (!['SCHEDULED', 'ONGOING'].includes(match.status))
      apiError(ConflictException, 'MATCH_SCORE_LOCKED');
    const revision = dto.expectedRevision ?? match.revision;
    const db = this.repository.getDb();
    const [updated] = await db
      .update(schema.clubMatchSessionMatches)
      .set({
        status: 'ONGOING',
        startedAt: match.startedAt ?? new Date(),
        p1SetsWon: dto.p1SetsWon,
        p2SetsWon: dto.p2SetsWon,
        ...(dto.scoreDetails !== undefined
          ? { scoreDetails: dto.scoreDetails }
          : {}),
        updatedAt: new Date(),
        revision: sql`${schema.clubMatchSessionMatches.revision} + 1`,
      })
      .where(
        and(
          eq(schema.clubMatchSessionMatches.id, matchId),
          eq(schema.clubMatchSessionMatches.revision, revision),
          inArray(schema.clubMatchSessionMatches.status, [
            'SCHEDULED',
            'ONGOING',
          ]),
        ),
      )
      .returning();
    if (!updated)
      apiError(ConflictException, 'STALE_MATCH_REVISION', {
        currentRevision: match.revision,
      });
    const projected = await this.repository.projectMatch(matchId);
    this.liveScoreGateway.broadcastClubSessionMatchUpdate(
      match.sessionId,
      matchId,
      projected ?? updated,
      'score:update',
    );
    return projected;
  }

  async completeMatch(matchId: string, actor: Actor, dto: UpdateMatchScoreDto) {
    if (!(await this.repository.findMatch(matchId))) {
      return this.completeStandaloneMatch(matchId, actor, dto);
    }
    const { match, session } = await this.requireMatchEditor(matchId, actor);
    this.validateMaxSets(dto);
    if (match.status === 'COMPLETED')
      return this.repository.projectMatch(matchId);
    if (!['SCHEDULED', 'ONGOING'].includes(match.status))
      apiError(ConflictException, 'MATCH_CANNOT_COMPLETE');
    if (dto.p1SetsWon === dto.p2SetsWon)
      apiError(BadRequestException, 'MATCH_WINNER_REQUIRED');
    const winnerSide = dto.p1SetsWon > dto.p2SetsWon ? 'A' : 'B';
    const revision = dto.expectedRevision ?? match.revision;
    const db = this.repository.getDb();
    const updated = await db.transaction(async (tx) => {
      const playerIds = [...match.sideAUserIds, ...match.sideBUserIds];
      const users = await tx
        .select({ id: schema.users.id, isMock: schema.users.isMock })
        .from(schema.users)
        .where(inArray(schema.users.id, playerIds));
      const hasMock = users.some((user) => user.isMock);
      const eloStatus = !session.session.isRanked
        ? 'NOT_RANKED'
        : hasMock
          ? 'SKIPPED_MOCK'
          : 'PENDING';
      const [row] = await tx
        .update(schema.clubMatchSessionMatches)
        .set({
          status: 'COMPLETED',
          p1SetsWon: dto.p1SetsWon,
          p2SetsWon: dto.p2SetsWon,
          ...(dto.scoreDetails !== undefined
            ? { scoreDetails: dto.scoreDetails }
            : {}),
          winnerSide,
          completedAt: new Date(),
          scoreConfirmedBy: actor.id,
          eloStatus,
          updatedAt: new Date(),
          revision: sql`${schema.clubMatchSessionMatches.revision} + 1`,
        })
        .where(
          and(
            eq(schema.clubMatchSessionMatches.id, matchId),
            eq(schema.clubMatchSessionMatches.revision, revision),
            inArray(schema.clubMatchSessionMatches.status, [
              'SCHEDULED',
              'ONGOING',
            ]),
          ),
        )
        .returning();
      if (!row)
        apiError(ConflictException, 'STALE_MATCH_REVISION', {
          currentRevision: match.revision,
        });
      if (eloStatus === 'PENDING') {
        await tx.insert(schema.matchEloOutbox).values({
          matchId: null,
          clubMatchSessionMatchId: matchId,
          status: 'PENDING',
          attempts: 0,
        });
      }
      await this.repository.auditUpdate(
        tx,
        actor.id,
        'club_match_session_matches',
        matchId,
        { status: match.status, revision: match.revision },
        { status: 'COMPLETED', revision: row.revision, winnerSide, eloStatus },
      );
      return row;
    });
    const projected = await this.repository.projectMatch(matchId);
    this.liveScoreGateway.broadcastClubSessionMatchUpdate(
      match.sessionId,
      matchId,
      projected ?? updated,
      'match:status',
    );
    this.liveScoreGateway.broadcastClubSessionMatchUpdate(
      match.sessionId,
      matchId,
      projected ?? updated,
      'score:update',
    );
    void this.eloOutboxProcessor.dispatchNow();
    return projected;
  }

  @Cron('0 * * * * *')
  async advanceDatedSessions() {
    const db = this.repository.getDb();
    await db.execute(sql`
      UPDATE club_match_sessions
      SET status = CASE
          WHEN end_at IS NOT NULL AND end_at <= now() THEN 'ENDED'
          WHEN start_at IS NOT NULL AND start_at <= now() AND status = 'OPEN' THEN 'LIVE'
          ELSE status
        END,
        registration_closed_at = CASE WHEN end_at IS NOT NULL AND end_at <= now() THEN COALESCE(registration_closed_at, now()) ELSE registration_closed_at END,
        ended_at = CASE WHEN end_at IS NOT NULL AND end_at <= now() THEN COALESCE(ended_at, now()) ELSE ended_at END,
        version = version + 1,
        updated_at = now()
      WHERE deleted_at IS NULL
        AND status IN ('OPEN', 'LIVE', 'CLOSED')
        AND ((start_at IS NOT NULL AND start_at <= now() AND status = 'OPEN') OR (end_at IS NOT NULL AND end_at <= now()))
    `);
  }
}
