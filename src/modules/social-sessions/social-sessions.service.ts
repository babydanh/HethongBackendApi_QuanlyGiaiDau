import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '../../common/constants/enums';
import * as schema from '../../database/schema';
import {
  AddSocialParticipantDto,
  CreateSocialSessionDto,
  JoinSocialSessionDto,
  QuerySocialSessionsDto,
  UpdateSocialPaymentDto,
  UpdateSocialSessionDto,
} from './dto/social-session.dto';
import { SocialSessionsRepository } from './social-sessions.repository';

type Actor = { id: string; roles?: string[] };
type SessionRow = typeof schema.socialSessions.$inferSelect;

const MANAGER_ROLES = new Set(['OWNER', 'MODERATOR']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

/**
 * play_date = ngày dương lịch trong chuỗi ISO mà client gửi
 * (vd '2026-09-17T14:45:00+07:00' -> '2026-09-17').
 * Không dùng toISOString() vì sẽ lệch ngày theo múi giờ server.
 */
function toPlayDate(startAt: string): string {
  const date = new Date(startAt);
  if (Number.isNaN(date.getTime())) {
    apiError(BadRequestException, 'INVALID_START_AT');
  }
  const playDate = startAt.slice(0, 10);
  if (!DATE_RE.test(playDate)) {
    apiError(BadRequestException, 'INVALID_START_AT');
  }
  return playDate;
}

@Injectable()
export class SocialSessionsService {
  constructor(private readonly repository: SocialSessionsRepository) {}

  private isPlatformAdmin(actor: Actor): boolean {
    return Boolean(actor.roles?.some((role) => role === UserRole.ADMIN));
  }

  private async assertManager(session: SessionRow, actor: Actor): Promise<void> {
    if (session.hostUserId === actor.id) return;
    if (this.isPlatformAdmin(actor)) return;
    if (!session.communityId) {
      apiError(ForbiddenException, 'FORBIDDEN_NOT_MANAGER');
    }
    const member = await this.repository.findMember(session.communityId!, actor.id);
    if (!member || member.status !== 'JOINED' || !MANAGER_ROLES.has(member.role)) {
      apiError(ForbiddenException, 'FORBIDDEN_NOT_MANAGER');
    }
  }

  private async resolveCategoryId(sport: string) {
    const category = await this.repository.findCategoryBySlug(sport);
    if (!category) apiError(BadRequestException, 'CATEGORY_NOT_FOUND', { sport });
    return category!.id;
  }

  private shapeDetail(
    row: NonNullable<Awaited<ReturnType<SocialSessionsRepository['findSessionById']>>>,
    participants: Awaited<ReturnType<SocialSessionsRepository['listParticipants']>>,
    viewerId?: string,
  ) {
    const joined = participants.filter((p) => p.participant.status === 'JOINED');
    return {
      ...row.session,
      community: row.session.communityId
        ? { id: row.session.communityId, name: row.communityName, logoUrl: row.communityLogoUrl }
        : null,
      sport: row.categorySlug,
      sportName: row.categoryName,
      participants: joined.map((p) => ({
        ...p.participant,
        fullName: p.fullName,
        avatarUrl: p.avatarUrl,
      })),
      isJoined: viewerId
        ? joined.some((p) => p.participant.userId === viewerId)
        : false,
      isHost: viewerId ? row.session.hostUserId === viewerId : false,
    };
  }

  async create(actor: Actor, dto: CreateSocialSessionDto) {
    const categoryId = await this.resolveCategoryId(dto.sport);
    if (dto.communityId) {
      const community = await this.repository.findCommunityById(dto.communityId);
      if (!community) {
        apiError(NotFoundException, 'COMMUNITY_NOT_FOUND');
      }
      if (dto.visibility === 'CLUB_ONLY') {
        const member = await this.repository.findMember(dto.communityId, actor.id);
        if (!member || member.status !== 'JOINED') {
          apiError(ForbiddenException, 'NOT_CLUB_MEMBER');
        }
      }
    } else if (dto.visibility === 'CLUB_ONLY') {
      apiError(BadRequestException, 'CLUB_ONLY_REQUIRES_COMMUNITY');
    }

    const startAt = new Date(dto.startAt);
    const { session } = await this.repository.createWithHost(
      {
        communityId: dto.communityId ?? null,
        hostUserId: actor.id,
        categoryId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        playFormat: dto.playFormat ?? 'Giao lưu',
        playDate: toPlayDate(dto.startAt),
        startAt,
        durationMinutes: dto.durationMinutes ?? 120,
        venueName: dto.venueName.trim(),
        venueAddress: dto.venueAddress.trim(),
        maxSlots: dto.maxSlots ?? 6,
        currentSlots: 1,
        feePerSlot: dto.feePerSlot ?? 0,
        levelRequirement: dto.levelRequirement ?? 'ALL',
        visibility: dto.visibility ?? 'PUBLIC',
        contactPhone: dto.contactPhone ?? null,
        zaloGroupUrl: dto.zaloGroupUrl ?? null,
        status: 'OPEN',
      },
      actor.id,
    );
    return this.getById(session.id, actor.id);
  }

  async list(query: QuerySocialSessionsDto, viewerId?: string) {
    if (!DATE_RE.test(query.date)) {
      apiError(BadRequestException, 'INVALID_DATE');
    }
    const categoryId = query.sport
      ? await this.resolveCategoryId(query.sport)
      : undefined;
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { items, total } = await this.repository.listByDate({
      playDate: query.date,
      categoryId,
      communityId: query.communityId,
      search: query.search,
      page,
      limit,
    });
    return {
      items: items.map((row) => ({
        ...row.session,
        community: row.session.communityId
          ? { id: row.session.communityId, name: row.communityName, logoUrl: row.communityLogoUrl }
          : null,
        sport: row.categorySlug,
      })),
      meta: { page, limit, total },
    };
  }

  async getById(id: string, viewerId?: string) {
    const row = await this.repository.findSessionById(id);
    if (!row) apiError(NotFoundException, 'SESSION_NOT_FOUND');
    const participants = await this.repository.listParticipants(id);
    return this.shapeDetail(row!, participants, viewerId);
  }

  async update(actor: Actor, id: string, dto: UpdateSocialSessionDto) {
    const row = await this.repository.findSessionById(id);
    if (!row) apiError(NotFoundException, 'SESSION_NOT_FOUND');
    await this.assertManager(row!.session, actor);

    const session = row!.session;
    if (session.status === 'COMPLETED' || session.status === 'CANCELLED') {
      apiError(BadRequestException, 'SESSION_CLOSED');
    }
    if (dto.maxSlots !== undefined && dto.maxSlots < session.currentSlots) {
      apiError(BadRequestException, 'MAX_SLOTS_BELOW_CURRENT', {
        currentSlots: session.currentSlots,
      });
    }
    const visibility = dto.visibility ?? session.visibility;
    const communityId = session.communityId;
    if (visibility === 'CLUB_ONLY' && !communityId) {
      apiError(BadRequestException, 'CLUB_ONLY_REQUIRES_COMMUNITY');
    }

    const patch: Partial<typeof schema.socialSessions.$inferInsert> = {};
    if (dto.title !== undefined) patch.title = dto.title.trim();
    if (dto.description !== undefined) patch.description = dto.description.trim() || null;
    if (dto.playFormat !== undefined) patch.playFormat = dto.playFormat;
    if (dto.startAt !== undefined) {
      patch.startAt = new Date(dto.startAt);
      patch.playDate = toPlayDate(dto.startAt);
    }
    if (dto.durationMinutes !== undefined) patch.durationMinutes = dto.durationMinutes;
    if (dto.venueName !== undefined) patch.venueName = dto.venueName.trim();
    if (dto.venueAddress !== undefined) patch.venueAddress = dto.venueAddress.trim();
    if (dto.maxSlots !== undefined) patch.maxSlots = dto.maxSlots;
    if (dto.feePerSlot !== undefined) patch.feePerSlot = dto.feePerSlot;
    if (dto.levelRequirement !== undefined) patch.levelRequirement = dto.levelRequirement;
    if (dto.visibility !== undefined) patch.visibility = dto.visibility;
    if (dto.contactPhone !== undefined) patch.contactPhone = dto.contactPhone;
    if (dto.zaloGroupUrl !== undefined) patch.zaloGroupUrl = dto.zaloGroupUrl ?? null;
    if (dto.status !== undefined) patch.status = dto.status;

    const updated = await this.repository.updateSession(id, patch);
    return this.getById(updated!.id, actor.id);
  }

  async cancel(actor: Actor, id: string) {
    const row = await this.repository.findSessionById(id);
    if (!row) apiError(NotFoundException, 'SESSION_NOT_FOUND');
    await this.assertManager(row!.session, actor);
    const deleted = await this.repository.softDelete(id);
    return { id: deleted!.id, status: deleted!.status };
  }

  private async doJoin(
    session: SessionRow,
    userId: string,
    ticketCount: number,
    role: 'HOST' | 'PLAYER',
  ) {
    if (session.visibility === 'CLUB_ONLY') {
      const member = await this.repository.findMember(session.communityId!, userId);
      if (!member || member.status !== 'JOINED') {
        apiError(ForbiddenException, 'NOT_CLUB_MEMBER');
      }
    }
    const outcome = await this.repository.joinOrAddParticipant(
      session.id,
      userId,
      ticketCount,
      role,
    );
    if (!outcome.ok) {
      if (outcome.code === 'SESSION_NOT_FOUND') {
        apiError(NotFoundException, 'SESSION_NOT_FOUND');
      }
      if (outcome.code === 'SESSION_FULL') {
        apiError(ConflictException, 'SESSION_FULL');
      }
      if (outcome.code === 'ALREADY_JOINED') {
        apiError(ConflictException, 'ALREADY_JOINED');
      }
      apiError(BadRequestException, 'SESSION_CLOSED');
    }
    return outcome;
  }

  /** Member của Club (hoặc mọi user với kèo PUBLIC) tự tham gia. */
  async join(actor: Actor, id: string, dto: JoinSocialSessionDto) {
    const row = await this.repository.findSessionById(id);
    if (!row) apiError(NotFoundException, 'SESSION_NOT_FOUND');
    const outcome = await this.doJoin(row!.session, actor.id, dto.ticketCount ?? 1, 'PLAYER');
    if (!outcome.ok) apiError(BadRequestException, 'SESSION_CLOSED');
    return outcome;
  }

  /** Admin/Host thêm người (user phải có tài khoản; kèo CLUB_ONLY: phải là member). */
  async addParticipant(actor: Actor, id: string, dto: AddSocialParticipantDto) {
    const row = await this.repository.findSessionById(id);
    if (!row) apiError(NotFoundException, 'SESSION_NOT_FOUND');
    await this.assertManager(row!.session, actor);
    const target = await this.repository.findUserById(dto.userId);
    if (!target) apiError(NotFoundException, 'USER_NOT_FOUND');
    const outcome = await this.doJoin(row!.session, dto.userId, dto.ticketCount ?? 1, 'PLAYER');
    if (!outcome.ok) apiError(BadRequestException, 'SESSION_CLOSED');
    return outcome;
  }

  /** Admin/Host xóa người (rời hộ/kick). Không xóa HOST qua endpoint này. */
  async removeParticipant(actor: Actor, id: string, userId: string) {
    const row = await this.repository.findSessionById(id);
    if (!row) apiError(NotFoundException, 'SESSION_NOT_FOUND');
    await this.assertManager(row!.session, actor);
    if (row!.session.hostUserId === userId) {
      apiError(BadRequestException, 'CANNOT_REMOVE_HOST');
    }
    const removed = await this.repository.removeParticipant(id, userId, 'KICKED');
    if (!removed) apiError(NotFoundException, 'PARTICIPANT_NOT_FOUND');
    return removed;
  }

  /** Host/Admin cập nhật trạng thái thu tiền (bản gọn v1, chưa qua bảng payments). */
  async updatePayment(
    actor: Actor,
    id: string,
    userId: string,
    dto: UpdateSocialPaymentDto,
  ) {
    const row = await this.repository.findSessionById(id);
    if (!row) apiError(NotFoundException, 'SESSION_NOT_FOUND');
    await this.assertManager(row!.session, actor);
    const updated = await this.repository.updatePaymentStatus(id, userId, dto.paymentStatus);
    if (!updated) apiError(NotFoundException, 'PARTICIPANT_NOT_FOUND');
    return updated;
  }
}
