"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var CommunitiesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommunitiesService = void 0;
const common_1 = require("@nestjs/common");
const communities_repository_1 = require("./communities.repository");
const base_exception_1 = require("../../common/exceptions/base.exception");
const enums_1 = require("../../common/constants/enums");
const notifications_service_1 = require("../notifications/notifications.service");
const notification_builder_1 = require("../notifications/notification-builder");
const storage_service_1 = require("../../providers/storage/storage.service");
const cloudinary_helper_1 = require("../../common/helpers/cloudinary.helper");
let CommunitiesService = CommunitiesService_1 = class CommunitiesService {
    communitiesRepository;
    notificationsService;
    storageService;
    logger = new common_1.Logger(CommunitiesService_1.name);
    constructor(communitiesRepository, notificationsService, storageService) {
        this.communitiesRepository = communitiesRepository;
        this.notificationsService = notificationsService;
        this.storageService = storageService;
    }
    async findAll(query) {
        return await this.communitiesRepository.findAll(query);
    }
    async findMyCommunities(userId) {
        return await this.communitiesRepository.findMyCommunities(userId);
    }
    async getMyInvites(userId) {
        this.logger.log(`Lấy danh sách lời mời cộng đồng của user ${userId}`);
        return await this.communitiesRepository.findInvitesByUser(userId);
    }
    async getDashboard(idOrSlug, viewer) {
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
    async getMyMembership(userId, idOrSlug) {
        const community = await this.findById(idOrSlug);
        const member = await this.communitiesRepository.findMyMembership(userId, community.id);
        if (!member) {
            throw new base_exception_1.BaseException('Bạn chưa tham gia cộng đồng này.', 'NOT_MEMBER', common_1.HttpStatus.NOT_FOUND);
        }
        return {
            role: member.role,
            status: member.status,
            memberId: member.id,
            joinedAt: member.joinedAt,
            joinAnswers: member.joinAnswers ?? null,
        };
    }
    async findById(id, user) {
        const community = await this.communitiesRepository.findById(id);
        if (!community) {
            throw new common_1.NotFoundException('Community not found');
        }
        if (community.status === 'REJECTED') {
            const isAdmin = user?.roles?.some((r) => r === enums_1.UserRole.ADMIN || r === enums_1.UserRole.MODERATOR);
            if (!isAdmin) {
                throw new common_1.ForbiddenException('Cộng đồng này đã bị vô hiệu hoá.');
            }
        }
        return community;
    }
    async getPublicView(id, viewer) {
        const community = await this.findById(id, viewer);
        const access = await this.resolveAccess(community, viewer);
        if (access.isAdmin || access.isMember)
            return { ...community, access };
        const isPrivate = community.visibility === 'PRIVATE';
        return {
            id: community.id,
            name: community.name,
            logoUrl: community.logoUrl,
            bannerUrl: community.bannerUrl,
            visibility: community.visibility,
            joinMode: community.joinMode,
            status: community.status,
            provinceCode: isPrivate ? null : community.provinceCode,
            categories: community.categories,
            description: isPrivate ? null : community.description,
            rules: null,
            locationAddress: null,
            socialLinks: null,
            _count: {
                members: community._count?.members ?? 0,
                tournaments: 0,
            },
            access,
        };
    }
    async create(userId, dto) {
        if (!dto.categoryIds || dto.categoryIds.length !== 1) {
            throw new common_1.BadRequestException('Mỗi câu lạc bộ chỉ được chọn đúng một môn thể thao.');
        }
        const activeCount = await this.communitiesRepository.countActiveByCreator(userId);
        if (activeCount >= 5) {
            throw new common_1.BadRequestException('Mỗi người dùng chỉ được phép tạo tối đa 5 cộng đồng.');
        }
        const { lat, lng, categoryIds, ...rest } = dto;
        if (categoryIds !== undefined && categoryIds.length !== 1) {
            throw new common_1.BadRequestException('Mỗi câu lạc bộ chỉ được chọn đúng một môn thể thao.');
        }
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
    async update(userId, id, dto, roles) {
        const community = await this.findById(id);
        await this.checkPermissions(community.id, userId, roles, [
            'OWNER',
            'MODERATOR',
        ]);
        const { lat, lng, categoryIds, ...rest } = dto;
        if (rest.description !== undefined) {
            rest.description = await this.sanitizeDescription(rest.description);
        }
        return await this.communitiesRepository.update(id, rest, lat, lng, categoryIds);
    }
    async review(adminId, id, dto, roles = [enums_1.UserRole.ADMIN]) {
        await this.findById(id, { id: adminId, roles });
        const targetStatus = dto.status === 'APPROVED' ? 'ACTIVE' : 'REJECTED';
        const updateData = {
            status: targetStatus,
            approvedBy: adminId,
            reviewedAt: new Date(),
            rejectedReason: dto.status === 'APPROVED' ? null : dto.rejectedReason || null,
        };
        return await this.communitiesRepository.update(id, updateData);
    }
    async remove(userId, id, roles) {
        const community = await this.findById(id);
        if (!roles.includes(enums_1.UserRole.ADMIN)) {
            await this.checkPermissions(community.id, userId, roles, ['OWNER']);
        }
        return await this.communitiesRepository.delete(id);
    }
    async getMembers(id, query, viewer) {
        const community = await this.findById(id);
        const access = await this.resolveAccess(community, viewer);
        if (!access.canViewMembers) {
            throw new common_1.ForbiddenException('Danh sách thành viên chỉ dành cho thành viên CLB.');
        }
        const memberQuery = query?.mentionable
            ? { ...query, status: 'JOINED', limit: Math.min(query.limit ?? 20, 20) }
            : query;
        const result = await this.communitiesRepository.getMembers(id, memberQuery);
        const streaks = await this.computeStreaks(id, result.data.map((row) => row.user.id));
        return {
            ...result,
            data: result.data.map((row) => ({
                ...row,
                streak: streaks[row.user.id] ?? null,
            })),
        };
    }
    async addMember(requesterId, communityId, dto, roles) {
        await this.checkPermissions(communityId, requesterId, roles, [
            'OWNER',
            'MODERATOR',
        ]);
        const existing = await this.communitiesRepository.findMember(communityId, dto.userId);
        if (existing) {
            throw new common_1.ConflictException('User is already a member of this community');
        }
        const requesterMember = await this.communitiesRepository.findMember(communityId, requesterId);
        if (dto.role === 'OWNER') {
            throw new common_1.BadRequestException('Không thể thêm trực tiếp chủ sở hữu mới.');
        }
        if (requesterMember?.role === 'MODERATOR' && dto.role !== 'MEMBER') {
            throw new common_1.ForbiddenException('Quản trị viên chỉ có thể thêm thành viên thường.');
        }
        return await this.communitiesRepository.addMember(communityId, dto.userId, dto.role);
    }
    async updateMemberRole(requesterId, communityId, targetUserId, dto, roles) {
        await this.checkPermissions(communityId, requesterId, roles, ['OWNER']);
        const existing = await this.communitiesRepository.findMember(communityId, targetUserId);
        if (!existing) {
            throw new common_1.NotFoundException('Target user is not a member');
        }
        if (existing.status !== 'JOINED') {
            throw new common_1.BadRequestException('Chỉ thành viên đã tham gia mới được thay đổi vai trò.');
        }
        if (dto.role === 'OWNER') {
            if (requesterId === targetUserId) {
                throw new common_1.ConflictException('You are already the OWNER');
            }
            const ownershipTransferred = await this.communitiesRepository.transferOwnership(communityId, requesterId, targetUserId);
            const community = await this.findById(communityId);
            await this.notificationsService.sendNotification((0, notification_builder_1.buildCommunityOwnershipTransferredNotification)({
                communityId,
                communityName: community.name,
                receiverId: targetUserId,
            }));
            return ownershipTransferred;
        }
        if (requesterId === targetUserId) {
            throw new common_1.ForbiddenException('Cannot demote yourself from OWNER role');
        }
        const updatedMember = await this.communitiesRepository.updateMemberRole(communityId, targetUserId, dto.role);
        const community = await this.findById(communityId);
        const roleLabel = this.getCommunityRoleLabel(dto.role);
        const previousRole = existing.role;
        const notificationBuilder = this.isRolePromotion(previousRole, dto.role)
            ? notification_builder_1.buildCommunityRolePromotedNotification
            : notification_builder_1.buildCommunityRoleDemotedNotification;
        await this.notificationsService.sendNotification(notificationBuilder({
            communityId,
            communityName: community.name,
            receiverId: targetUserId,
            roleLabel,
        }));
        return updatedMember;
    }
    async removeMember(requesterId, communityId, targetUserId, roles) {
        if (requesterId !== targetUserId) {
            await this.checkPermissions(communityId, requesterId, roles, [
                'OWNER',
                'MODERATOR',
            ]);
        }
        const existing = await this.communitiesRepository.findMember(communityId, targetUserId);
        if (!existing) {
            throw new common_1.NotFoundException('User is not a member');
        }
        if (existing.status === 'PENDING') {
            throw new common_1.BadRequestException('Hãy xử lý đơn tham gia bằng luồng duyệt đơn, không xóa trực tiếp.');
        }
        if (requesterId === targetUserId &&
            existing.role === 'OWNER' &&
            existing.status === 'JOINED') {
            throw new common_1.ForbiddenException('Chủ sở hữu không thể tự rời cộng đồng. Hãy chuyển quyền trước.');
        }
        if (existing.role === 'OWNER' && requesterId !== targetUserId) {
            throw new common_1.ForbiddenException('Cannot remove an OWNER');
        }
        const requesterMember = requesterId === targetUserId
            ? existing
            : await this.communitiesRepository.findMember(communityId, requesterId);
        if (requesterId !== targetUserId &&
            requesterMember?.role === 'MODERATOR' &&
            existing.role !== 'MEMBER') {
            throw new common_1.ForbiddenException('Quản trị viên chỉ có thể mời ra thành viên thường.');
        }
        const removedMember = await this.communitiesRepository.removeMember(communityId, targetUserId);
        if (requesterId !== targetUserId) {
            const community = await this.findById(communityId);
            if (existing.status === 'INVITED') {
                await this.notificationsService.sendNotification((0, notification_builder_1.buildCommunityInviteRevokedNotification)({
                    communityId,
                    communityName: community.name,
                    receiverId: targetUserId,
                }));
            }
            else if (existing.status === 'JOINED') {
                await this.notificationsService.sendNotification((0, notification_builder_1.buildCommunityKickedNotification)({
                    communityId,
                    communityName: community.name,
                    receiverId: targetUserId,
                }));
            }
        }
        return removedMember;
    }
    async joinCommunity(userId, id, answers) {
        const community = await this.findById(id);
        if (community.visibility === 'PRIVATE') {
            throw new common_1.ForbiddenException('CLB riêng tư chỉ nhận thành viên qua lời mời.');
        }
        const existing = await this.communitiesRepository.findMember(id, userId);
        if (existing) {
            if (existing.status === 'BANNED')
                throw new common_1.ForbiddenException('You are banned from this community');
            if (existing.status === 'JOINED' || existing.status === 'PENDING') {
                throw new common_1.ConflictException('You are already a member or have a pending request');
            }
            await this.communitiesRepository.removeMember(id, userId);
        }
        if (community.joinMode === 'INVITE_ONLY') {
            throw new common_1.ForbiddenException('This community is invite-only');
        }
        const status = community.joinMode === 'OPEN' ? 'JOINED' : 'PENDING';
        return await this.communitiesRepository.addMember(id, userId, 'MEMBER', status, answers);
    }
    async reviewJoinRequest(userId, id, memberId, action, roles) {
        await this.checkPermissions(id, userId, roles, ['OWNER', 'MODERATOR']);
        const member = await this.communitiesRepository.findMember(id, memberId);
        if (!member || member.status !== 'PENDING') {
            throw new common_1.NotFoundException('Pending request not found');
        }
        const newStatus = action === 'APPROVE' ? 'JOINED' : 'REJECTED';
        return await this.communitiesRepository.updateMemberStatus(id, memberId, newStatus, userId);
    }
    async followCommunity(userId, id) {
        await this.findById(id);
        try {
            return await this.communitiesRepository.addFollow(id, userId, 'FOLLOW');
        }
        catch {
            throw new common_1.ConflictException('Already following');
        }
    }
    async unfollowCommunity(userId, id) {
        return await this.communitiesRepository.removeFollow(id, userId, 'FOLLOW');
    }
    async favoriteCommunity(userId, id) {
        await this.findById(id);
        try {
            return await this.communitiesRepository.addFollow(id, userId, 'FAVORITE');
        }
        catch {
            throw new common_1.ConflictException('Already favorited');
        }
    }
    async unfavoriteCommunity(userId, id) {
        return await this.communitiesRepository.removeFollow(id, userId, 'FAVORITE');
    }
    async getFavorites(userId) {
        return await this.communitiesRepository.getFavorites(userId);
    }
    async getJoinRequests(userId, id, roles) {
        await this.checkPermissions(id, userId, roles, ['OWNER', 'MODERATOR']);
        return await this.communitiesRepository.getMembers(id, {
            status: 'PENDING',
            page: 1,
            limit: 200,
        });
    }
    async inviteMember(userId, id, targetUserId, role, roles) {
        await this.checkPermissions(id, userId, roles, ['OWNER', 'MODERATOR']);
        const existing = await this.communitiesRepository.findMember(id, targetUserId);
        if (existing)
            throw new common_1.ConflictException('User is already a member or pending');
        if (role === 'OWNER') {
            throw new common_1.BadRequestException('Không thể gửi lời mời với vai trò chủ sở hữu.');
        }
        const requesterMember = await this.communitiesRepository.findMember(id, userId);
        if (requesterMember?.role === 'MODERATOR' && role !== 'MEMBER') {
            throw new common_1.ForbiddenException('Quản trị viên chỉ có thể mời thành viên thường.');
        }
        const invitedMember = await this.communitiesRepository.addMember(id, targetUserId, role, 'INVITED', undefined, userId);
        const community = await this.findById(id);
        await this.notificationsService.sendNotification((0, notification_builder_1.buildCommunityInviteNotification)({
            communityId: id,
            communityName: community.name,
            inviterName: 'Ban quản trị',
            receiverId: targetUserId,
            senderId: userId,
        }));
        return invitedMember;
    }
    async banMember(requesterId, communityId, targetUserId, roles) {
        await this.checkPermissions(communityId, requesterId, roles, [
            'OWNER',
            'MODERATOR',
        ]);
        const existing = await this.communitiesRepository.findMember(communityId, targetUserId);
        if (!existing) {
            throw new common_1.NotFoundException('User is not a member');
        }
        if (existing.status === 'BANNED') {
            throw new common_1.ConflictException('Người dùng này đã bị cấm khỏi cộng đồng.');
        }
        if (existing.status !== 'JOINED') {
            throw new common_1.BadRequestException('Chỉ có thể cấm thành viên chính thức của cộng đồng.');
        }
        if (requesterId === targetUserId) {
            throw new common_1.ForbiddenException('Bạn không thể tự cấm chính mình.');
        }
        if (existing.role === 'OWNER') {
            throw new common_1.ForbiddenException('Không thể cấm chủ sở hữu cộng đồng.');
        }
        const requesterMember = await this.communitiesRepository.findMember(communityId, requesterId);
        if (requesterMember?.role === 'MODERATOR' && existing.role !== 'MEMBER') {
            throw new common_1.ForbiddenException('Quản trị viên chỉ có thể cấm thành viên thường.');
        }
        const bannedMember = await this.communitiesRepository.updateMemberStatus(communityId, targetUserId, 'BANNED', requesterId);
        const community = await this.findById(communityId);
        await this.notificationsService.sendNotification((0, notification_builder_1.buildCommunityBannedNotification)({
            communityId,
            communityName: community.name,
            receiverId: targetUserId,
        }));
        return bannedMember;
    }
    async unbanMember(requesterId, communityId, targetUserId, roles) {
        await this.checkPermissions(communityId, requesterId, roles, [
            'OWNER',
            'MODERATOR',
        ]);
        const existing = await this.communitiesRepository.findMember(communityId, targetUserId);
        if (!existing || existing.status !== 'BANNED') {
            throw new common_1.NotFoundException('Không tìm thấy thành viên đang bị cấm.');
        }
        const requesterMember = await this.communitiesRepository.findMember(communityId, requesterId);
        if (requesterMember?.role === 'MODERATOR' && existing.role !== 'MEMBER') {
            throw new common_1.ForbiddenException('Quản trị viên chỉ có thể gỡ cấm thành viên thường.');
        }
        const removedBan = await this.communitiesRepository.removeMember(communityId, targetUserId);
        const community = await this.findById(communityId);
        await this.notificationsService.sendNotification((0, notification_builder_1.buildCommunityUnbannedNotification)({
            communityId,
            communityName: community.name,
            receiverId: targetUserId,
        }));
        return removedBan;
    }
    async computeStreaks(communityId, memberIds) {
        if (memberIds.length === 0)
            return {};
        const [matchStreaks, weeklyEloGains] = await Promise.all([
            this.communitiesRepository.getMatchResultStreaks(communityId, memberIds),
            this.communitiesRepository.getWeeklyEloGains(communityId, memberIds),
        ]);
        const streaks = {};
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
    async updateMemberTags(requesterId, communityId, targetUserId, tags, roles) {
        this.logger.log(`Gán tag cho thành viên ${targetUserId} trong cộng đồng ${communityId} (bởi ${requesterId})`);
        await this.checkPermissions(communityId, requesterId, roles, [
            'OWNER',
            'MODERATOR',
        ]);
        const existing = await this.communitiesRepository.findMember(communityId, targetUserId);
        if (!existing) {
            throw new common_1.NotFoundException('Target user is not a member');
        }
        if (existing.status !== 'JOINED') {
            throw new common_1.BadRequestException('Chỉ thành viên đã tham gia cộng đồng mới được gán tag.');
        }
        const seenTagKeys = new Set();
        const normalizedTags = tags.reduce((uniqueTags, tag) => {
            const trimmedTag = tag.trim();
            const normalizedKey = trimmedTag.toLocaleLowerCase('vi-VN');
            if (!seenTagKeys.has(normalizedKey)) {
                seenTagKeys.add(normalizedKey);
                uniqueTags.push(trimmedTag);
            }
            return uniqueTags;
        }, []);
        const updatedMember = await this.communitiesRepository.updateMemberTags(communityId, targetUserId, normalizedTags, requesterId);
        if (!updatedMember) {
            throw new common_1.NotFoundException('Target user is not a member');
        }
        return updatedMember;
    }
    async getTagPresets(communityId) {
        await this.findById(communityId);
        return this.communitiesRepository.listTagPresets(communityId);
    }
    async createTagPreset(requesterId, communityId, name, color, roles) {
        await this.checkPermissions(communityId, requesterId, roles, ['OWNER', 'MODERATOR']);
        const normalizedName = name.trim();
        if (await this.communitiesRepository.findTagPresetByName(communityId, normalizedName)) {
            throw new common_1.ConflictException('Tên tag này đã tồn tại trong câu lạc bộ.');
        }
        try {
            return await this.communitiesRepository.createTagPreset(communityId, requesterId, normalizedName, color.toUpperCase());
        }
        catch (error) {
            if (error?.code === '23505') {
                throw new common_1.ConflictException('Tên tag này đã tồn tại trong câu lạc bộ.');
            }
            throw error;
        }
    }
    async deleteTagPreset(requesterId, communityId, presetId, roles) {
        await this.checkPermissions(communityId, requesterId, roles, ['OWNER', 'MODERATOR']);
        const deleted = await this.communitiesRepository.deleteTagPreset(communityId, presetId);
        if (!deleted)
            throw new common_1.NotFoundException('Không tìm thấy tag preset');
        return deleted;
    }
    async respondToInvite(userId, id, action) {
        const member = await this.communitiesRepository.findMember(id, userId);
        if (!member) {
            throw new common_1.NotFoundException('Không tìm thấy lời mời tham gia');
        }
        if (member.status === 'JOINED') {
            if (action === 'ACCEPT') {
                return member;
            }
            return await this.communitiesRepository.removeMember(id, userId);
        }
        if (member.status !== 'INVITED') {
            throw new common_1.NotFoundException('Lời mời không còn hiệu lực hoặc đã được xử lý');
        }
        if (action === 'ACCEPT') {
            return await this.communitiesRepository.updateMemberStatus(id, userId, 'JOINED');
        }
        else {
            return await this.communitiesRepository.removeMember(id, userId);
        }
    }
    async getGallery(id, viewer) {
        const community = await this.findById(id);
        const access = await this.resolveAccess(community, viewer);
        if (!access.isMember && !access.isAdmin) {
            throw new common_1.ForbiddenException('Thư viện ảnh chỉ dành cho thành viên CLB.');
        }
        return await this.communitiesRepository.getGallery(id);
    }
    async addGalleryItem(userId, id, imageUrl, caption, roles = []) {
        await this.checkPermissions(id, userId, roles, ['OWNER', 'MODERATOR']);
        return await this.communitiesRepository.addGalleryItem(id, userId, imageUrl, caption);
    }
    async removeGalleryItem(userId, id, imageId, roles) {
        await this.checkPermissions(id, userId, roles, ['OWNER', 'MODERATOR']);
        const item = await this.communitiesRepository.findGalleryItemById(id, imageId);
        if (item && (0, cloudinary_helper_1.isStoredImageUrl)(item.imageUrl)) {
            try {
                const publicId = (0, cloudinary_helper_1.extractStoredImagePublicId)(item.imageUrl);
                if (publicId) {
                    await this.storageService.deleteFile(publicId);
                }
            }
            catch (err) {
                console.error('Failed to delete gallery image from storage:', err);
            }
        }
        return await this.communitiesRepository.removeGalleryItem(id, imageId);
    }
    async getTournaments(id, status, viewer) {
        const community = await this.findById(id);
        const access = await this.resolveAccess(community, viewer);
        if (!access.isMember && !access.isAdmin) {
            throw new common_1.ForbiddenException('Danh sách giải đấu chỉ dành cho thành viên CLB.');
        }
        return await this.communitiesRepository.getTournaments(id, status);
    }
    async getRankings(id, limit, viewer) {
        const community = await this.findById(id);
        const access = await this.resolveAccess(community, viewer);
        if (!access.isMember && !access.isAdmin) {
            throw new common_1.ForbiddenException('Bảng xếp hạng chỉ dành cho thành viên CLB.');
        }
        return await this.communitiesRepository.getRankings(id, limit);
    }
    async sanitizeDescription(description) {
        if (description === undefined || description === null)
            return description;
        const sanitizeHtml = await this.loadSanitizeHtml();
        if (!sanitizeHtml) {
            this.logger.warn('sanitize-html chưa được cài (pnpm add sanitize-html) — bỏ qua sanitize description.');
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
    async loadSanitizeHtml() {
        try {
            const moduleName = 'sanitize-html';
            const mod = await import(moduleName);
            const fn = typeof mod === 'function'
                ? mod
                : mod.default;
            return typeof fn === 'function' ? fn : null;
        }
        catch {
            return null;
        }
    }
    async resolveAccess(community, viewer) {
        if (!community)
            throw new common_1.NotFoundException('Không tìm thấy cộng đồng.');
        const isAdmin = viewer?.roles?.includes(enums_1.UserRole.ADMIN) ?? false;
        const membership = viewer
            ? await this.communitiesRepository.findMember(community.id, viewer.id)
            : null;
        const isMember = membership?.status === 'JOINED';
        return {
            visibility: community.visibility,
            isAuthenticated: Boolean(viewer),
            isMember,
            membershipStatus: membership?.status ?? null,
            membershipRole: membership?.role ?? null,
            isAdmin,
            canViewContent: isAdmin || isMember,
            canViewFeed: isAdmin || isMember || community.visibility === 'PUBLIC',
            canViewMembers: isAdmin || isMember,
            canPost: isAdmin || isMember,
        };
    }
    async checkPermissions(communityId, userId, systemRoles, allowedCommunityRoles) {
        if (systemRoles.includes(enums_1.UserRole.ADMIN))
            return;
        const member = await this.communitiesRepository.findMember(communityId, userId);
        if (!member) {
            throw new common_1.ForbiddenException('You are not a member of this community');
        }
        if (member.status !== 'JOINED') {
            throw new common_1.ForbiddenException('Bạn cần là thành viên chính thức của cộng đồng để thực hiện thao tác này.');
        }
        if (!allowedCommunityRoles.includes(member.role)) {
            throw new common_1.ForbiddenException(`Requires one of the following community roles: ${allowedCommunityRoles.join(', ')}`);
        }
    }
    getCommunityRoleLabel(role) {
        switch (role) {
            case 'OWNER':
                return 'Chủ sở hữu';
            case 'MODERATOR':
                return 'Quản trị viên';
            default:
                return 'Thành viên';
        }
    }
    isRolePromotion(previousRole, nextRole) {
        const roleRank = {
            MEMBER: 1,
            MODERATOR: 2,
            OWNER: 3,
        };
        return roleRank[nextRole] > roleRank[previousRole];
    }
    async updateMemberNotificationPreference(communityId, userId, preference) {
        const member = await this.communitiesRepository.findMember(communityId, userId);
        if (!member || member.status !== 'JOINED') {
            throw new common_1.ForbiddenException('Bạn không phải là thành viên của câu lạc bộ này.');
        }
        return await this.communitiesRepository.updateMemberNotificationPreference(communityId, userId, preference);
    }
    async getMyNotificationPreferences(userId) {
        return await this.communitiesRepository.getMyNotificationPreferences(userId);
    }
};
exports.CommunitiesService = CommunitiesService;
exports.CommunitiesService = CommunitiesService = CommunitiesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [communities_repository_1.CommunitiesRepository,
        notifications_service_1.NotificationsService,
        storage_service_1.StorageService])
], CommunitiesService);
//# sourceMappingURL=communities.service.js.map