import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { UserRole } from '../../common/constants/enums';
import * as schema from '../../database/schema';
import { ChatService } from '../chat/chat.service';
import {
  AddSocialParticipantDto,
  CreateSocialSessionDto,
  JoinSocialSessionDto,
  QuerySocialByCommunityDto,
  QuerySocialSessionsDto,
  SendSocialMessageDto,
  SOCIAL_STATUSES,
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
  constructor(
    private readonly repository: SocialSessionsRepository,
    @Optional() private readonly chatService?: ChatService,
  ) {}

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

  /** Hết giờ = NOW() >= startAt + durationMinutes. */
  private isExpired(session: SessionRow, now: Date = new Date()): boolean {
    const start = session.startAt instanceof Date ? session.startAt : new Date(session.startAt);
    if (Number.isNaN(start.getTime())) return false;
    return now.getTime() >= start.getTime() + session.durationMinutes * 60000;
  }

  /**
   * Lazy auto-close: session OPEN/FULL đã quá giờ → COMPLETED ngay khi có
   * request chạm vào (kết hợp với cron dọn nền). Trả về row mới nhất.
   */
  private async refreshStatusIfExpired(session: SessionRow): Promise<SessionRow> {
    if (
      (session.status === 'OPEN' || session.status === 'FULL') &&
      this.isExpired(session)
    ) {
      const updated = await this.repository.updateSession(session.id, {
        status: 'COMPLETED',
      });
      if (updated) return updated;
    }
    return session;
  }

  private assertSocialWritable(session: SessionRow): void {
    if (session.status === 'CANCELLED' || session.status === 'COMPLETED') {
      apiError(BadRequestException, 'SESSION_CLOSED');
    }
  }

  /** Chỉ host hoặc participant JOINED mới được đọc/gửi chat Social. */
  private async assertSocialParticipant(session: SessionRow, userId: string): Promise<void> {
    if (session.hostUserId === userId) return;
    const joined = await this.repository.isParticipant(session.id, userId);
    if (!joined) {
      apiError(ForbiddenException, 'FORBIDDEN_NOT_PARTICIPANT');
    }
  }

  private shapeDetail(
    row: NonNullable<Awaited<ReturnType<SocialSessionsRepository['findSessionById']>>>,
    participants: Awaited<ReturnType<SocialSessionsRepository['listParticipants']>>,
    viewerId?: string,
    chat?: { chatRoomId: string | null; chatMessages: unknown },
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
      chatRoomId: chat?.chatRoomId ?? null,
      chatMessages: chat?.chatMessages ?? null,
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
    const session = await this.refreshStatusIfExpired(row!.session);
    const participants = await this.repository.listParticipants(id);

    // Chat preview (20 tin mới nhất): chỉ participant mới thấy.
    let chat: { chatRoomId: string | null; chatMessages: unknown } | undefined;
    const isParticipant =
      !!viewerId &&
      (session.hostUserId === viewerId ||
        participants.some(
          (p) => p.participant.userId === viewerId && p.participant.status === 'JOINED',
        ));
    if (isParticipant && this.chatService) {
      try {
        const room = await this.chatService.getOrCreateSocialRoom(id, viewerId!);
        const page = await this.chatService.getMessages(viewerId!, room.id, 20);
        chat = { chatRoomId: room.id, chatMessages: page };
      } catch {
        chat = { chatRoomId: null, chatMessages: null };
      }
    }
    return this.shapeDetail({ ...row!, session }, participants, viewerId, chat);
  }

  /**
   * List Social thuộc 1 CLB (kể cả quá ngày / đã xong) cho trang CLB.
   * - Mặc định status = OPEN,FULL,COMPLETED; CANCELLED chỉ manager thấy.
   * - Kèo CLUB_ONLY chỉ member JOINED của club thấy; khách chỉ thấy PUBLIC.
   */
  async listByCommunity(
    viewer: Actor | undefined,
    communityId: string,
    query: QuerySocialByCommunityDto,
  ) {
    const community = await this.repository.findCommunityById(communityId);
    if (!community) apiError(NotFoundException, 'COMMUNITY_NOT_FOUND');

    const rawStatuses = (query.status ?? 'OPEN,FULL,COMPLETED')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    for (const s of rawStatuses) {
      if (!(SOCIAL_STATUSES as readonly string[]).includes(s)) {
        apiError(BadRequestException, 'INVALID_STATUS', { status: s });
      }
    }
    let statuses = [...new Set(rawStatuses)];

    if (query.from && !DATE_RE.test(query.from)) {
      apiError(BadRequestException, 'INVALID_FROM_DATE');
    }
    if (query.to && !DATE_RE.test(query.to)) {
      apiError(BadRequestException, 'INVALID_TO_DATE');
    }

    const categoryId = query.sport
      ? await this.resolveCategoryId(query.sport)
      : undefined;

    // Phân quyền xem.
    const viewerId = viewer?.id;
    let isMember = false;
    let isManager = !!viewer && this.isPlatformAdmin(viewer);
    if (viewerId) {
      const member = await this.repository.findMember(communityId, viewerId);
      isMember = !!member && member.status === 'JOINED';
      if (member && member.status === 'JOINED' && MANAGER_ROLES.has(member.role)) {
        isManager = true;
      }
      // Host của kèo không hẳn là manager club — CANCELLED vẫn ẩn với họ ở list.
    }
    if (!isManager) {
      statuses = statuses.filter((s) => s !== 'CANCELLED');
    }
    if (statuses.length === 0) {
      return { items: [], meta: { page: query.page ?? 1, limit: query.limit ?? 20, total: 0 } };
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { items, total } = await this.repository.listByCommunity({
      communityId,
      statuses,
      from: query.from,
      to: query.to,
      categoryId,
      visibility: isMember ? undefined : 'PUBLIC',
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

  async update(actor: Actor, id: string, dto: UpdateSocialSessionDto) {
    const row = await this.repository.findSessionById(id);
    if (!row) apiError(NotFoundException, 'SESSION_NOT_FOUND');
    await this.assertManager(row!.session, actor);

    const session = await this.refreshStatusIfExpired(row!.session);
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

  /**
   * Bước 1 — Hủy kèo: đánh dấu CANCELLED (không set deletedAt để GET detail
   * vẫn xem được; list theo ngày vốn chỉ hiện OPEN/FULL nên tự ẩn).
   */
  async cancel(actor: Actor, id: string) {
    const row = await this.repository.findSessionById(id);
    if (!row) apiError(NotFoundException, 'SESSION_NOT_FOUND');
    await this.assertManager(row!.session, actor);
    const session = await this.refreshStatusIfExpired(row!.session);
    if (session.status === 'CANCELLED' || session.status === 'COMPLETED') {
      apiError(BadRequestException, 'SESSION_ALREADY_CLOSED');
    }
    const cancelled = await this.repository.cancelSession(id);
    return { id: cancelled!.id, status: cancelled!.status };
  }

  /**
   * Bước 2 — Xóa kèo: xóa cứng hoàn toàn (participants + chat đi theo nhờ
   * CASCADE). Chỉ cho xóa khi đã CANCELLED.
   */
  async remove(actor: Actor, id: string) {
    const row = await this.repository.findSessionById(id);
    if (!row) apiError(NotFoundException, 'SESSION_NOT_FOUND');
    await this.assertManager(row!.session, actor);
    if (row!.session.status !== 'CANCELLED') {
      apiError(BadRequestException, 'MUST_CANCEL_FIRST');
    }
    const deleted = await this.repository.hardDelete(id);
    if (!deleted) apiError(NotFoundException, 'SESSION_NOT_FOUND');
    return { id: deleted!.id, deleted: true };
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
    const session = await this.refreshStatusIfExpired(row!.session);
    const outcome = await this.doJoin(session, actor.id, dto.ticketCount ?? 1, 'PLAYER');
    if (!outcome.ok) apiError(BadRequestException, 'SESSION_CLOSED');
    return outcome;
  }

  /** Admin/Host thêm người (user phải có tài khoản; kèo CLUB_ONLY: phải là member). */
  async addParticipant(actor: Actor, id: string, dto: AddSocialParticipantDto) {
    const row = await this.repository.findSessionById(id);
    if (!row) apiError(NotFoundException, 'SESSION_NOT_FOUND');
    await this.assertManager(row!.session, actor);
    const session = await this.refreshStatusIfExpired(row!.session);
    this.assertSocialWritable(session);
    const target = await this.repository.findUserById(dto.userId);
    if (!target) apiError(NotFoundException, 'USER_NOT_FOUND');
    const outcome = await this.doJoin(session, dto.userId, dto.ticketCount ?? 1, 'PLAYER');
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

  private requireChat(): ChatService {
    if (!this.chatService) {
      apiError(BadRequestException, 'CHAT_UNAVAILABLE');
    }
    return this.chatService!;
  }

  /** Lịch sử chat Social (cursor pagination kiểu messenger). Chỉ participant. */
  async getSocialMessages(
    actor: Actor,
    id: string,
    limit = 20,
    cursor?: string,
  ) {
    const row = await this.repository.findSessionById(id);
    if (!row) apiError(NotFoundException, 'SESSION_NOT_FOUND');
    const session = await this.refreshStatusIfExpired(row!.session);
    await this.assertSocialParticipant(session, actor.id);
    const chat = this.requireChat();
    const room = await chat.getOrCreateSocialRoom(id, actor.id);
    return chat.getMessages(actor.id, room.id, limit, cursor);
  }

  /** Gửi tin nhắn vào chat Social. Chỉ participant; kèo đóng thì chỉ đọc. */
  async sendSocialMessage(actor: Actor, id: string, dto: SendSocialMessageDto) {
    const row = await this.repository.findSessionById(id);
    if (!row) apiError(NotFoundException, 'SESSION_NOT_FOUND');
    const session = await this.refreshStatusIfExpired(row!.session);
    this.assertSocialWritable(session);
    await this.assertSocialParticipant(session, actor.id);
    const chat = this.requireChat();
    const room = await chat.getOrCreateSocialRoom(id, actor.id);
    return chat.sendMessage(actor.id, {
      roomId: room.id,
      messageText: dto.messageText,
      attachmentsUrls: dto.attachmentsUrls,
      replyToId: dto.replyToId,
    });
  }
}
