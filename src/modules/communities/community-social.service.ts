import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CommunitiesRepository } from './communities.repository';
import { CommunitySocialRepository } from './community-social.repository';
import type { CreateCommunityPostDto } from './dto/create-community-post.dto';
import type { CreateCommunityCommentDto } from './dto/create-community-comment.dto';
import type { UpdateCommunitySocialSettingsDto } from './dto/update-community-social-settings.dto';
import type { ReportCommunityContentDto } from './dto/report-community-content.dto';
import type { UpdateCommunityCommentDto } from './dto/update-community-comment.dto';
import { NotificationsService } from '../notifications/notifications.service';
import {
  buildCommunityPostApprovedNotification,
  buildCommunityPostCommentedNotification,
  buildCommunityPostMentionedNotification,
} from '../notifications/notification-builder';

type SocialUser = { id: string; fullName?: string; roles?: string[] };

@Injectable()
export class CommunitySocialService {
  constructor(
    private readonly socialRepository: CommunitySocialRepository,
    private readonly communitiesRepository: CommunitiesRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getSettings(communityId: string) {
    await this.ensureCommunity(communityId);
    return this.socialRepository.getSettings(communityId);
  }

  async listPosts(communityId: string, limit: number, cursor?: string, viewer?: SocialUser) {
    const community = await this.ensureCommunity(communityId);
    const settings = await this.socialRepository.getSettings(communityId);
    if (!settings.publicFeed) {
      await this.requireJoined(communityId, viewer?.id);
    }
    if (community.visibility === 'PRIVATE') {
      await this.requireJoined(communityId, viewer?.id);
    }
    return this.socialRepository.listPosts(communityId, limit, cursor, viewer?.id);
  }

  async createPost(
    communityId: string,
    user: SocialUser,
    dto: CreateCommunityPostDto,
    idempotencyKey?: string,
  ) {
    const community = await this.ensureCommunity(communityId);
    const member = await this.requireJoined(communityId, user.id);
    const body = dto.body?.trim() ?? '';
    const mediaUrls = dto.mediaUrls ?? [];
    if (!body && mediaUrls.length === 0) {
      throw new BadRequestException('Bài viết cần có nội dung hoặc ít nhất một ảnh.');
    }
    const settings = await this.socialRepository.getSettings(communityId);
    const mentionIds = [...new Set(dto.mentions ?? [])];
    const canManage = member.role === 'OWNER' || member.role === 'MODERATOR' || user.roles?.includes('ADMIN');
    if (mentionIds.length > 0 && settings.memberTaggingPolicy === 'OFF') {
      throw new ForbiddenException('Cộng đồng hiện đang tắt gắn thẻ thành viên.');
    }
    if (mentionIds.length > 0 && settings.memberTaggingPolicy === 'ADMINS' && !canManage) {
      throw new ForbiddenException('Chỉ ban quản trị được gắn thẻ thành viên.');
    }
    const validMentionIds = await this.socialRepository.getJoinedMentionIds(communityId, mentionIds);
    if (validMentionIds.length !== mentionIds.length) {
      throw new BadRequestException('Chỉ có thể gắn thẻ thành viên đang tham gia cộng đồng.');
    }
    if (settings.postingPolicy === 'OFF') {
      throw new ForbiddenException('Cộng đồng hiện không nhận bài viết.');
    }
    if (settings.postingPolicy === 'ADMINS' && !canManage) {
      throw new ForbiddenException('Chỉ ban quản trị được đăng bài.');
    }
    const status = settings.postApprovalRequired && member.role !== 'OWNER' && member.role !== 'MODERATOR'
      ? 'PENDING'
      : 'PUBLISHED';
    const post = await this.socialRepository.createPost(communityId, user.id, { ...dto, mentions: validMentionIds }, status, idempotencyKey);
    if (!post) throw new BadRequestException('Không thể tạo bài viết.');
    for (const receiverId of validMentionIds) {
      if (receiverId === user.id) continue;
      await this.notificationsService.sendNotification(
        buildCommunityPostMentionedNotification({
          communityId,
          communityName: community.name,
          senderName: user.fullName?.trim() || 'Thành viên',
          receiverId,
          senderId: user.id,
          postId: post.id,
        }),
      );
    }
    return post;
  }

  async deletePost(communityId: string, postId: string, user: SocialUser) {
    await this.ensureCommunity(communityId);
    const post = await this.socialRepository.findPost(postId);
    if (!post || post.communityId !== communityId) {
      throw new NotFoundException('Không tìm thấy bài viết.');
    }
    // Cho phép tác giả bài viết HOẶC ban quản trị (OWNER / MODERATOR / ADMIN) xóa
    if (post.authorId !== user.id) {
      await this.requireManager(communityId, user);
    } else {
      await this.requireJoined(communityId, user.id);
    }
    return this.socialRepository.softDeletePost(postId);
  }

  async updateSettings(communityId: string, user: SocialUser, dto: UpdateCommunitySocialSettingsDto) {
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

  async listComments(communityId: string, postId: string, limit: number, cursor?: string, viewer?: SocialUser) {
    const community = await this.ensureCommunity(communityId);
    const settings = await this.socialRepository.getSettings(communityId);
    if (!settings.publicFeed || community.visibility === 'PRIVATE') {
      await this.requireJoined(communityId, viewer?.id);
    }
    const post = await this.socialRepository.findPost(postId);
    if (!post || post.communityId !== communityId || post.status !== 'PUBLISHED') {
      throw new NotFoundException('Không tìm thấy bài viết.');
    }
    return this.socialRepository.listComments(postId, limit, cursor);
  }

  async createComment(communityId: string, postId: string, user: SocialUser, dto: CreateCommunityCommentDto) {
    const member = await this.requireJoined(communityId, user.id);
    const post = await this.socialRepository.findPost(postId);
    if (!post || post.communityId !== communityId || post.status !== 'PUBLISHED') throw new NotFoundException('Không tìm thấy bài viết.');
    const settings = await this.socialRepository.getSettings(communityId);
    if (!settings.commentsEnabled) throw new ForbiddenException('Cộng đồng hiện không nhận bình luận.');
    if (dto.parentId) {
      const parent = await this.socialRepository.findComment(dto.parentId);
      if (!parent || parent.postId !== postId || parent.parentId) {
        throw new BadRequestException('Bình luận cha không hợp lệ.');
      }
    }
    void member;
    const comment = await this.socialRepository.createComment(postId, user.id, dto.body, dto.parentId);
    if (comment && post.authorId && post.authorId !== user.id) {
      await this.notificationsService.sendNotification(
        buildCommunityPostCommentedNotification({
          communityId,
          communityName: community.name,
          senderName: user.fullName?.trim() || 'Thành viên',
          receiverId: post.authorId,
          senderId: user.id,
          postId: post.id,
        }),
      );
    }
    return comment;
  }

  async updateComment(communityId: string, commentId: string, user: SocialUser, dto: UpdateCommunityCommentDto) {
    const comment = await this.socialRepository.findComment(commentId);
    if (!comment) throw new NotFoundException('Không tìm thấy bình luận.');
    if (comment.authorId !== user.id) throw new ForbiddenException('Bạn chỉ có thể sửa bình luận của mình.');
    const post = await this.socialRepository.findPost(comment.postId);
    if (!post || post.communityId !== communityId || post.status !== 'PUBLISHED') throw new NotFoundException('Không tìm thấy bài viết.');
    await this.requireJoined(communityId, user.id);
    return this.socialRepository.updateComment(commentId, dto.body);
  }

  async deleteComment(communityId: string, commentId: string, user: SocialUser) {
    const comment = await this.socialRepository.findComment(commentId);
    if (!comment) throw new NotFoundException('Không tìm thấy bình luận.');
    const post = await this.socialRepository.findPost(comment.postId);
    if (!post || post.communityId !== communityId) throw new NotFoundException('Không tìm thấy bài viết.');
    if (comment.authorId !== user.id) {
      await this.requireManager(communityId, user);
    } else {
      await this.requireJoined(communityId, user.id);
    }
    return this.socialRepository.softDeleteComment(commentId);
  }

  async moderateComment(communityId: string, commentId: string, user: SocialUser, status: 'PUBLISHED' | 'HIDDEN' | 'REJECTED', reason?: string) {
    await this.requireManager(communityId, user);
    const comment = await this.socialRepository.findComment(commentId);
    if (!comment) throw new NotFoundException('Không tìm thấy bình luận.');
    const post = await this.socialRepository.findPost(comment.postId);
    if (!post || post.communityId !== communityId) throw new NotFoundException('Không tìm thấy bài viết.');
    return this.socialRepository.moderateComment(commentId, status, reason);
  }

  async listPendingPosts(communityId: string, user: SocialUser) {
    await this.requireManager(communityId, user);
    return this.socialRepository.listPendingPosts(communityId);
  }

  async react(communityId: string, postId: string, user: SocialUser, reactionType: string) {
    await this.requireJoined(communityId, user.id);
    const post = await this.socialRepository.findPost(postId);
    if (!post || post.communityId !== communityId || post.status !== 'PUBLISHED') throw new NotFoundException('Không tìm thấy bài viết.');
    return this.socialRepository.setReaction(postId, user.id, reactionType);
  }

  async report(communityId: string, postId: string, user: SocialUser, dto: ReportCommunityContentDto) {
    await this.requireJoined(communityId, user.id);
    const post = await this.socialRepository.findPost(postId);
    if (!post || post.communityId !== communityId) throw new NotFoundException('Không tìm thấy bài viết.');
    return this.socialRepository.createReport({ communityId, reporterId: user.id, postId, reason: dto.reason, details: dto.details });
  }

  async updatePreferences(communityId: string, user: SocialUser, values: { muted: boolean; notificationsEnabled: boolean }) {
    await this.requireJoined(communityId, user.id);
    return this.socialRepository.updatePreferences(communityId, user.id, values);
  }

  async moderatePost(communityId: string, postId: string, user: SocialUser, status: 'PUBLISHED' | 'REJECTED' | 'HIDDEN') {
    const community = await this.ensureCommunity(communityId);
    await this.requireManager(communityId, user);
    const post = await this.socialRepository.findPost(postId);
    if (!post || post.communityId !== communityId) throw new NotFoundException('Không tìm thấy bài viết.');
    const updated = await this.socialRepository.updatePostStatus(postId, status);
    if (updated?.status === 'PUBLISHED' && post.authorId) {
      await this.notificationsService.sendNotification(
        buildCommunityPostApprovedNotification({
          communityId,
          communityName: community.name,
          receiverId: post.authorId,
          postId: post.id,
        }),
      );
    }
    return updated;
  }

  private async ensureCommunity(communityId: string) {
    const community = await this.communitiesRepository.findById(communityId);
    if (!community) throw new NotFoundException('Không tìm thấy cộng đồng.');
    return community;
  }

  private async requireJoined(communityId: string, userId?: string) {
    if (!userId) throw new ForbiddenException('Bạn cần đăng nhập và tham gia cộng đồng.');
    const member = await this.communitiesRepository.findMember(communityId, userId);
    if (!member || member.status !== 'JOINED') {
      throw new ForbiddenException('Bạn cần là thành viên chính thức của cộng đồng.');
    }
    return member;
  }

  private async requireManager(communityId: string, user: SocialUser) {
    if (user.roles?.includes('ADMIN')) return null;
    const member = await this.requireJoined(communityId, user.id);
    if (!['OWNER', 'MODERATOR'].includes(member.role)) {
      throw new ForbiddenException('Bạn không có quyền quản trị không gian này.');
    }
    return member;
  }
}
