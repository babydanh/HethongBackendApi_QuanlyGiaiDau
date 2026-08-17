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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommunitySocialService = void 0;
const common_1 = require("@nestjs/common");
const communities_repository_1 = require("./communities.repository");
const community_social_repository_1 = require("./community-social.repository");
const notifications_service_1 = require("../notifications/notifications.service");
const notification_builder_1 = require("../notifications/notification-builder");
let CommunitySocialService = class CommunitySocialService {
    socialRepository;
    communitiesRepository;
    notificationsService;
    constructor(socialRepository, communitiesRepository, notificationsService) {
        this.socialRepository = socialRepository;
        this.communitiesRepository = communitiesRepository;
        this.notificationsService = notificationsService;
    }
    async getSettings(communityId) {
        await this.ensureCommunity(communityId);
        return this.socialRepository.getSettings(communityId);
    }
    async listPosts(communityId, limit, cursor, viewer) {
        const community = await this.ensureCommunity(communityId);
        const settings = await this.socialRepository.getSettings(communityId);
        if (!settings.publicFeed) {
            await this.requireJoined(communityId, viewer?.id);
        }
        if (community.visibility !== 'PUBLIC') {
            await this.requireJoined(communityId, viewer?.id);
        }
        return this.socialRepository.listPosts(communityId, limit, cursor, viewer?.id);
    }
    async createPost(communityId, user, dto, idempotencyKey) {
        const community = await this.ensureCommunity(communityId);
        const member = await this.requireJoined(communityId, user.id);
        const body = dto.body?.trim() ?? '';
        const mediaUrls = dto.mediaUrls ?? [];
        if (!body && mediaUrls.length === 0 && !dto.poll) {
            throw new common_1.BadRequestException('Bài viết cần có nội dung, ảnh hoặc bình chọn.');
        }
        const settings = await this.socialRepository.getSettings(communityId);
        const mentionIds = [...new Set(dto.mentions ?? [])];
        const canManage = member.role === 'OWNER' || member.role === 'MODERATOR' || user.roles?.includes('ADMIN');
        if (mentionIds.length > 0 && settings.memberTaggingPolicy === 'OFF') {
            throw new common_1.ForbiddenException('Cộng đồng hiện đang tắt gắn thẻ thành viên.');
        }
        if (mentionIds.length > 0 && settings.memberTaggingPolicy === 'ADMINS' && !canManage) {
            throw new common_1.ForbiddenException('Chỉ ban quản trị được gắn thẻ thành viên.');
        }
        const validMentionIds = await this.socialRepository.getJoinedMentionIds(communityId, mentionIds);
        if (validMentionIds.length !== mentionIds.length) {
            throw new common_1.BadRequestException('Chỉ có thể gắn thẻ thành viên đang tham gia cộng đồng.');
        }
        if (settings.postingPolicy === 'OFF') {
            throw new common_1.ForbiddenException('Cộng đồng hiện không nhận bài viết.');
        }
        if (settings.postingPolicy === 'ADMINS' && !canManage) {
            throw new common_1.ForbiddenException('Chỉ ban quản trị được đăng bài.');
        }
        const status = settings.postApprovalRequired && member.role !== 'OWNER' && member.role !== 'MODERATOR'
            ? 'PENDING'
            : 'PUBLISHED';
        const post = await this.socialRepository.createPost(communityId, user.id, { ...dto, mentions: validMentionIds }, status, idempotencyKey);
        if (!post)
            throw new common_1.BadRequestException('Không thể tạo bài viết.');
        let createdPoll = null;
        if (dto.poll && post.id) {
            createdPoll = await this.socialRepository.createPoll(communityId, user.id, dto.poll, post.id);
        }
        for (const receiverId of validMentionIds) {
            if (receiverId === user.id)
                continue;
            await this.notificationsService.sendNotification((0, notification_builder_1.buildCommunityPostMentionedNotification)({
                communityId,
                communityName: community.name,
                senderName: user.fullName?.trim() || 'Thành viên',
                receiverId,
                senderId: user.id,
                postId: post.id,
            }));
        }
        return {
            ...post,
            poll: createdPoll,
        };
    }
    async deletePost(communityId, postId, user) {
        await this.ensureCommunity(communityId);
        const post = await this.socialRepository.findPost(postId);
        if (!post || post.communityId !== communityId) {
            throw new common_1.NotFoundException('Không tìm thấy bài viết.');
        }
        if (post.authorId !== user.id) {
            await this.requireManager(communityId, user);
        }
        else {
            await this.requireJoined(communityId, user.id);
        }
        return this.socialRepository.softDeletePost(postId);
    }
    async updateSettings(communityId, user, dto) {
        await this.ensureCommunity(communityId);
        await this.requireManager(communityId, user);
        return this.socialRepository.updateSettings(communityId, {
            postingPolicy: dto.postingPolicy,
            postApprovalRequired: dto.postApprovalRequired,
            commentsEnabled: dto.commentsEnabled,
            chatEnabled: dto.chatEnabled,
            publicFeed: dto.publicFeed,
            memberTaggingPolicy: dto.memberTaggingPolicy,
        });
    }
    async listComments(communityId, postId, limit, cursor, viewer) {
        const community = await this.ensureCommunity(communityId);
        const settings = await this.socialRepository.getSettings(communityId);
        if (!settings.publicFeed || community.visibility !== 'PUBLIC') {
            await this.requireJoined(communityId, viewer?.id);
        }
        const post = await this.socialRepository.findPost(postId);
        if (!post || post.communityId !== communityId || post.status !== 'PUBLISHED') {
            throw new common_1.NotFoundException('Không tìm thấy bài viết.');
        }
        return this.socialRepository.listComments(postId, limit, cursor);
    }
    async createComment(communityId, postId, user, dto) {
        const community = await this.ensureCommunity(communityId);
        const member = await this.requireJoined(communityId, user.id);
        const post = await this.socialRepository.findPost(postId);
        if (!post || post.communityId !== communityId || post.status !== 'PUBLISHED')
            throw new common_1.NotFoundException('Không tìm thấy bài viết.');
        const settings = await this.socialRepository.getSettings(communityId);
        if (!settings.commentsEnabled)
            throw new common_1.ForbiddenException('Cộng đồng hiện không nhận bình luận.');
        if (dto.parentId) {
            const parent = await this.socialRepository.findComment(dto.parentId);
            if (!parent || parent.postId !== postId || parent.parentId) {
                throw new common_1.BadRequestException('Bình luận cha không hợp lệ.');
            }
        }
        void member;
        const comment = await this.socialRepository.createComment(postId, user.id, dto.body, dto.parentId);
        if (comment && post.authorId && post.authorId !== user.id) {
            await this.notificationsService.sendNotification((0, notification_builder_1.buildCommunityPostCommentedNotification)({
                communityId,
                communityName: community.name,
                senderName: user.fullName?.trim() || 'Thành viên',
                receiverId: post.authorId,
                senderId: user.id,
                postId: post.id,
            }));
        }
        return comment;
    }
    async updateComment(communityId, commentId, user, dto) {
        const comment = await this.socialRepository.findComment(commentId);
        if (!comment)
            throw new common_1.NotFoundException('Không tìm thấy bình luận.');
        if (comment.authorId !== user.id)
            throw new common_1.ForbiddenException('Bạn chỉ có thể sửa bình luận của mình.');
        const post = await this.socialRepository.findPost(comment.postId);
        if (!post || post.communityId !== communityId || post.status !== 'PUBLISHED')
            throw new common_1.NotFoundException('Không tìm thấy bài viết.');
        await this.requireJoined(communityId, user.id);
        return this.socialRepository.updateComment(commentId, dto.body);
    }
    async deleteComment(communityId, commentId, user) {
        const comment = await this.socialRepository.findComment(commentId);
        if (!comment)
            throw new common_1.NotFoundException('Không tìm thấy bình luận.');
        const post = await this.socialRepository.findPost(comment.postId);
        if (!post || post.communityId !== communityId)
            throw new common_1.NotFoundException('Không tìm thấy bài viết.');
        if (comment.authorId !== user.id) {
            await this.requireManager(communityId, user);
        }
        else {
            await this.requireJoined(communityId, user.id);
        }
        return this.socialRepository.softDeleteComment(commentId);
    }
    async moderateComment(communityId, commentId, user, status, reason) {
        await this.requireManager(communityId, user);
        const comment = await this.socialRepository.findComment(commentId);
        if (!comment)
            throw new common_1.NotFoundException('Không tìm thấy bình luận.');
        const post = await this.socialRepository.findPost(comment.postId);
        if (!post || post.communityId !== communityId)
            throw new common_1.NotFoundException('Không tìm thấy bài viết.');
        return this.socialRepository.moderateComment(commentId, status, reason);
    }
    async listPendingPosts(communityId, user) {
        await this.requireManager(communityId, user);
        return this.socialRepository.listPendingPosts(communityId);
    }
    async react(communityId, postId, user, reactionType) {
        await this.requireJoined(communityId, user.id);
        const post = await this.socialRepository.findPost(postId);
        if (!post || post.communityId !== communityId || post.status !== 'PUBLISHED')
            throw new common_1.NotFoundException('Không tìm thấy bài viết.');
        return this.socialRepository.setReaction(postId, user.id, reactionType);
    }
    async report(communityId, postId, user, dto) {
        await this.requireJoined(communityId, user.id);
        const post = await this.socialRepository.findPost(postId);
        if (!post || post.communityId !== communityId)
            throw new common_1.NotFoundException('Không tìm thấy bài viết.');
        return this.socialRepository.createReport({ communityId, reporterId: user.id, postId, reason: dto.reason, details: dto.details });
    }
    async updatePreferences(communityId, user, values) {
        await this.requireJoined(communityId, user.id);
        return this.socialRepository.updatePreferences(communityId, user.id, values);
    }
    async moderatePost(communityId, postId, user, status) {
        const community = await this.ensureCommunity(communityId);
        await this.requireManager(communityId, user);
        const post = await this.socialRepository.findPost(postId);
        if (!post || post.communityId !== communityId)
            throw new common_1.NotFoundException('Không tìm thấy bài viết.');
        const updated = await this.socialRepository.updatePostStatus(postId, status);
        if (updated?.status === 'PUBLISHED' && post.authorId) {
            await this.notificationsService.sendNotification((0, notification_builder_1.buildCommunityPostApprovedNotification)({
                communityId,
                communityName: community.name,
                receiverId: post.authorId,
                postId: post.id,
            }));
        }
        return updated;
    }
    async votePoll(communityId, pollId, optionId, user) {
        await this.ensureCommunity(communityId);
        await this.requireJoined(communityId, user.id);
        const poll = await this.socialRepository.getPollDetails(pollId);
        if (!poll || poll.communityId !== communityId) {
            throw new common_1.NotFoundException('Không tìm thấy cuộc bình chọn.');
        }
        if (poll.isClosed || (poll.expiresAt && new Date(poll.expiresAt) < new Date())) {
            throw new common_1.BadRequestException('Cuộc bình chọn đã kết thúc.');
        }
        const updated = await this.socialRepository.votePollOption(pollId, optionId, user.id);
        return updated;
    }
    async addPollOption(communityId, pollId, optionText, user) {
        await this.ensureCommunity(communityId);
        await this.requireJoined(communityId, user.id);
        const poll = await this.socialRepository.getPollDetails(pollId);
        if (!poll || poll.communityId !== communityId) {
            throw new common_1.NotFoundException('Không tìm thấy cuộc bình chọn.');
        }
        if (!poll.allowAddOptions) {
            throw new common_1.ForbiddenException('Bình chọn này không cho phép người khác thêm đáp án.');
        }
        if (poll.isClosed || (poll.expiresAt && new Date(poll.expiresAt) < new Date())) {
            throw new common_1.BadRequestException('Cuộc bình chọn đã kết thúc.');
        }
        const updated = await this.socialRepository.addPollOption(pollId, user.id, optionText);
        return updated;
    }
    async closePoll(communityId, pollId, user) {
        await this.ensureCommunity(communityId);
        const member = await this.requireJoined(communityId, user.id);
        const poll = await this.socialRepository.getPollDetails(pollId);
        if (!poll || poll.communityId !== communityId) {
            throw new common_1.NotFoundException('Không tìm thấy cuộc bình chọn.');
        }
        const canManage = poll.creatorId === user.id || member.role === 'OWNER' || member.role === 'MODERATOR' || user.roles?.includes('ADMIN');
        if (!canManage) {
            throw new common_1.ForbiddenException('Chỉ người tạo hoặc ban quản trị mới được kết thúc bình chọn sớm.');
        }
        const updated = await this.socialRepository.closePoll(pollId);
        return updated;
    }
    async ensureCommunity(communityId) {
        const community = await this.communitiesRepository.findById(communityId);
        if (!community)
            throw new common_1.NotFoundException('Không tìm thấy cộng đồng.');
        return community;
    }
    async requireJoined(communityId, userId) {
        if (!userId)
            throw new common_1.ForbiddenException('Bạn cần đăng nhập và tham gia cộng đồng.');
        const member = await this.communitiesRepository.findMember(communityId, userId);
        if (!member || member.status !== 'JOINED') {
            throw new common_1.ForbiddenException('Bạn cần là thành viên chính thức của cộng đồng.');
        }
        return member;
    }
    async requireManager(communityId, user) {
        if (user.roles?.includes('ADMIN'))
            return null;
        const member = await this.requireJoined(communityId, user.id);
        if (!['OWNER', 'MODERATOR'].includes(member.role)) {
            throw new common_1.ForbiddenException('Bạn không có quyền quản trị không gian này.');
        }
        return member;
    }
};
exports.CommunitySocialService = CommunitySocialService;
exports.CommunitySocialService = CommunitySocialService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [community_social_repository_1.CommunitySocialRepository,
        communities_repository_1.CommunitiesRepository,
        notifications_service_1.NotificationsService])
], CommunitySocialService);
//# sourceMappingURL=community-social.service.js.map