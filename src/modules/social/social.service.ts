import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SocialRepository } from './social.repository';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';
import { UpdateFriendshipDto, FriendshipAction } from './dto/update-friendship.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TYPES } from '../notifications/notification-types';
import { CommunitySocialRepository } from '../communities/community-social.repository';
import { CommunityWhiteboxService } from '../communities/moderation/community-whitebox.service';
import { CommunityBlackboxAiService } from '../communities/moderation/community-blackbox-ai.service';
import { CommunityImageModerationService } from '../communities/moderation/community-image-moderation.service';
import type { CreateProfilePostDto } from './dto/create-profile-post.dto';
import type { CreateCommunityCommentDto } from '../communities/dto/create-community-comment.dto';
import type {
  FriendshipDirection,
  FriendshipStatus,
  FriendshipStatusView,
} from './friendship.types';

@Injectable()
export class SocialService {
  private readonly logger = new Logger(SocialService.name);

  constructor(
    private readonly socialRepository: SocialRepository,
    private readonly notificationsService: NotificationsService,
    private readonly communitySocialRepository: CommunitySocialRepository,
    private readonly whiteboxService: CommunityWhiteboxService,
    private readonly blackboxAiService: CommunityBlackboxAiService,
    private readonly imageModerationService: CommunityImageModerationService,
  ) {}

  async sendFriendRequest(userId: string, data: SendFriendRequestDto) {
    if (userId === data.receiverId) {
      throw new BadRequestException('Cannot send friend request to yourself');
    }

    const receiver = await this.socialRepository.findActiveUser(data.receiverId);
    if (!receiver) {
      throw new NotFoundException('User not found');
    }

    const existing = await this.socialRepository.findFriendship(
      userId,
      data.receiverId,
    );

    if (existing) {
      return this.resolveExistingRequest(userId, existing);
    }

    const created = await this.socialRepository.createFriendRequest(userId, data.receiverId);
    if (!created) {
      const raced = await this.socialRepository.findFriendship(userId, data.receiverId);
      if (!raced) {
        throw new ConflictException('Friend request could not be created');
      }
      return this.resolveExistingRequest(userId, raced);
    }

    await this.notifySafely({
      receiverId: data.receiverId,
      senderId: userId,
      type: NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
      title: 'Lời mời kết bạn mới',
      content: 'Bạn có một lời mời kết bạn mới.',
      redirectUrl: '/profile?tab=friends',
    });

    return this.toStatusView(created, userId);
  }

  async respondToRequest(
    userId: string,
    friendshipId: string,
    data: UpdateFriendshipDto,
  ) {
    const friendship = await this.socialRepository.findFriendshipById(friendshipId);
    if (!friendship) {
      throw new NotFoundException('Friend request not found');
    }
    if (friendship.receiverId !== userId) {
      throw new ForbiddenException('Only the recipient can respond to this request');
    }
    if (friendship.status !== 'PENDING') {
      throw new ConflictException('Friend request is no longer pending');
    }

    const status: FriendshipStatus =
      data.action === FriendshipAction.ACCEPT ? 'ACCEPTED' : 'REJECTED';
    const updated = await this.socialRepository.updateFriendshipStatus(
      friendshipId,
      userId,
      status,
    );
    if (!updated) {
      throw new ConflictException('Friend request was updated by another action');
    }

    await this.notifySafely({
      receiverId: friendship.senderId,
      senderId: userId,
      type:
        status === 'ACCEPTED'
          ? NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED
          : NOTIFICATION_TYPES.FRIEND_REQUEST_REJECTED,
      title: status === 'ACCEPTED' ? 'Lời mời kết bạn đã được chấp nhận' : 'Lời mời kết bạn bị từ chối',
      content:
        status === 'ACCEPTED'
          ? 'Lời mời kết bạn của bạn đã được chấp nhận.'
          : 'Lời mời kết bạn của bạn đã bị từ chối.',
      redirectUrl: '/profile?tab=friends',
    });

    return this.toStatusView(updated, userId);
  }

  async getMyFriends(userId: string) {
    return this.socialRepository.getFriends(userId);
  }

  async listProfileFeed(userId: string, limit: number, cursor?: string) {
    const result = await this.socialRepository.listProfilePosts({ viewerId: userId, limit, cursor });
    if (result.invalidCursor) throw new BadRequestException({ code: 'INVALID_CURSOR' });
    return { data: await this.sanitizeProfilePosts(result.data, userId), meta: result.meta };
  }

  async listMyProfilePosts(userId: string, limit: number, cursor?: string) {
    const result = await this.socialRepository.listProfilePosts({ viewerId: userId, authorId: userId, limit, cursor });
    if (result.invalidCursor) throw new BadRequestException({ code: 'INVALID_CURSOR' });
    return { data: await this.sanitizeProfilePosts(result.data, userId), meta: result.meta };
  }

  async createProfilePost(userId: string, dto: CreateProfilePostDto, idempotencyKey?: string) {
    const body = dto.body?.trim() || '';
    const mediaUrls = [...new Set((dto.mediaUrls ?? []).map((url) => url.trim()).filter(Boolean))].slice(0, 10);
    if (!body && mediaUrls.length === 0 && !dto.sharedPostId) {
      throw new BadRequestException('Bài viết cần có nội dung hoặc ảnh.');
    }

    if (dto.sharedPostId) {
      const original = await this.socialRepository.getProfilePost(dto.sharedPostId, userId);
      if (!original || original.status !== 'PUBLISHED') throw new NotFoundException('Không tìm thấy bài viết được chia sẻ.');
      await this.requireProfilePostVisible(original, userId);
    }

    const imageScan = await this.imageModerationService.scanMediaUrls(mediaUrls);
    const textToCheck = [body, imageScan.extractedText].filter(Boolean).join('\n');
    const whitebox = this.whiteboxService.checkContent(textToCheck);
    if (whitebox.rejected) {
      throw new BadRequestException({
        error: 'CONTENT_MODERATION_REJECTED',
        ruleCode: whitebox.ruleCode,
        message: whitebox.reasonVi || 'Nội dung vi phạm tiêu chuẩn cộng đồng.',
      });
    }

    let flagged = imageScan.status === 'NEEDS_REVIEW';
    let moderationReason = imageScan.reasonVi;
    if (whitebox.flagged || mediaUrls.length > 0) {
      const aiResult = await this.blackboxAiService.evaluatePost(
        this.whiteboxService.getNormalizedText(textToCheck),
        { authorName: 'Thành viên', communityName: 'Trang cá nhân' },
        imageScan.scannedUrls,
      );
      if (aiResult.isFallback) {
        flagged = true;
        moderationReason = 'Không thể hoàn tất kiểm tra tự động; bài viết đang chờ duyệt.';
      } else if (!aiResult.isSafe && aiResult.riskScore >= 0.7) {
        flagged = true;
        moderationReason = aiResult.reasonVi || 'Nội dung cần được kiểm duyệt thêm.';
      }
    }

    const post = await this.socialRepository.createProfilePost({
      authorId: userId,
      body: body || null,
      mediaUrls,
      // Profile posts currently have one product rule: only accepted friends can see them.
      visibility: 'FRIENDS',
      sharedPostId: dto.sharedPostId ?? null,
      idempotencyKey: idempotencyKey?.trim() || null,
      status: flagged ? 'PENDING' : 'PUBLISHED',
    });
    if (!post) throw new BadRequestException('Không thể tạo bài viết.');
    return { ...post, moderationNotes: flagged ? moderationReason : undefined };
  }

  async deleteProfilePost(postId: string, userId: string) {
    const deleted = await this.socialRepository.deleteProfilePost(postId, userId);
    if (!deleted) throw new NotFoundException('Không tìm thấy bài viết hoặc bạn không có quyền xóa.');
    return deleted;
  }

  async listProfileComments(postId: string, userId: string, limit: number, cursor?: string) {
    const post = await this.socialRepository.getProfilePost(postId, userId);
    await this.requireProfilePostVisible(post, userId);
    return this.communitySocialRepository.listComments(postId, limit, cursor, userId);
  }

  async createProfileComment(postId: string, userId: string, dto: CreateCommunityCommentDto) {
    const post = await this.socialRepository.getProfilePost(postId, userId);
    await this.requireProfilePostVisible(post, userId);
    const body = dto.body?.trim() || '';
    if (!body) throw new BadRequestException('Bình luận không được để trống.');
    const whitebox = this.whiteboxService.checkContent(body);
    if (whitebox.rejected) {
      throw new BadRequestException({ error: 'CONTENT_MODERATION_REJECTED', ruleCode: whitebox.ruleCode, message: whitebox.reasonVi || 'Bình luận vi phạm tiêu chuẩn cộng đồng.' });
    }
    if (whitebox.flagged) {
      throw new BadRequestException({ error: 'CONTENT_MODERATION_REVIEW_REQUIRED', message: 'Bình luận cần được kiểm duyệt trước khi đăng.' });
    }
    return this.communitySocialRepository.createComment(postId, userId, body, dto.parentId);
  }

  async reactToProfilePost(postId: string, userId: string, reactionType: string) {
    const post = await this.socialRepository.getProfilePost(postId, userId);
    await this.requireProfilePostVisible(post, userId);
    return this.communitySocialRepository.setReaction(postId, userId, reactionType);
  }

  async getProfilePostReactions(postId: string, userId: string) {
    const post = await this.socialRepository.getProfilePost(postId, userId);
    await this.requireProfilePostVisible(post, userId);
    return this.communitySocialRepository.listPostReactions(postId, userId);
  }

  async shareProfilePost(postId: string, userId: string, dto: CreateProfilePostDto, idempotencyKey?: string) {
    const original = await this.socialRepository.getProfilePost(postId, userId);
    await this.requireProfilePostVisible(original, userId);
    if (original?.status !== 'PUBLISHED') throw new NotFoundException('Bài viết này chưa thể được chia sẻ.');
    return this.createProfilePost(userId, {
      ...dto,
      body: dto.body?.trim() || 'Đã chia sẻ một bài viết.',
      sharedPostId: postId,
      visibility: 'FRIENDS',
    }, idempotencyKey);
  }

  private async requireProfilePostVisible(post: any, viewerId: string) {
    if (!post || post.communityId !== null || post.deletedAt || post.status !== 'PUBLISHED') {
      throw new NotFoundException('Không tìm thấy bài viết.');
    }
    if (post.visibility !== 'FRIENDS') throw new NotFoundException('Không tìm thấy bài viết.');
    if (post.authorId === viewerId) return;
    const friendship = await this.socialRepository.findFriendship(viewerId, post.authorId);
    if (friendship?.status !== 'ACCEPTED') throw new NotFoundException('Không tìm thấy bài viết.');
  }

  private async sanitizeProfilePosts(posts: any[], viewerId: string) {
    return Promise.all(posts.map(async (post) => {
      if (!post.sharedPost) return post;
      const sharedVisible = post.sharedPost.authorId === viewerId
        || (post.sharedPost.visibility === 'FRIENDS' && (await this.socialRepository.findFriendship(viewerId, post.sharedPost.authorId))?.status === 'ACCEPTED');
      return sharedVisible ? post : { ...post, sharedPost: null };
    }));
  }

  async getFriendshipStatus(userId: string, targetUserId: string): Promise<FriendshipStatusView> {
    if (userId === targetUserId) {
      return this.noneStatus();
    }

    const target = await this.socialRepository.findActiveUser(targetUserId);
    if (!target) {
      throw new NotFoundException('User not found');
    }

    const friendship = await this.socialRepository.findFriendship(userId, targetUserId);
    return friendship ? this.toStatusView(friendship, userId) : this.noneStatus();
  }

  async deleteFriendship(userId: string, friendshipId: string): Promise<FriendshipStatusView> {
    const friendship = await this.socialRepository.findFriendshipById(friendshipId);
    if (!friendship) {
      throw new NotFoundException('Friendship not found');
    }

    const canDeletePending =
      friendship.status === 'PENDING' && friendship.senderId === userId;
    const canUnfriend =
      friendship.status === 'ACCEPTED' &&
      (friendship.senderId === userId || friendship.receiverId === userId);

    if (!canDeletePending && !canUnfriend) {
      throw new ForbiddenException('You cannot remove this friendship');
    }

    const deleted = await this.socialRepository.softDeleteFriendship(friendshipId, userId);
    if (!deleted) {
      throw new ConflictException('Friendship was updated by another action');
    }

    return this.noneStatus();
  }

  private resolveExistingRequest(
    userId: string,
    friendship: { senderId: string; receiverId: string; status: string; id: string },
  ): FriendshipStatusView {
    if (friendship.status === 'PENDING' && friendship.senderId === userId) {
      return this.toStatusView(friendship, userId);
    }

    if (friendship.status === 'PENDING' && friendship.receiverId === userId) {
      throw new ConflictException('This user already sent you a friend request');
    }

    throw new ConflictException('Friendship or request already exists');
  }

  private toStatusView(
    friendship: { id: string; senderId: string; receiverId: string; status: string },
    viewerId: string,
  ): FriendshipStatusView {
    const status = this.normalizeStatus(friendship.status);
    const direction: FriendshipDirection =
      friendship.senderId === viewerId ? 'OUTGOING' : 'INCOMING';
    return {
      id: friendship.id,
      status,
      direction,
      senderId: friendship.senderId,
      receiverId: friendship.receiverId,
    };
  }

  private normalizeStatus(status: string): FriendshipStatus {
    if (status === 'ACCEPTED' || status === 'REJECTED' || status === 'BLOCKED') {
      return status;
    }
    return 'PENDING';
  }

  private noneStatus(): FriendshipStatusView {
    return {
      id: null,
      status: 'NONE',
      direction: 'NONE',
      senderId: null,
      receiverId: null,
    };
  }

  private async notifySafely(data: {
    receiverId: string;
    senderId: string;
    type: string;
    title: string;
    content: string;
    redirectUrl: string;
  }): Promise<void> {
    try {
      await this.notificationsService.sendNotification(data);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Friendship notification failed: ${message}`);
    }
  }
}
