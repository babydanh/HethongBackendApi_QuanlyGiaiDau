import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  HttpStatus,
} from '@nestjs/common';
import { CommunitiesRepository } from './communities.repository';
import { BaseException } from '../../common/exceptions/base.exception';
import { CreateCommunityDto } from './dto/create-community.dto';
import { UpdateCommunityDto } from './dto/update-community.dto';
import { QueryCommunityDto } from './dto/query-community.dto';
import { ReviewCommunityDto } from './dto/review-community.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { UserRole } from '../../common/constants/enums';
import { NotificationsService } from '../notifications/notifications.service';
import {
  buildCommunityBannedNotification,
  buildCommunityInviteNotification,
  buildCommunityInviteRevokedNotification,
  buildCommunityKickedNotification,
  buildCommunityOwnershipTransferredNotification,
  buildCommunityRoleDemotedNotification,
  buildCommunityRolePromotedNotification,
  buildCommunityUnbannedNotification,
} from '../notifications/notification-builder';
import { StorageService } from '../../providers/storage/storage.service';
import { isStoredImageUrl, extractStoredImagePublicId } from '../../common/helpers/cloudinary.helper';

type CommunityMemberRole = 'OWNER' | 'MODERATOR' | 'MEMBER';
type CommunityMemberStatus = 'JOINED' | 'PENDING' | 'INVITED' | 'REJECTED' | 'BANNED';
type SanitizeHtmlFn = (html: string, options?: Record<string, unknown>) => string;

@Injectable()
export class CommunitiesService {
  private readonly logger = new Logger(CommunitiesService.name);

  constructor(
    private readonly communitiesRepository: CommunitiesRepository,
    private readonly notificationsService: NotificationsService,
    private readonly storageService: StorageService,
  ) {}

  // --- COMMUNITIES ---

  async findAll(query: QueryCommunityDto) {
    return await this.communitiesRepository.findAll(query);
  }

  async findMyCommunities(userId: string) {
    return await this.communitiesRepository.findMyCommunities(userId);
  }

  async getMyInvites(userId: string) {
    this.logger.log(`Lấy danh sách lời mời cộng đồng của user ${userId}`);
    return await this.communitiesRepository.findInvitesByUser(userId);
  }

  // --- DASHBOARD ---

  async getDashboard(communityId: string) {
    await this.findById(communityId);

    const [recentMatches, featuredTournament, topPlayers, activity, upcomingMatches] =
      await Promise.all([
        this.communitiesRepository.getRecentMatches(communityId, 3),
        this.communitiesRepository.getFeaturedTournament(communityId),
        this.communitiesRepository.getTopRanked(communityId, 3),
        this.communitiesRepository.getActivityFeed(communityId, 5),
        this.communitiesRepository.getUpcomingMatches(communityId, 3),
      ]);

    return { recentMatches, featuredTournament, topPlayers, activity, upcomingMatches };
  }

  // --- MY MEMBERSHIP ---

  async getMyMembership(userId: string, communityId: string) {
    const member = await this.communitiesRepository.findMyMembership(
      userId,
      communityId,
    );
    if (!member) {
      throw new BaseException(
        'Bạn chưa tham gia cộng đồng này.',
        'NOT_MEMBER',
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      role: member.role,
      status: member.status,
      memberId: member.id,
      joinedAt: member.joinedAt,
      joinAnswers: member.joinAnswers ?? null,
    };
  }

  async findById(id: string, user?: { id: string; roles: string[] }) {
    const community = await this.communitiesRepository.findById(id);
    if (!community) {
      throw new NotFoundException('Community not found');
    }
    // Nếu community bị khoá (REJECTED), chỉ ADMIN/MODERATOR mới xem được
    if (community.status === 'REJECTED') {
      const isAdmin = user?.roles?.some(r => r === UserRole.ADMIN || r === UserRole.MODERATOR);
      if (!isAdmin) {
        throw new ForbiddenException('Cộng đồng này đã bị vô hiệu hoá.');
      }
    }
    return community;
  }

  async create(userId: string, dto: CreateCommunityDto) {
    const activeCount = await this.communitiesRepository.countActiveByCreator(userId);
    if (activeCount >= 5) {
      throw new BadRequestException('Mỗi người dùng chỉ được phép tạo tối đa 5 cộng đồng.');
    }

    const { lat, lng, categoryIds, ...rest } = dto;
    const data = {
      ...rest,
      ...(rest.description !== undefined
        ? { description: await this.sanitizeDescription(rest.description) }
        : {}),
      creatorId: userId,
      status: 'ACTIVE',
    };
    return await this.communitiesRepository.create(data, lat, lng, categoryIds);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateCommunityDto,
    roles: string[],
  ) {
    const community = await this.findById(id);
    await this.checkPermissions(community.id, userId, roles, [
      'OWNER',
      'MODERATOR',
    ]);

    const { lat, lng, categoryIds, ...rest } = dto;
    if (rest.description !== undefined) {
      rest.description = await this.sanitizeDescription(rest.description);
    }
    return await this.communitiesRepository.update(
      id,
      rest,
      lat,
      lng,
      categoryIds,
    );
  }

  async review(adminId: string, id: string, dto: ReviewCommunityDto, roles: string[] = [UserRole.ADMIN]) {
    await this.findById(id, { id: adminId, roles });
    const targetStatus = dto.status === 'APPROVED' ? 'ACTIVE' : 'REJECTED';
    const updateData = {
      status: targetStatus,
      approvedBy: adminId,
      reviewedAt: new Date(),
      rejectedReason: dto.status === 'APPROVED' ? null : (dto.rejectedReason || null),
    };
    return await this.communitiesRepository.update(id, updateData);
  }

  async remove(userId: string, id: string, roles: string[]) {
    const community = await this.findById(id);
    // ADMIN can delete anything. Otherwise, must be OWNER.
    if (!roles.includes(UserRole.ADMIN)) {
      await this.checkPermissions(community.id, userId, roles, ['OWNER']);
    }

    return await this.communitiesRepository.delete(id);
  }

  // --- MEMBERS ---

  async getMembers(id: string, query?: { page?: number; limit?: number; status?: string }) {
    await this.findById(id);
    const result = await this.communitiesRepository.getMembers(id, query?.status, query?.page, query?.limit);
    // P2C.3 — gắn streak tính động (WIN/LOSS/ELO_UP) cho từng member trong trang.
    const streaks = await this.computeStreaks(
      id,
      result.data.map((row) => row.user.id),
    );
    return {
      ...result,
      data: result.data.map((row) => ({
        ...row,
        streak: streaks[row.user.id] ?? null,
      })),
    };
  }

  async addMember(
    requesterId: string,
    communityId: string,
    dto: AddMemberDto,
    roles: string[],
  ) {
    await this.checkPermissions(communityId, requesterId, roles, [
      'OWNER',
      'MODERATOR',
    ]);

    // Check if target user is already a member
    const existing = await this.communitiesRepository.findMember(
      communityId,
      dto.userId,
    );
    if (existing) {
      throw new ConflictException('User is already a member of this community');
    }

    const requesterMember = await this.communitiesRepository.findMember(
      communityId,
      requesterId,
    );

    if (dto.role === 'OWNER') {
      throw new BadRequestException('Không thể thêm trực tiếp chủ sở hữu mới.');
    }

    if (requesterMember?.role === 'MODERATOR' && dto.role !== 'MEMBER') {
      throw new ForbiddenException('Quản trị viên chỉ có thể thêm thành viên thường.');
    }

    return await this.communitiesRepository.addMember(
      communityId,
      dto.userId,
      dto.role,
    );
  }

  async updateMemberRole(
    requesterId: string,
    communityId: string,
    targetUserId: string,
    dto: UpdateMemberDto,
    roles: string[],
  ) {
    await this.checkPermissions(communityId, requesterId, roles, ['OWNER']); // Only OWNER can change roles

    const existing = await this.communitiesRepository.findMember(
      communityId,
      targetUserId,
    );
    if (!existing) {
      throw new NotFoundException('Target user is not a member');
    }

    if (existing.status !== 'JOINED') {
      throw new BadRequestException('Chỉ thành viên đã tham gia mới được thay đổi vai trò.');
    }

    if (dto.role === 'OWNER') {
      if (requesterId === targetUserId) {
        throw new ConflictException('You are already the OWNER');
      }

      const ownershipTransferred = await this.communitiesRepository.transferOwnership(
        communityId,
        requesterId,
        targetUserId,
      );

      const community = await this.findById(communityId);
      await this.notificationsService.sendNotification(
        buildCommunityOwnershipTransferredNotification({
          communityId,
          communityName: community.name,
          receiverId: targetUserId,
        }),
      );

      return ownershipTransferred;
    }

    // Prevent demoting self (optional, but good practice to ensure at least 1 owner remains)
    if (requesterId === targetUserId) {
      throw new ForbiddenException('Cannot demote yourself from OWNER role');
    }

    const updatedMember = await this.communitiesRepository.updateMemberRole(
      communityId,
      targetUserId,
      dto.role,
    );

    const community = await this.findById(communityId);
    const roleLabel = this.getCommunityRoleLabel(dto.role);
    const previousRole = existing.role as CommunityMemberRole;
    const notificationBuilder =
      this.isRolePromotion(previousRole, dto.role)
        ? buildCommunityRolePromotedNotification
        : buildCommunityRoleDemotedNotification;

    await this.notificationsService.sendNotification(
      notificationBuilder({
        communityId,
        communityName: community.name,
        receiverId: targetUserId,
        roleLabel,
      }),
    );

    return updatedMember;
  }

  async removeMember(
    requesterId: string,
    communityId: string,
    targetUserId: string,
    roles: string[],
  ) {
    // If user is removing themselves, allow it (leave community).
    // Otherwise, must be OWNER or MODERATOR.
    if (requesterId !== targetUserId) {
      await this.checkPermissions(communityId, requesterId, roles, [
        'OWNER',
        'MODERATOR',
      ]);
    }

    const existing = await this.communitiesRepository.findMember(
      communityId,
      targetUserId,
    );
    if (!existing) {
      throw new NotFoundException('User is not a member');
    }

    if (existing.status === 'PENDING') {
      throw new BadRequestException('Hãy xử lý đơn tham gia bằng luồng duyệt đơn, không xóa trực tiếp.');
    }

    if (requesterId === targetUserId && existing.role === 'OWNER' && existing.status === 'JOINED') {
      throw new ForbiddenException('Chủ sở hữu không thể tự rời cộng đồng. Hãy chuyển quyền trước.');
    }

    if (existing.role === 'OWNER' && requesterId !== targetUserId) {
      throw new ForbiddenException('Cannot remove an OWNER');
    }

    const requesterMember =
      requesterId === targetUserId
        ? existing
        : await this.communitiesRepository.findMember(communityId, requesterId);

    if (
      requesterId !== targetUserId &&
      requesterMember?.role === 'MODERATOR' &&
      existing.role !== 'MEMBER'
    ) {
      throw new ForbiddenException('Quản trị viên chỉ có thể mời ra thành viên thường.');
    }

    const removedMember = await this.communitiesRepository.removeMember(
      communityId,
      targetUserId,
    );

    if (requesterId !== targetUserId) {
      const community = await this.findById(communityId);

      if (existing.status === 'INVITED') {
        await this.notificationsService.sendNotification(
          buildCommunityInviteRevokedNotification({
            communityId,
            communityName: community.name,
            receiverId: targetUserId,
          }),
        );
      } else if (existing.status === 'JOINED') {
        await this.notificationsService.sendNotification(
          buildCommunityKickedNotification({
            communityId,
            communityName: community.name,
            receiverId: targetUserId,
          }),
        );
      }
    }

    return removedMember;
  }

  // --- JOIN & FOLLOW ---

  async joinCommunity(userId: string, id: string, answers?: Record<string, string>) {
    const community = await this.findById(id);
    const existing = await this.communitiesRepository.findMember(id, userId);
    
    if (existing) {
      if (existing.status === 'BANNED') throw new ForbiddenException('You are banned from this community');
      if (existing.status === 'JOINED' || existing.status === 'PENDING') {
        throw new ConflictException('You are already a member or have a pending request');
      }
      // Delete old rejected record to insert a clean new request
      await this.communitiesRepository.removeMember(id, userId);
    }

    if (community.joinMode === 'INVITE_ONLY') {
      throw new ForbiddenException('This community is invite-only');
    }

    const status = community.joinMode === 'OPEN' ? 'JOINED' : 'PENDING';
    return await this.communitiesRepository.addMember(id, userId, 'MEMBER', status, answers);
  }

  async reviewJoinRequest(
    userId: string,
    id: string,
    memberId: string,
    action: 'APPROVE' | 'REJECT',
    roles: string[]
  ) {
    await this.checkPermissions(id, userId, roles, ['OWNER', 'MODERATOR']);
    
    const member = await this.communitiesRepository.findMember(id, memberId);
    if (!member || member.status !== 'PENDING') {
      throw new NotFoundException('Pending request not found');
    }

    const newStatus = action === 'APPROVE' ? 'JOINED' : 'REJECTED';
    return await this.communitiesRepository.updateMemberStatus(id, memberId, newStatus, userId);
  }

  async followCommunity(userId: string, id: string) {
    await this.findById(id); // ensure exists
    try {
      return await this.communitiesRepository.addFollow(id, userId, 'FOLLOW');
    } catch {
      throw new ConflictException('Already following');
    }
  }

  async unfollowCommunity(userId: string, id: string) {
    return await this.communitiesRepository.removeFollow(id, userId, 'FOLLOW');
  }

  async favoriteCommunity(userId: string, id: string) {
    await this.findById(id);
    try {
      return await this.communitiesRepository.addFollow(id, userId, 'FAVORITE');
    } catch {
      throw new ConflictException('Already favorited');
    }
  }

  async unfavoriteCommunity(userId: string, id: string) {
    return await this.communitiesRepository.removeFollow(id, userId, 'FAVORITE');
  }

  async getFavorites(userId: string) {
    return await this.communitiesRepository.getFavorites(userId);
  }

  async getJoinRequests(userId: string, id: string, roles: string[]) {
    await this.checkPermissions(id, userId, roles, ['OWNER', 'MODERATOR']);
    return await this.communitiesRepository.getMembers(id, 'PENDING', 1, 200);
  }

  async inviteMember(userId: string, id: string, targetUserId: string, role: CommunityMemberRole, roles: string[]) {
    await this.checkPermissions(id, userId, roles, ['OWNER', 'MODERATOR']);
    const existing = await this.communitiesRepository.findMember(id, targetUserId);
    if (existing) throw new ConflictException('User is already a member or pending');

    if (role === 'OWNER') {
      throw new BadRequestException('Không thể gửi lời mời với vai trò chủ sở hữu.');
    }

    const requesterMember = await this.communitiesRepository.findMember(id, userId);
    if (requesterMember?.role === 'MODERATOR' && role !== 'MEMBER') {
      throw new ForbiddenException('Quản trị viên chỉ có thể mời thành viên thường.');
    }

    const invitedMember = await this.communitiesRepository.addMember(
      id,
      targetUserId,
      role,
      'INVITED',
      undefined,
      userId,
    );

    const community = await this.findById(id);
    await this.notificationsService.sendNotification(
      buildCommunityInviteNotification({
        communityId: id,
        communityName: community.name,
        inviterName: 'Ban quản trị',
        receiverId: targetUserId,
        senderId: userId,
      }),
    );

    return invitedMember;
  }

  async banMember(
    requesterId: string,
    communityId: string,
    targetUserId: string,
    roles: string[],
  ) {
    await this.checkPermissions(communityId, requesterId, roles, ['OWNER', 'MODERATOR']);

    const existing = await this.communitiesRepository.findMember(communityId, targetUserId);
    if (!existing) {
      throw new NotFoundException('User is not a member');
    }

    if (existing.status === 'BANNED') {
      throw new ConflictException('Người dùng này đã bị cấm khỏi cộng đồng.');
    }

    if (existing.status !== 'JOINED') {
      throw new BadRequestException('Chỉ có thể cấm thành viên chính thức của cộng đồng.');
    }

    if (requesterId === targetUserId) {
      throw new ForbiddenException('Bạn không thể tự cấm chính mình.');
    }

    if (existing.role === 'OWNER') {
      throw new ForbiddenException('Không thể cấm chủ sở hữu cộng đồng.');
    }

    const requesterMember = await this.communitiesRepository.findMember(communityId, requesterId);
    if (
      requesterMember?.role === 'MODERATOR' &&
      existing.role !== 'MEMBER'
    ) {
      throw new ForbiddenException('Quản trị viên chỉ có thể cấm thành viên thường.');
    }

    const bannedMember = await this.communitiesRepository.updateMemberStatus(
      communityId,
      targetUserId,
      'BANNED',
      requesterId,
    );

    const community = await this.findById(communityId);
    await this.notificationsService.sendNotification(
      buildCommunityBannedNotification({
        communityId,
        communityName: community.name,
        receiverId: targetUserId,
      }),
    );

    return bannedMember;
  }

  async unbanMember(
    requesterId: string,
    communityId: string,
    targetUserId: string,
    roles: string[],
  ) {
    await this.checkPermissions(communityId, requesterId, roles, ['OWNER', 'MODERATOR']);

    const existing = await this.communitiesRepository.findMember(communityId, targetUserId);
    if (!existing || existing.status !== 'BANNED') {
      throw new NotFoundException('Không tìm thấy thành viên đang bị cấm.');
    }

    const requesterMember = await this.communitiesRepository.findMember(communityId, requesterId);
    if (
      requesterMember?.role === 'MODERATOR' &&
      existing.role !== 'MEMBER'
    ) {
      throw new ForbiddenException('Quản trị viên chỉ có thể gỡ cấm thành viên thường.');
    }

    const removedBan = await this.communitiesRepository.removeMember(
      communityId,
      targetUserId,
    );

    const community = await this.findById(communityId);
    await this.notificationsService.sendNotification(
      buildCommunityUnbannedNotification({
        communityId,
        communityName: community.name,
        receiverId: targetUserId,
      }),
    );

    return removedBan;
  }

  /**
   * P2C.3 — Tính streak động từ dữ liệu trận đấu thật (KHÔNG lưu DB).
   * Trả map userId → { type: 'WIN'|'LOSS'|'ELO_UP', count, label }.
   * Ưu tiên: streak thắng/thua ≥ 2 (tính từ trận gần nhất, reset khi đổi kết quả);
   * nếu chưa có streak đủ dài thì dùng tổng ELO tăng 7 ngày gần nhất (ELO_UP).
   * Batch theo memberIds — không N+1 (P2C.6).
   */
  async computeStreaks(
    communityId: string,
    memberIds: string[],
  ): Promise<
    Record<
      string,
      { type: 'WIN' | 'LOSS' | 'ELO_UP'; count: number; label: string }
    >
  > {
    if (memberIds.length === 0) return {};

    const [matchStreaks, weeklyEloGains] = await Promise.all([
      this.communitiesRepository.getMatchResultStreaks(communityId, memberIds),
      this.communitiesRepository.getWeeklyEloGains(communityId, memberIds),
    ]);

    const streaks: Record<
      string,
      { type: 'WIN' | 'LOSS' | 'ELO_UP'; count: number; label: string }
    > = {};

    for (const row of matchStreaks) {
      if (row.streak >= 2) {
        streaks[row.userId] = row.won
          ? {
              type: 'WIN',
              count: row.streak,
              label: `Thắng ${row.streak} trận liên tiếp`,
            }
          : {
              type: 'LOSS',
              count: row.streak,
              label: `Thua ${row.streak} trận liên tiếp`,
            };
      }
    }

    for (const row of weeklyEloGains) {
      if (row.gain > 0 && !streaks[row.userId]) {
        streaks[row.userId] = {
          type: 'ELO_UP',
          count: row.gain,
          label: `+${row.gain} ELO trong tuần`,
        };
      }
    }

    return streaks;
  }

  /**
   * P2C.2 — Gán/Xoá tag BQT cho thành viên (OWNER/MODERATOR).
   * Body `{ tags: string[] }` replace toàn bộ; mảng rỗng = xoá hết tag.
   * Chỉ áp dụng cho member status JOINED. Audit log được ghi trong repository (cùng transaction).
   */
  async updateMemberTags(
    requesterId: string,
    communityId: string,
    targetUserId: string,
    tags: string[],
    roles: string[],
  ) {
    this.logger.log(
      `Gán tag cho thành viên ${targetUserId} trong cộng đồng ${communityId} (bởi ${requesterId})`,
    );
    await this.checkPermissions(communityId, requesterId, roles, [
      'OWNER',
      'MODERATOR',
    ]);

    const existing = await this.communitiesRepository.findMember(
      communityId,
      targetUserId,
    );
    if (!existing) {
      throw new NotFoundException('Target user is not a member');
    }

    if (existing.status !== 'JOINED') {
      throw new BadRequestException(
        'Chỉ thành viên đã tham gia cộng đồng mới được gán tag.',
      );
    }

    const normalizedTags = tags.map((tag) => tag.trim());

    const updatedMember = await this.communitiesRepository.updateMemberTags(
      communityId,
      targetUserId,
      normalizedTags,
      requesterId,
    );
    if (!updatedMember) {
      throw new NotFoundException('Target user is not a member');
    }

    return updatedMember;
  }

  async respondToInvite(userId: string, id: string, action: 'ACCEPT' | 'DECLINE') {
    const member = await this.communitiesRepository.findMember(id, userId);
    if (!member || member.status !== 'INVITED') {
      throw new NotFoundException('No pending invitation found');
    }

    if (action === 'ACCEPT') {
      return await this.communitiesRepository.updateMemberStatus(id, userId, 'JOINED');
    } else {
      return await this.communitiesRepository.removeMember(id, userId);
    }
  }

  // --- GALLERY ---
  async getGallery(id: string) {
    return await this.communitiesRepository.getGallery(id);
  }

  async addGalleryItem(userId: string, id: string, imageUrl: string, caption?: string, roles: string[] = []) {
    await this.checkPermissions(id, userId, roles, ['OWNER', 'MODERATOR']);
    return await this.communitiesRepository.addGalleryItem(id, userId, imageUrl, caption);
  }

  async removeGalleryItem(userId: string, id: string, imageId: string, roles: string[]) {
    await this.checkPermissions(id, userId, roles, ['OWNER', 'MODERATOR']);

    // Fetch the gallery item to get the image URL before deleting from DB
    const item = await this.communitiesRepository.findGalleryItemById(id, imageId);
    if (item && isStoredImageUrl(item.imageUrl)) {
      try {
        const publicId = extractStoredImagePublicId(item.imageUrl);
        if (publicId) {
          await this.storageService.deleteFile(publicId);
        }
      } catch (err) {
        console.error('Failed to delete gallery image from storage:', err);
      }
    }

    return await this.communitiesRepository.removeGalleryItem(id, imageId);
  }

  // --- TOURNAMENTS ---
  async getTournaments(id: string, status?: string) {
    return await this.communitiesRepository.getTournaments(id, status);
  }

  // --- RANKINGS ---
  async getRankings(id: string, limit?: number) {
    return await this.communitiesRepository.getRankings(id, limit);
  }

  // --- HELPER ---

  /**
   * Sanitize HTML cho `description` trước khi lưu (chống XSS — AboutTab WEB
   * render qua dangerouslySetInnerHTML).
   *
   * NOTE (P1.8): dependency CHƯA được thêm — cần chạy
   *   pnpm add sanitize-html
   *   pnpm add -D @types/sanitize-html
   * rồi commit package + lockfile. Mô-đun được nạp động nên build/runtime
   * không vỡ khi chưa cài; khi package có mặt, allowlist dưới đây được áp dụng.
   */
  private async sanitizeDescription(
    description?: string,
  ): Promise<string | undefined> {
    if (description === undefined || description === null) return description;

    const sanitizeHtml = await this.loadSanitizeHtml();
    if (!sanitizeHtml) {
      this.logger.warn(
        'sanitize-html chưa được cài (pnpm add sanitize-html) — bỏ qua sanitize description.',
      );
      return description;
    }

    return sanitizeHtml(description, {
      allowedTags: [
        'b', 'i', 'u', 'em', 'strong', 'p', 'br',
        'ul', 'ol', 'li', 'h2', 'h3', 'a', 'img', 'span',
      ],
      allowedAttributes: {
        a: ['href'],
        img: ['src', 'alt'],
        span: ['class'],
      },
      allowedSchemes: ['http', 'https', 'mailto'],
    });
  }

  /** Nạp động sanitize-html (tránh lỗi compile khi dependency chưa được thêm). */
  private async loadSanitizeHtml(): Promise<SanitizeHtmlFn | null> {
    try {
      const moduleName = 'sanitize-html';
      const mod = await import(moduleName);
      const fn =
        typeof mod === 'function' ? mod : (mod as { default?: unknown }).default;
      return typeof fn === 'function' ? (fn as SanitizeHtmlFn) : null;
    } catch {
      return null;
    }
  }

  private async checkPermissions(
    communityId: string,
    userId: string,
    systemRoles: string[],
    allowedCommunityRoles: string[],
  ) {
    // ADMIN has bypass
    if (systemRoles.includes(UserRole.ADMIN)) return;

    const member = await this.communitiesRepository.findMember(
      communityId,
      userId,
    );
    if (!member) {
      throw new ForbiddenException('You are not a member of this community');
    }

    if (member.status !== 'JOINED') {
      throw new ForbiddenException('Bạn cần là thành viên chính thức của cộng đồng để thực hiện thao tác này.');
    }

    if (!allowedCommunityRoles.includes(member.role)) {
      throw new ForbiddenException(
        `Requires one of the following community roles: ${allowedCommunityRoles.join(', ')}`,
      );
    }
  }

  private getCommunityRoleLabel(role: CommunityMemberRole): string {
    switch (role) {
      case 'OWNER':
        return 'Chủ sở hữu';
      case 'MODERATOR':
        return 'Quản trị viên';
      default:
        return 'Thành viên';
    }
  }

  private isRolePromotion(
    previousRole: CommunityMemberRole,
    nextRole: CommunityMemberRole,
  ): boolean {
    const roleRank: Record<CommunityMemberRole, number> = {
      MEMBER: 1,
      MODERATOR: 2,
      OWNER: 3,
    };

    return roleRank[nextRole] > roleRank[previousRole];
  }
}
