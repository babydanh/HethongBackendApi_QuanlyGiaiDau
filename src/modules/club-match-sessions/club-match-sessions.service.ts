import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import * as schema from '../../database/schema';
import { LiveScoreGateway } from '../matches/live-score.gateway';
import { UpdateMatchScoreDto } from '../matches/dto/update-match-score.dto';
import { EloOutboxProcessor } from '../rankings/elo-outbox.processor';
import {
  CreateClubMatchDto,
  CreateClubMatchSessionDto,
  ForceClubMatchParticipantsDto,
  QueryClubMatchChildrenDto,
  QueryClubMatchSessionsDto,
  RemoveClubMatchParticipantDto,
  TransitionClubMatchSessionDto,
  UpdateClubMatchPreferencesDto,
  UpdateClubMatchSessionDto,
} from './dto/club-match-session.dto';
import { ClubMatchSessionsRepository } from './club-match-sessions.repository';

type Actor = { id: string; roles?: string[] };

const MANAGER_ROLES = new Set(['OWNER', 'MODERATOR']);
const TERMINAL_SESSION_STATUSES = new Set(['ENDED', 'CANCELLED']);

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
    if (
      !this.isPlatformAdmin(actor) &&
      context.memberStatus !== 'JOINED'
    ) {
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

  async create(
    actor: Actor,
    dto: CreateClubMatchSessionDto,
    locale?: string,
  ) {
    const community = await this.requireManager(dto.communityId, actor);
    if (!community.categoryId) {
      apiError(BadRequestException, 'CLUB_SPORT_REQUIRED');
    }
    if (dto.categoryId && dto.categoryId !== community.categoryId) {
      apiError(BadRequestException, 'CATEGORY_NOT_ALLOWED_FOR_CLUB');
    }
    const startAt = dto.startAt ? new Date(dto.startAt) : null;
    const endAt = dto.endAt ? new Date(dto.endAt) : null;
    if (startAt && endAt && endAt < startAt) {
      apiError(BadRequestException, 'INVALID_SESSION_DATE_RANGE');
    }
    const created = await this.repository.createSession({
      communityId: dto.communityId,
      categoryId: community.categoryId,
      createdBy: actor.id,
      name: dto.name?.trim() || null,
      description: dto.description?.trim() || null,
      registrationMode: dto.registrationMode ?? 'MIXED',
      isRanked: dto.isRanked ?? true,
      startAt,
      endAt,
    });
    return this.get(created.id, actor, locale);
  }

  async list(
    actor: Actor,
    query: QueryClubMatchSessionsDto,
    locale?: string,
  ) {
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
    const [membership, viewerParticipant, viewerPreferences] = await Promise.all([
      this.repository.findMembership(row.session.communityId, actor.id),
      this.repository.findParticipant(sessionId, actor.id),
      this.repository.findPreference(sessionId, actor.id),
    ]);
    const canManage =
      this.isPlatformAdmin(actor) ||
      MANAGER_ROLES.has(membership?.role ?? '');
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
              ['SELF', 'MIXED'].includes(row.session.registrationMode) &&
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
          registrationMode:
            dto.registrationMode ?? current.session.registrationMode,
          isRanked: dto.isRanked ?? current.session.isRanked,
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
      (nextStatus === 'CLOSED' && ['OPEN', 'LIVE'].includes(current.session.status)) ||
      (nextStatus === 'ENDED' && ['OPEN', 'LIVE', 'CLOSED'].includes(current.session.status)) ||
      (nextStatus === 'CANCELLED' && !TERMINAL_SESSION_STATUSES.has(current.session.status));
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
          endedAt: nextStatus === 'ENDED' ? new Date() : current.session.endedAt,
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
          .set({ status: 'CANCELLED', eloStatus: 'SKIPPED_CANCELLED', updatedAt: new Date() })
          .where(
            and(
              eq(schema.clubMatchSessionMatches.sessionId, sessionId),
              inArray(schema.clubMatchSessionMatches.status, ['SCHEDULED', 'ONGOING']),
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
      status: query.status,
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
    if (!['SELF', 'MIXED'].includes(current.session.registrationMode)) {
      apiError(ForbiddenException, 'SELF_REGISTRATION_DISABLED');
    }
    const db = this.repository.getDb();
    return db.transaction(async (tx) => {
      const existing = await this.repository.findParticipant(
        sessionId,
        actor.id,
        tx,
      );
      if (existing?.status === 'ACTIVE') return existing;
      if (existing?.source === 'MANDATORY') {
        apiError(ConflictException, 'MANDATORY_PARTICIPANT_CANNOT_SELF_CHANGE');
      }
      const [participant] = existing
        ? await tx
            .update(schema.clubMatchSessionParticipants)
            .set({ status: 'ACTIVE', withdrawnAt: null, updatedAt: new Date(), version: sql`${schema.clubMatchSessionParticipants.version} + 1` })
            .where(eq(schema.clubMatchSessionParticipants.id, existing.id))
            .returning()
        : await tx
            .insert(schema.clubMatchSessionParticipants)
            .values({ sessionId, userId: actor.id, source: 'SELF', status: 'ACTIVE' })
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
    const participant = await this.repository.findParticipant(sessionId, actor.id);
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
            inArray(schema.clubMatchSessionMatches.status, ['SCHEDULED', 'ONGOING']),
            isNull(schema.clubMatchSessionMatches.deletedAt),
          ),
        );
      if (
        activeMatches.length > 0 &&
        (await Promise.all(activeMatches.map((match) => this.repository.findMatch(match.id, tx))))
          .some((match) => match && [...match.sideAUserIds, ...match.sideBUserIds].includes(actor.id))
      ) {
        apiError(ConflictException, 'PARTICIPANT_HAS_ACTIVE_MATCH');
      }
      const [updated] = await tx
        .update(schema.clubMatchSessionParticipants)
        .set({ status: 'WITHDRAWN', withdrawnAt: new Date(), updatedAt: new Date(), version: sql`${schema.clubMatchSessionParticipants.version} + 1` })
        .where(
          and(
            eq(schema.clubMatchSessionParticipants.id, participant.id),
            eq(schema.clubMatchSessionParticipants.version, participant.version),
          ),
        )
        .returning();
      if (!updated) apiError(ConflictException, 'STALE_PARTICIPANT_VERSION');
      await this.repository.auditUpdate(tx, actor.id, 'club_match_session_participants', participant.id, { status: 'ACTIVE' }, { status: 'WITHDRAWN' });
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
    if (!['MANAGER_ASSIGN', 'MIXED'].includes(current.session.registrationMode)) {
      apiError(ConflictException, 'MANAGER_ASSIGNMENT_DISABLED');
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
        if (!replay.sameRequest) apiError(ConflictException, 'IDEMPOTENCY_KEY_REUSED');
        return replay.result;
      }
      const members = await tx
        .select({ userId: schema.communityMembers.userId })
        .from(schema.communityMembers)
        .where(
          and(
            eq(schema.communityMembers.communityId, current.session.communityId),
            eq(schema.communityMembers.status, 'JOINED'),
            inArray(schema.communityMembers.userId, userIds),
          ),
        );
      if (members.length !== userIds.length) {
        apiError(BadRequestException, 'ALL_PARTICIPANTS_MUST_BE_ACTIVE_CLUB_MEMBERS');
      }
      const assigned = [] as Array<typeof schema.clubMatchSessionParticipants.$inferSelect>;
      for (const userId of userIds) {
        const existing = await this.repository.findParticipant(sessionId, userId, tx);
        const [row] = existing
          ? await tx
              .update(schema.clubMatchSessionParticipants)
              .set({ source: 'MANDATORY', status: 'ACTIVE', assignedBy: actor.id, assignedAt: new Date(), withdrawnAt: null, updatedAt: new Date(), version: sql`${schema.clubMatchSessionParticipants.version} + 1` })
              .where(eq(schema.clubMatchSessionParticipants.id, existing.id))
              .returning()
          : await tx
              .insert(schema.clubMatchSessionParticipants)
              .values({ sessionId, userId, source: 'MANDATORY', status: 'ACTIVE', assignedBy: actor.id, assignedAt: new Date() })
              .returning();
        assigned.push(row);
        await this.repository.auditUpdate(tx, actor.id, 'club_match_session_participants', row.id, existing ? { status: existing.status, source: existing.source } : {}, { status: row.status, source: row.source, assignedBy: actor.id });
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

  async removeParticipant(
    sessionId: string,
    userId: string,
    actor: Actor,
    dto: RemoveClubMatchParticipantDto,
  ) {
    const current = await this.requireSession(sessionId, actor);
    await this.requireManager(current.session.communityId, actor);
    const participant = await this.repository.findParticipant(sessionId, userId);
    if (!participant) apiError(NotFoundException, 'PARTICIPANT_NOT_FOUND');
    const db = this.repository.getDb();
    return db.transaction(async (tx) => {
      const [updated] = await tx
        .update(schema.clubMatchSessionParticipants)
        .set({ status: 'KICKED', withdrawnAt: new Date(), updatedAt: new Date(), version: sql`${schema.clubMatchSessionParticipants.version} + 1` })
        .where(
          and(
            eq(schema.clubMatchSessionParticipants.id, participant.id),
            eq(schema.clubMatchSessionParticipants.version, dto.version),
          ),
        )
        .returning();
      if (!updated) apiError(ConflictException, 'STALE_PARTICIPANT_VERSION');
      await this.repository.auditUpdate(tx, actor.id, 'club_match_session_participants', participant.id, { status: participant.status }, { status: 'KICKED' });
      return updated;
    });
  }

  async updatePreferences(
    sessionId: string,
    actor: Actor,
    dto: UpdateClubMatchPreferencesDto,
  ) {
    const current = await this.requireSession(sessionId, actor);
    const participant = await this.repository.findParticipant(sessionId, actor.id);
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
          apiError(BadRequestException, 'PREFERENCE_TARGET_MUST_BE_ACTIVE_PARTICIPANT');
        }
      }
      const [existing] = await tx
        .select()
        .from(schema.clubMatchPreferences)
        .where(and(eq(schema.clubMatchPreferences.sessionId, sessionId), eq(schema.clubMatchPreferences.userId, actor.id)))
        .limit(1);
      if (existing && dto.version !== undefined && dto.version !== existing.version) {
        apiError(ConflictException, 'STALE_PREFERENCE_VERSION');
      }
      const [saved] = existing
        ? await tx
            .update(schema.clubMatchPreferences)
            .set({ preferredPartnerUserIds: partner, preferredOpponentUserIds: opponent, avoidUserIds: avoid, updatedAt: new Date(), version: sql`${schema.clubMatchPreferences.version} + 1` })
            .where(eq(schema.clubMatchPreferences.id, existing.id))
            .returning()
        : await tx
            .insert(schema.clubMatchPreferences)
            .values({ sessionId, userId: actor.id, preferredPartnerUserIds: partner, preferredOpponentUserIds: opponent, avoidUserIds: avoid })
            .returning();
      await this.repository.auditUpdate(tx, actor.id, 'club_match_preferences', saved.id, existing ? { version: existing.version } : {}, { version: saved.version });
      return saved;
    });
  }

  async createMatch(
    sessionId: string,
    actor: Actor,
    dto: CreateClubMatchDto,
    idempotencyKey?: string,
  ) {
    if (!idempotencyKey?.trim()) apiError(BadRequestException, 'IDEMPOTENCY_KEY_REQUIRED');
    const current = await this.requireSession(sessionId, actor);
    const membership = await this.repository.findMembership(current.session.communityId, actor.id);
    const actorParticipant = await this.repository.findParticipant(sessionId, actor.id);
    const canCreate = this.isPlatformAdmin(actor) || MANAGER_ROLES.has(membership?.role ?? '') || actorParticipant?.status === 'ACTIVE';
    if (!canCreate) apiError(ForbiddenException, 'MATCH_CREATION_NOT_ALLOWED');
    if (!['OPEN', 'LIVE'].includes(current.session.status)) apiError(ConflictException, 'SESSION_NOT_ACCEPTING_MATCHES');
    const sideA = uniqueSorted(dto.sideAUserIds);
    const sideB = uniqueSorted(dto.sideBUserIds);
    const expectedSize = dto.matchType === 'SINGLES' ? 1 : 2;
    const all = [...sideA, ...sideB];
    if (sideA.length !== expectedSize || sideB.length !== expectedSize || new Set(all).size !== all.length) {
      apiError(BadRequestException, 'INVALID_MATCH_SIDES');
    }
    const request = { sessionId, sideA, sideB, matchType: dto.matchType, scheduledAt: dto.scheduledAt ?? null, confirmWarnings: Boolean(dto.confirmWarnings) };
    const db = this.repository.getDb();
    const result = await db.transaction(async (tx) => {
      const replay = await this.repository.findCommand(tx, { actorId: actor.id, operation: 'CREATE_MATCH', idempotencyKey: idempotencyKey.trim(), request });
      if (replay) {
        if (!replay.sameRequest) apiError(ConflictException, 'IDEMPOTENCY_KEY_REUSED');
        return replay.result;
      }
      const participants = await tx
        .select({ userId: schema.clubMatchSessionParticipants.userId })
        .from(schema.clubMatchSessionParticipants)
        .innerJoin(schema.communityMembers, and(eq(schema.communityMembers.userId, schema.clubMatchSessionParticipants.userId), eq(schema.communityMembers.communityId, current.session.communityId), eq(schema.communityMembers.status, 'JOINED')))
        .where(and(eq(schema.clubMatchSessionParticipants.sessionId, sessionId), eq(schema.clubMatchSessionParticipants.status, 'ACTIVE'), inArray(schema.clubMatchSessionParticipants.userId, all)));
      if (participants.length !== all.length) apiError(BadRequestException, 'MATCH_PLAYERS_MUST_BE_ACTIVE_PARTICIPANTS');
      const warnings = await this.repository.getPairingWarnings(tx, sessionId, sideA, sideB);
      if (warnings.length > 0 && !dto.confirmWarnings) {
        apiError(ConflictException, 'PAIRING_WARNINGS_REQUIRE_CONFIRMATION', { warnings });
      }
      const [created] = await tx
        .insert(schema.clubMatchSessionMatches)
        .values({ sessionId, createdBy: actor.id, sideAUserIds: sideA, sideBUserIds: sideB, matchType: dto.matchType, scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null, eloStatus: current.session.isRanked ? 'WAITING_RESULT' : 'NOT_RANKED' })
        .returning();
      await this.repository.auditUpdate(tx, actor.id, 'club_match_session_matches', created.id, {}, { status: created.status, sideAUserIds: sideA, sideBUserIds: sideB });
      const commandResult = { matchId: created.id, warnings, replayed: false };
      await this.repository.saveCommand(tx, { sessionId, actorId: actor.id, operation: 'CREATE_MATCH', idempotencyKey: idempotencyKey.trim(), request, result: commandResult });
      return commandResult;
    });
    return { ...result, match: await this.repository.projectMatch(String(result.matchId)) };
  }

  async listMatches(sessionId: string, actor: Actor, query: QueryClubMatchChildrenDto) {
    await this.requireSession(sessionId, actor);
    const result = await this.repository.listMatches(sessionId, { status: query.status, cursor: query.cursor, limit: query.limit ?? 30 });
    if (result.invalidCursor) apiError(BadRequestException, 'INVALID_CURSOR');
    return { data: result.items, meta: result.meta };
  }

  private async requireMatchEditor(matchId: string, actor: Actor) {
    const match = await this.repository.findMatch(matchId);
    if (!match) apiError(NotFoundException, 'CLUB_MATCH_NOT_FOUND');
    const session = await this.requireSession(match.sessionId, actor);
    const membership = await this.repository.findMembership(session.session.communityId, actor.id);
    const canEdit = this.isPlatformAdmin(actor) || MANAGER_ROLES.has(membership?.role ?? '') || [...match.sideAUserIds, ...match.sideBUserIds].includes(actor.id);
    if (!canEdit) apiError(ForbiddenException, 'MATCH_SCORE_PERMISSION_REQUIRED');
    return { match, session };
  }

  async startMatch(matchId: string, actor: Actor, expectedRevision?: number) {
    const { match } = await this.requireMatchEditor(matchId, actor);
    if (match.status === 'ONGOING') return this.repository.projectMatch(matchId);
    if (match.status !== 'SCHEDULED') apiError(ConflictException, 'MATCH_CANNOT_START');
    const revision = expectedRevision ?? match.revision;
    const db = this.repository.getDb();
    const [updated] = await db
      .update(schema.clubMatchSessionMatches)
      .set({ status: 'ONGOING', startedAt: new Date(), updatedAt: new Date(), revision: sql`${schema.clubMatchSessionMatches.revision} + 1` })
      .where(and(eq(schema.clubMatchSessionMatches.id, matchId), eq(schema.clubMatchSessionMatches.revision, revision), eq(schema.clubMatchSessionMatches.status, 'SCHEDULED')))
      .returning();
    if (!updated) apiError(ConflictException, 'STALE_MATCH_REVISION', { currentRevision: match.revision });
    const projected = await this.repository.projectMatch(matchId);
    this.liveScoreGateway.broadcastClubSessionMatchUpdate(match.sessionId, matchId, projected ?? updated, 'match:status');
    return projected;
  }

  async updateScore(matchId: string, actor: Actor, dto: UpdateMatchScoreDto) {
    const { match } = await this.requireMatchEditor(matchId, actor);
    if (!['SCHEDULED', 'ONGOING'].includes(match.status)) apiError(ConflictException, 'MATCH_SCORE_LOCKED');
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
      .where(and(eq(schema.clubMatchSessionMatches.id, matchId), eq(schema.clubMatchSessionMatches.revision, revision), inArray(schema.clubMatchSessionMatches.status, ['SCHEDULED', 'ONGOING'])))
      .returning();
    if (!updated) apiError(ConflictException, 'STALE_MATCH_REVISION', { currentRevision: match.revision });
    const projected = await this.repository.projectMatch(matchId);
    this.liveScoreGateway.broadcastClubSessionMatchUpdate(match.sessionId, matchId, projected ?? updated, 'score:update');
    return projected;
  }

  async completeMatch(matchId: string, actor: Actor, dto: UpdateMatchScoreDto) {
    const { match, session } = await this.requireMatchEditor(matchId, actor);
    if (match.status === 'COMPLETED') return this.repository.projectMatch(matchId);
    if (!['SCHEDULED', 'ONGOING'].includes(match.status)) apiError(ConflictException, 'MATCH_CANNOT_COMPLETE');
    if (dto.p1SetsWon === dto.p2SetsWon) apiError(BadRequestException, 'MATCH_WINNER_REQUIRED');
    const winnerSide = dto.p1SetsWon > dto.p2SetsWon ? 'A' : 'B';
    const revision = dto.expectedRevision ?? match.revision;
    const db = this.repository.getDb();
    const updated = await db.transaction(async (tx) => {
      const playerIds = [...match.sideAUserIds, ...match.sideBUserIds];
      const users = await tx.select({ id: schema.users.id, isMock: schema.users.isMock }).from(schema.users).where(inArray(schema.users.id, playerIds));
      const hasMock = users.some((user) => user.isMock);
      const eloStatus =
        !session.session.isRanked
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
        .where(and(eq(schema.clubMatchSessionMatches.id, matchId), eq(schema.clubMatchSessionMatches.revision, revision), inArray(schema.clubMatchSessionMatches.status, ['SCHEDULED', 'ONGOING'])))
        .returning();
      if (!row) apiError(ConflictException, 'STALE_MATCH_REVISION', { currentRevision: match.revision });
      if (eloStatus === 'PENDING') {
        await tx.insert(schema.matchEloOutbox).values({ matchId: null, clubMatchSessionMatchId: matchId, status: 'PENDING', attempts: 0 });
      }
      await this.repository.auditUpdate(tx, actor.id, 'club_match_session_matches', matchId, { status: match.status, revision: match.revision }, { status: 'COMPLETED', revision: row.revision, winnerSide, eloStatus });
      return row;
    });
    const projected = await this.repository.projectMatch(matchId);
    this.liveScoreGateway.broadcastClubSessionMatchUpdate(match.sessionId, matchId, projected ?? updated, 'match:status');
    this.liveScoreGateway.broadcastClubSessionMatchUpdate(match.sessionId, matchId, projected ?? updated, 'score:update');
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
