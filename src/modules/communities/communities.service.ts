import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  HttpStatus,
  Optional,
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
import { RedisService } from '../../providers/redis/redis.service';
import {
  isStoredImageUrl,
  extractStoredImagePublicId,
} from '../../common/helpers/cloudinary.helper';

type CommunityMemberRole = 'OWNER' | 'MODERATOR' | 'MEMBER';
type CommunityViewer = { id: string; roles?: (UserRole | string)[] };
type SanitizeHtmlFn = (
  html: string,
  options?: Record<string, unknown>,
) => string;

@Injectable()
export class CommunitiesService {
  private readonly logger = new Logger(CommunitiesService.name);

  constructor(
    private readonly communitiesRepository: CommunitiesRepository,
    private readonly notificationsService: NotificationsService,
    private readonly storageService: StorageService,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  // --- COMMUNITIES ---

  async findAll(query: QueryCommunityDto) {
    const cacheKey = `communities:list:${JSON.stringify(query)}`;
    try {
      const cached = await this.redisService?.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (error) {
      this.logger.debug(`Community list cache read skipped: ${String(error)}`);
    }

    const result = await this.communitiesRepository.findAll(query);
    try {
      await this.redisService?.set(cacheKey, JSON.stringify(result), 30);
    } catch (error) {
      this.logger.debug(`Community list cache write skipped: ${String(error)}`);
    }
    return result;
  }

  private async invalidatePublicListCache(): Promise<void> {
    try {
      await this.redisService?.delByPattern('communities:list:*');
    } catch (error) {
      this.logger.debug(`Community list cache invalidation skipped: ${String(error)}`);
    }
  }

  async findMyCommunities(userId: string) {
    return await this.communitiesRepository.findMyCommunities(userId);
  }

  async getMyInvites(userId: string) {
    this.logger.log(`Lấy danh sách lời mời cộng đồng của user ${userId}`);
    return await this.communitiesRepository.findInvitesByUser(userId);
  }

  // --- DASHBOARD ---

  async getDashboard(idOrSlug: string, viewer?: CommunityViewer) {
    const community = await this.findById(idOrSlug);
    const access = await this.resolveAccess(community, viewer);
    if (!access.canViewContent) {
      return {
        access,
        recentMatches: [],
        featuredTournament: null,
        topPlayers: [],
        activity: [],
        upcomingMatches: [],
      };
    }
    const realId = community.id;

    const results = await Promise.allSettled([
      this.communitiesRepository.getRecentMatches(realId, 3),
      this.communitiesRepository.getFeaturedTournament(realId),
      this.communitiesRepository.getTopRanked(realId, 3),
      this.communitiesRepository.getActivityFeed(realId, 5),
      this.communitiesRepository.getUpcomingMatches(realId, 3),
    ]);

    const recentMatches = results[0].status === 'fulfilled' ? results[0].value : [];
    const featuredTournament = results[1].status === 'fulfilled' ? results[1].value : null;
    const topPlayers = results[2].status === 'fulfilled' ? results[2].value : [];
    const activity = results[3].status === 'fulfilled' ? results[3].value : [];
    const upcomingMatches = results[4].status === 'fulfilled' ? results[4].value : [];

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.warn(`Dashboard block ${index} unavailable for community ${realId}`);
      }
    });

    return {
      access,
      recentMatches,
      featuredTournament,
      topPlayers,
      activity,
      upcomingMatches,
    };
  }

  // --- MY MEMBERSHIP ---

  async getMyMembership(userId: string, idOrSlug: string) {
    const community = await this.findById(idOrSlug);
    const member = await this.communitiesRepository.findMyMembership(
      userId,
      community.id,
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

  async findById(id: string, user?: { id: string; roles?: (UserRole | string)[] }) {
    const community = await this.communitiesRepository.findById(id);
    if (!community) {
      throw new NotFoundException('Community not found');
    }
    // Nếu community bị khoá (REJECTED), chỉ ADMIN/MODERATOR mới xem được
    if (community.status === 'REJECTED') {
      const isAdmin =
        user?.roles?.includes(UserRole.ADMIN) ||
        user?.roles?.includes(UserRole.MODERATOR);
      if (!isAdmin) {
        throw new ForbiddenException('Cộng đồng này đã bị vô hiệu hoá.');
      }
    }
    return community;
  }

  async getPublicView(id: string, viewer?: CommunityViewer) {
    const community = await this.findById(id, viewer);
    const access = await this.resolveAccess(community, viewer);
    if (access.isAdmin || access.isMember) return { ...community, access };

    const isPrivate = community.visibility === 'PRIVATE';
    return {
      ...community,
      provinceCode: isPrivate ? null : community.provinceCode,
      districtCode: isPrivate ? null : community.districtCode,
      wardCode: isPrivate ? null : community.wardCode,
      description: isPrivate ? null : community.description,
      rules: isPrivate ? null : community.rules,
      locationAddress: isPrivate ? null : community.locationAddress,
      socialLinks: isPrivate ? null : community.socialLinks,
      access,
    };
  }

  async create(userId: string, dto: CreateCommunityDto) {
    if (!dto.categoryIds || dto.categoryIds.length !== 1) {
      throw new BadRequestException('Mỗi câu lạc bộ chỉ được chọn đúng một môn thể thao.');
    }
    const activeCount =
      await this.communitiesRepository.countActiveByCreator(userId);
    if (activeCount >= 5) {
      throw new BadRequestException(
        'Mỗi người dùng chỉ được phép tạo tối đa 5 cộng đồng.',
      );
    }

    const { lat, lng, categoryIds, ...rest } = dto;
    if (categoryIds !== undefined && categoryIds.length !== 1) {
      throw new BadRequestException('Mỗi câu lạc bộ chỉ được chọn đúng một môn thể thao.');
    }
    const data = {
      ...rest,
      ...(rest.description !== undefined
        ? { description: await this.sanitizeDescription(rest.description) }
        : {}),
      creatorId: userId,
      status: 'ACTIVE',
    };
    const created = await this.communitiesRepository.create(data, lat, lng, categoryIds);
    await this.invalidatePublicListCache();
    return created;
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
    const updated = await this.communitiesRepository.update(
      id,
      rest,
      lat,
      lng,
      categoryIds,
    );
    await this.invalidatePublicListCache();
    return updated;
  }

  async review(
    adminId: string,
    id: string,
    dto: ReviewCommunityDto,
    roles: string[] = [UserRole.ADMIN],
  ) {
    await this.findById(id, { id: adminId, roles });
    const targetStatus = dto.status === 'APPROVED' ? 'ACTIVE' : 'REJECTED';
    const updateData = {
      status: targetStatus,
      approvedBy: adminId,
      reviewedAt: new Date(),
      rejectedReason:
        dto.status === 'APPROVED' ? null : dto.rejectedReason || null,
    };
    const reviewed = await this.communitiesRepository.update(id, updateData);
    await this.invalidatePublicListCache();
    return reviewed;
  }

  async remove(userId: string, id: string, roles: string[]) {
    const community = await this.findById(id);
    // ADMIN can delete anything. Otherwise, must be OWNER.
    if (!roles.includes(UserRole.ADMIN)) {
      await this.checkPermissions(community.id, userId, roles, ['OWNER']);
    }

    const deleted = await this.communitiesRepository.delete(id);
    await this.invalidatePublicListCache();
    return deleted;
  }

  // --- MEMBERS ---

  async getMembers(
    id: string,
    query?: {
      page?: number;
      limit?: number;
      cursor?: string;
      status?: string;
      search?: string;
      mentionable?: boolean;
    },
    viewer?: CommunityViewer,
  ) {
    const community = await this.findById(id);
    const access = await this.resolveAccess(community, viewer);
    if (!access.canViewMembers) {
      throw new ForbiddenException('Danh sách thành viên chỉ dành cho thành viên CLB.');
    }
    const memberQuery = query?.mentionable
      ? { ...query, status: 'JOINED', limit: Math.min(query.limit ?? 20, 20) }
      : query;
    const result = await this.communitiesRepository.getMembers(id, memberQuery);
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
      throw new ForbiddenException(
        'Quản trị viên chỉ có thể thêm thành viên thường.',
      );
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
      throw new BadRequestException(
        'Chỉ thành viên đã tham gia mới được thay đổi vai trò.',
      );
    }

    if (dto.role === 'OWNER') {
      if (requesterId === targetUserId) {
        throw new ConflictException('You are already the OWNER');
      }

      const ownershipTransferred =
        await this.communitiesRepository.transferOwnership(
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
    const notificationBuilder = this.isRolePromotion(previousRole, dto.role)
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
      throw new BadRequestException(
        'Hãy xử lý đơn tham gia bằng luồng duyệt đơn, không xóa trực tiếp.',
      );
    }

    if (
      requesterId === targetUserId &&
      existing.role === 'OWNER' &&
      existing.status === 'JOINED'
    ) {
      throw new ForbiddenException(
        'Chủ sở hữu không thể tự rời cộng đồng. Hãy chuyển quyền trước.',
      );
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
      throw new ForbiddenException(
        'Quản trị viên chỉ có thể mời ra thành viên thường.',
      );
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

  async joinCommunity(
    userId: string,
    id: string,
    answers?: Record<string, string>,
  ) {
    const community = await this.findById(id);
    if (community.visibility === 'PRIVATE') {
      throw new ForbiddenException('CLB riêng tư chỉ nhận thành viên qua lời mời.');
    }
    const existing = await this.communitiesRepository.findMember(id, userId);

    if (existing) {
      if (existing.status === 'BANNED')
        throw new ForbiddenException('You are banned from this community');
      if (existing.status === 'JOINED' || existing.status === 'PENDING') {
        throw new ConflictException(
          'You are already a member or have a pending request',
        );
      }
      // Delete old rejected record to insert a clean new request
      await this.communitiesRepository.removeMember(id, userId);
    }

    if (community.joinMode === 'INVITE_ONLY') {
      throw new ForbiddenException('This community is invite-only');
    }

    const status = community.joinMode === 'OPEN' ? 'JOINED' : 'PENDING';
    return await this.communitiesRepository.addMember(
      id,
      userId,
      'MEMBER',
      status,
      answers,
    );
  }

  async reviewJoinRequest(
    userId: string,
    id: string,
    memberId: string,
    action: 'APPROVE' | 'REJECT',
    roles: string[],
  ) {
    await this.checkPermissions(id, userId, roles, ['OWNER', 'MODERATOR']);

    const member = await this.communitiesRepository.findMember(id, memberId);
    if (!member || member.status !== 'PENDING') {
      throw new NotFoundException('Pending request not found');
    }

    const newStatus = action === 'APPROVE' ? 'JOINED' : 'REJECTED';
    return await this.communitiesRepository.updateMemberStatus(
      id,
      memberId,
      newStatus,
      userId,
    );
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
    return await this.communitiesRepository.removeFollow(
      id,
      userId,
      'FAVORITE',
    );
  }

  async getFavorites(userId: string) {
    return await this.communitiesRepository.getFavorites(userId);
  }

  async getJoinRequests(userId: string, id: string, roles: string[]) {
    await this.checkPermissions(id, userId, roles, ['OWNER', 'MODERATOR']);
    return await this.communitiesRepository.getMembers(id, {
      status: 'PENDING',
      page: 1,
      limit: 200,
    });
  }

  async inviteMember(
    userId: string,
    id: string,
    targetUserId: string,
    role: CommunityMemberRole,
    roles: string[],
  ) {
    await this.checkPermissions(id, userId, roles, ['OWNER', 'MODERATOR']);
    const existing = await this.communitiesRepository.findMember(
      id,
      targetUserId,
    );
    if (existing)
      throw new ConflictException('User is already a member or pending');

    if (role === 'OWNER') {
      throw new BadRequestException(
        'Không thể gửi lời mời với vai trò chủ sở hữu.',
      );
    }

    const requesterMember = await this.communitiesRepository.findMember(
      id,
      userId,
    );
    if (requesterMember?.role === 'MODERATOR' && role !== 'MEMBER') {
      throw new ForbiddenException(
        'Quản trị viên chỉ có thể mời thành viên thường.',
      );
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
    await this.checkPermissions(communityId, requesterId, roles, [
      'OWNER',
      'MODERATOR',
    ]);

    const existing = await this.communitiesRepository.findMember(
      communityId,
      targetUserId,
    );
    if (!existing) {
      throw new NotFoundException('User is not a member');
    }

    if (existing.status === 'BANNED') {
      throw new ConflictException('Người dùng này đã bị cấm khỏi cộng đồng.');
    }

    if (existing.status !== 'JOINED') {
      throw new BadRequestException(
        'Chỉ có thể cấm thành viên chính thức của cộng đồng.',
      );
    }

    if (requesterId === targetUserId) {
      throw new ForbiddenException('Bạn không thể tự cấm chính mình.');
    }

    if (existing.role === 'OWNER') {
      throw new ForbiddenException('Không thể cấm chủ sở hữu cộng đồng.');
    }

    const requesterMember = await this.communitiesRepository.findMember(
      communityId,
      requesterId,
    );
    if (requesterMember?.role === 'MODERATOR' && existing.role !== 'MEMBER') {
      throw new ForbiddenException(
        'Quản trị viên chỉ có thể cấm thành viên thường.',
      );
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
    await this.checkPermissions(communityId, requesterId, roles, [
      'OWNER',
      'MODERATOR',
    ]);

    const existing = await this.communitiesRepository.findMember(
      communityId,
      targetUserId,
    );
    if (!existing || existing.status !== 'BANNED') {
      throw new NotFoundException('Không tìm thấy thành viên đang bị cấm.');
    }

    const requesterMember = await this.communitiesRepository.findMember(
      communityId,
      requesterId,
    );
    if (requesterMember?.role === 'MODERATOR' && existing.role !== 'MEMBER') {
      throw new ForbiddenException(
        'Quản trị viên chỉ có thể gỡ cấm thành viên thường.',
      );
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

    const seenTagKeys = new Set<string>();
    const normalizedTags = tags.reduce<string[]>((uniqueTags, tag) => {
      const trimmedTag = tag.trim();
      const normalizedKey = trimmedTag.toLocaleLowerCase('vi-VN');
      if (!seenTagKeys.has(normalizedKey)) {
        seenTagKeys.add(normalizedKey);
        uniqueTags.push(trimmedTag);
      }
      return uniqueTags;
    }, []);

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

  async getTagPresets(communityId: string) {
    await this.findById(communityId);
    return this.communitiesRepository.listTagPresets(communityId);
  }

  async createTagPreset(requesterId: string, communityId: string, name: string, color: string, roles: string[]) {
    await this.checkPermissions(communityId, requesterId, roles, ['OWNER', 'MODERATOR']);
    const normalizedName = name.trim();
    if (await this.communitiesRepository.findTagPresetByName(communityId, normalizedName)) {
      throw new ConflictException('Tên tag này đã tồn tại trong câu lạc bộ.');
    }
    try {
      return await this.communitiesRepository.createTagPreset(
        communityId,
        requesterId,
        normalizedName,
        color.toUpperCase(),
      );
    } catch (error) {
      // Keep the unique community/name constraint user-facing and avoid leaking SQL errors.
      if ((error as { code?: string })?.code === '23505') {
        throw new ConflictException('Tên tag này đã tồn tại trong câu lạc bộ.');
      }
      throw error;
    }
  }

  async deleteTagPreset(requesterId: string, communityId: string, presetId: string, roles: string[]) {
    await this.checkPermissions(communityId, requesterId, roles, ['OWNER', 'MODERATOR']);
    const deleted = await this.communitiesRepository.deleteTagPreset(communityId, presetId);
    if (!deleted) throw new NotFoundException('Không tìm thấy tag preset');
    return deleted;
  }

  async respondToInvite(
    userId: string,
    id: string,
    action: 'ACCEPT' | 'DECLINE',
  ) {
    const member = await this.communitiesRepository.findMember(id, userId);
    if (!member) {
      throw new NotFoundException('Không tìm thấy lời mời tham gia');
    }

    if (member.status === 'JOINED') {
      if (action === 'ACCEPT') {
        return member;
      }
      return await this.communitiesRepository.removeMember(id, userId);
    }

    if (member.status !== 'INVITED') {
      throw new NotFoundException('Lời mời không còn hiệu lực hoặc đã được xử lý');
    }

    if (action === 'ACCEPT') {
      return await this.communitiesRepository.updateMemberStatus(
        id,
        userId,
        'JOINED',
      );
    } else {
      return await this.communitiesRepository.removeMember(id, userId);
    }
  }

  // --- GALLERY ---
  async getGallery(id: string, viewer?: CommunityViewer) {
    const community = await this.findById(id);
    const access = await this.resolveAccess(community, viewer);
    if (!access.isMember && !access.isAdmin && community.visibility !== 'PUBLIC') {
      throw new ForbiddenException('Thư viện ảnh chỉ dành cho thành viên CLB.');
    }
    return await this.communitiesRepository.getGallery(id);
  }

  async addGalleryItem(
    userId: string,
    id: string,
    imageUrl: string,
    caption?: string,
    roles: string[] = [],
  ) {
    await this.checkPermissions(id, userId, roles, ['OWNER', 'MODERATOR']);
    return await this.communitiesRepository.addGalleryItem(
      id,
      userId,
      imageUrl,
      caption,
    );
  }

  async removeGalleryItem(
    userId: string,
    id: string,
    imageId: string,
    roles: string[],
  ) {
    await this.checkPermissions(id, userId, roles, ['OWNER', 'MODERATOR']);

    // Fetch the gallery item to get the image URL before deleting from DB
    const item = await this.communitiesRepository.findGalleryItemById(
      id,
      imageId,
    );
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
  async getTournaments(id: string, status?: string, viewer?: CommunityViewer) {
    const community = await this.findById(id);
    const access = await this.resolveAccess(community, viewer);
    if (!access.isMember && !access.isAdmin && community.visibility !== 'PUBLIC') {
      throw new ForbiddenException('Danh sách giải đấu chỉ dành cho thành viên CLB.');
    }
    return await this.communitiesRepository.getTournaments(
      id,
      status,
      true,
    );
  }

  // --- RANKINGS ---
  async getRankings(id: string, limit?: number, viewer?: CommunityViewer) {
    const community = await this.findById(id);
    const access = await this.resolveAccess(community, viewer);
    if (!access.isMember && !access.isAdmin && community.visibility !== 'PUBLIC') {
      throw new ForbiddenException('Bảng xếp hạng chỉ dành cho thành viên CLB.');
    }
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
        'b',
        'i',
        'u',
        'em',
        'strong',
        'p',
        'br',
        'ul',
        'ol',
        'li',
        'h2',
        'h3',
        'a',
        'img',
        'span',
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
        typeof mod === 'function'
          ? mod
          : (mod as { default?: unknown }).default;
      return typeof fn === 'function' ? (fn as SanitizeHtmlFn) : null;
    } catch {
      return null;
    }
  }

  private async resolveAccess(
    community: Awaited<ReturnType<CommunitiesRepository['findById']>>,
    viewer?: CommunityViewer,
  ) {
    if (!community) throw new NotFoundException('Không tìm thấy cộng đồng.');
    const isAdmin = viewer?.roles?.includes(UserRole.ADMIN) ?? false;
    const membership = viewer
      ? await this.communitiesRepository.findMember(community.id, viewer.id)
      : null;
    const isMember = membership?.status === 'JOINED';
    const isPublic = community.visibility === 'PUBLIC';
    return {
      visibility: community.visibility,
      isAuthenticated: Boolean(viewer),
      isMember,
      membershipStatus: membership?.status ?? null,
      membershipRole: membership?.role ?? null,
      isAdmin,
      canViewContent: isAdmin || isMember || isPublic,
      canViewFeed: isAdmin || isMember || isPublic,
      canViewMembers: isAdmin || isMember || isPublic,
      canPost: isAdmin || isMember,
    };
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
      throw new ForbiddenException(
        'Bạn cần là thành viên chính thức của cộng đồng để thực hiện thao tác này.',
      );
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

  async updateMemberNotificationPreference(
    communityId: string,
    userId: string,
    preference: 'ALL' | 'MENTIONS_ONLY' | 'MUTED',
  ) {
    const member = await this.communitiesRepository.findMember(
      communityId,
      userId,
    );
    if (!member || member.status !== 'JOINED') {
      throw new ForbiddenException('Bạn không phải là thành viên của câu lạc bộ này.');
    }
    return await this.communitiesRepository.updateMemberNotificationPreference(
      communityId,
      userId,
      preference,
    );
  }

  async getMyNotificationPreferences(userId: string) {
    return await this.communitiesRepository.getMyNotificationPreferences(userId);
  }
}
