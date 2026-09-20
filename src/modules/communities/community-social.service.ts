import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { CommunitiesRepository } from './communities.repository';
import { CommunitySocialRepository, DuplicateCommunityPostError } from './community-social.repository';
import type { CreateCommunityPostDto } from './dto/create-community-post.dto';
import type { CreateCommunityCommentDto } from './dto/create-community-comment.dto';
import type { UpdateCommunitySocialSettingsDto } from './dto/update-community-social-settings.dto';
import type { QueryCommunityActivityFeedDto } from './dto/query-community-activity-feed.dto';
import type { ShareCommunityActivityDto } from './dto/share-community-activity.dto';
import type { ReportCommunityContentDto } from './dto/report-community-content.dto';
import type { UpdateCommunityCommentDto } from './dto/update-community-comment.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { sanitizeScoringPresets } from '../club-match-sessions/scoring-preset';
import {
  buildCommunityPostApprovedNotification,
  buildCommunityPostCommentedNotification,
  buildCommunityPostMentionedNotification,
  buildCommunityPostNewNotification,
} from '../notifications/notification-builder';
import { CommunityWhiteboxService } from './moderation/community-whitebox.service';
import { CommunityBlackboxAiService } from './moderation/community-blackbox-ai.service';
import { CommunityImageModerationService } from './moderation/community-image-moderation.service';
import type { DeleteCommunityPostDto } from './dto/moderate-community-post.dto';
import { buildCommunityPostFingerprint, getCommunityDuplicateWindowMinutes } from './community-content-fingerprint';

type SocialUser = { id: string; fullName?: string; roles?: string[] };

@Injectable()
export class CommunitySocialService {
  constructor(
    private readonly socialRepository: CommunitySocialRepository,
    private readonly communitiesRepository: CommunitiesRepository,
    private readonly notificationsService: NotificationsService,
    private readonly whiteboxService: CommunityWhiteboxService,
    private readonly blackboxAiService: CommunityBlackboxAiService,
    @Optional() private readonly imageModerationService?: CommunityImageModerationService,
  ) {}

  async getSettings(communityId: string) {
    await this.ensureCommunity(communityId);
    return this.socialRepository.getSettings(communityId);
  }

  async listPosts(communityId: string, limit: number, cursor?: string, viewer?: SocialUser, search?: string) {
    const community = await this.ensureCommunity(communityId);
    const settings = await this.socialRepository.getSettings(communityId);
    if (!settings.publicFeed) {
      await this.requireJoined(communityId, viewer?.id);
    }
    if (community.visibility !== 'PUBLIC') {
      await this.requireJoined(communityId, viewer?.id);
    }
    return this.socialRepository.listPosts(communityId, limit, cursor, viewer?.id, search);
  }

  async listActivityFeed(query: QueryCommunityActivityFeedDto, viewer?: SocialUser) {
    const result = await this.socialRepository.listActivityFeed({
      limit: query.limit ?? 20,
      cursor: query.cursor,
      date: query.date,
      type: query.type,
      region: query.region,
      viewerId: viewer?.id,
    });
    if (result.invalidCursor) {
      throw new BadRequestException({ code: 'INVALID_CURSOR' });
    }
    return { data: { items: result.data }, meta: result.meta };
  }

  async shareActivity(
    communityId: string,
    user: SocialUser,
    dto: ShareCommunityActivityDto,
    idempotencyKey?: string,
  ) {
    const hasSession = Boolean(dto.clubMatchSessionId);
    const hasTournament = Boolean(dto.tournamentId);
    if (hasSession === hasTournament) {
      throw new BadRequestException({ code: 'INVALID_ACTIVITY_TARGET' });
    }
    const community = await this.ensureCommunity(communityId);
    const member = await this.requireJoined(communityId, user.id);
    const activity = await this.socialRepository.findLinkedActivity(communityId, {
      clubMatchSessionId: dto.clubMatchSessionId,
      tournamentId: dto.tournamentId,
    });
    if (!activity) throw new NotFoundException({ code: 'ACTIVITY_NOT_FOUND' });
    const terminalStatuses = new Set(['ENDED', 'CANCELLED', 'COMPLETED', 'FINISHED', 'DONE', 'PENDING_DELETE']);
    if (terminalStatuses.has(activity.resource.status)) {
      throw new ConflictException({ code: 'ACTIVITY_TERMINAL' });
    }
    const settings = await this.socialRepository.getSettings(communityId);
    const canManage = member.role === 'OWNER' || member.role === 'ADMIN' || member.role === 'MODERATOR' || user.roles?.includes('ADMIN');
    const isSession = activity.kind === 'SESSION';
    const resourceName = isSession
      ? activity.resource.name?.trim() || `Buổi giao lưu CLB ${community.name}`
      : activity.resource.name;
    const body = dto.body?.trim() || (isSession
      ? `🏸 ${resourceName} đang mở đăng ký.`
      : `🏆 ${resourceName} đang mở đăng ký.`);
    const moderation = await this.moderateText(body, user, community.name);
    const status = moderation.flagged || (settings.postApprovalRequired && !canManage) ? 'PENDING' : 'PUBLISHED';
    const result = await this.socialRepository.createLinkedActivityPost({
      communityId,
      authorId: user.id,
      clubMatchSessionId: dto.clubMatchSessionId,
      tournamentId: dto.tournamentId,
      body,
      status,
      idempotencyKey: idempotencyKey?.trim() || undefined,
    });
    if (!result.post) throw new BadRequestException({ code: 'ACTIVITY_SHARE_FAILED' });
    if (!result.reused && result.post.status === 'PUBLISHED') {
      await this.sendNewPostNotifications({
        communityId,
        communityName: community.name,
        senderId: user.id,
        senderName: user.fullName?.trim() || 'Thành viên',
        postId: result.post.id,
      });
    }
    return { ...result.post, reused: result.reused };
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
    if (!body && mediaUrls.length === 0 && !dto.poll) {
      throw new BadRequestException('Bài viết cần có nội dung, ảnh hoặc bình chọn.');
    }
    const settings = await this.socialRepository.getSettings(communityId);
    const mentionIds = [...new Set(dto.mentions ?? [])];
    const canManage = member.role === 'OWNER' || member.role === 'ADMIN' || member.role === 'MODERATOR' || user.roles?.includes('ADMIN');
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

    // Chặn bài giống hệt của cùng người trong cùng cộng đồng trước khi tải ảnh
    // hoặc gọi AI. Chỉ retry cùng idempotency key được phép dùng lại bản ghi cũ;
    // cung cấp key mới không thể trở thành đường vòng cho bộ lọc trùng.
    const normalizedIdempotencyKey = idempotencyKey?.trim();
    if (typeof (this.socialRepository as CommunitySocialRepository & {
      findRecentDuplicatePost?: CommunitySocialRepository['findRecentDuplicatePost'];
    }).findRecentDuplicatePost === 'function') {
      const duplicate = await this.socialRepository.findRecentDuplicatePost(
        communityId,
        user.id,
        buildCommunityPostFingerprint(dto),
        getCommunityDuplicateWindowMinutes(),
      );
      const isSameIdempotencyRetry = Boolean(normalizedIdempotencyKey) && duplicate?.idempotencyKey === normalizedIdempotencyKey;
      if (duplicate && !isSameIdempotencyRetry) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'DUPLICATE_POST_SPAM',
          message: 'Bài viết giống bài bạn vừa đăng gần đây. Hãy chỉnh sửa nội dung trước khi đăng lại.',
        });
      }
    }

    // Whitebox chặn chắc chắn; AI chỉ xử lý tín hiệu mơ hồ. QR/OCR của ảnh
    // được đưa vào cùng bộ lọc để ảnh không trở thành đường vòng cho link/số điện thoại.
    const imageScan = this.imageModerationService
      ? await this.imageModerationService.scanMediaUrls(mediaUrls)
      : { status: 'CLEAN' as const, extractedText: '', scannedUrls: [], reasonVi: undefined };
    const textToCheck = [
      body,
      ...(dto.topics || []),
      dto.poll?.question,
      ...(dto.poll?.options || []),
      imageScan.extractedText,
    ].filter(Boolean).join('\n');
    const moderation = await this.moderateText(textToCheck, user, community.name, imageScan.scannedUrls);
    const aiFlagged = moderation.flagged || imageScan.status === 'NEEDS_REVIEW';
    const aiReason = moderation.reason || imageScan.reasonVi;

    // Trạng thái bài viết:
    // 1. Nếu AI phát hiện vi phạm nguy cơ cao -> Bắt buộc PENDING để BQT duyệt (hoặc từ chối nếu policy khắt khe)
    // 2. Nếu CLB bật postApprovalRequired và người đăng không phải BQT -> PENDING
    // 3. Ngược lại -> PUBLISHED
    const status = (aiFlagged || (settings.postApprovalRequired && !canManage))
      ? 'PENDING'
      : 'PUBLISHED';

    let post: Awaited<ReturnType<CommunitySocialRepository['createPost']>>;
    try {
      post = await this.socialRepository.createPost(communityId, user.id, { ...dto, mentions: validMentionIds }, status, idempotencyKey);
    } catch (error: unknown) {
      if (error instanceof DuplicateCommunityPostError) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'DUPLICATE_POST_SPAM',
          message: 'Bài viết giống bài bạn vừa đăng gần đây. Hãy chỉnh sửa nội dung trước khi đăng lại.',
        });
      }
      throw error;
    }
    if (!post) throw new BadRequestException('Không thể tạo bài viết.');

    let createdPoll: any = null;
    if (dto.poll && post.id) {
      createdPoll = await this.socialRepository.createPoll(
        communityId,
        user.id,
        dto.poll,
        post.id,
      );
    }

    if (post.status !== 'PENDING') {
      await this.sendNewPostNotifications({
        communityId,
        communityName: community.name,
        senderId: user.id,
        senderName: user.fullName?.trim() || 'Thành viên',
        postId: post.id,
        excludeUserIds: validMentionIds,
      });
      await this.sendMentionNotifications({
        communityId,
        communityName: community.name,
        mentionIds: validMentionIds,
        senderId: user.id,
        senderName: user.fullName?.trim() || 'Thành viên',
        postId: post.id,
      });
    }
    return {
      ...post,
      poll: createdPoll,
      moderationNotes: aiFlagged ? aiReason : undefined,
    };
  }

  async deletePost(communityId: string, postId: string, user: SocialUser, dto?: DeleteCommunityPostDto) {
    await this.ensureCommunity(communityId);
    const post = await this.socialRepository.findPost(postId);
    if (!post || post.communityId !== communityId) {
      throw new NotFoundException('Không tìm thấy bài viết.');
    }
    // Cho phép tác giả bài viết HOẶC ban quản trị (OWNER / MODERATOR / ADMIN) xóa
    const isAuthor = post.authorId === user.id;
    if (!isAuthor) {
      await this.requireManager(communityId, user);
    } else {
      await this.requireJoined(communityId, user.id);
    }
    void dto;
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
      memberMatchCreationEnabled: dto.memberMatchCreationEnabled,
      memberMatchScoringEnabled: dto.memberMatchScoringEnabled,
      memberMatchDeletionEnabled: dto.memberMatchDeletionEnabled,
      matchScoringPresets: dto.matchScoringPresets
        ? sanitizeScoringPresets(dto.matchScoringPresets)
        : undefined,
    });
  }

  async listComments(communityId: string, postId: string, limit: number, cursor?: string, viewer?: SocialUser) {
    const community = await this.ensureCommunity(communityId);
    const settings = await this.socialRepository.getSettings(communityId);
    if (!settings.publicFeed || community.visibility !== 'PUBLIC') {
      await this.requireJoined(communityId, viewer?.id);
    }
    const post = await this.socialRepository.findPost(postId);
    if (!post || post.communityId !== communityId || post.status !== 'PUBLISHED') {
      throw new NotFoundException('Không tìm thấy bài viết.');
    }
    return this.socialRepository.listComments(postId, limit, cursor, viewer?.id);
  }

  async createComment(communityId: string, postId: string, user: SocialUser, dto: CreateCommunityCommentDto) {
    const community = await this.ensureCommunity(communityId);
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
    await this.requireTextAllowed(dto.body, user, community.name);
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
    const community = await this.ensureCommunity(communityId);
    const comment = await this.socialRepository.findComment(commentId);
    if (!comment) throw new NotFoundException('Không tìm thấy bình luận.');
    if (comment.authorId !== user.id) throw new ForbiddenException('Bạn chỉ có thể sửa bình luận của mình.');
    const post = await this.socialRepository.findPost(comment.postId);
    if (!post || post.communityId !== communityId || post.status !== 'PUBLISHED') throw new NotFoundException('Không tìm thấy bài viết.');
    await this.requireJoined(communityId, user.id);
    await this.requireTextAllowed(dto.body, user, community.name);
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

  async getPostReactions(communityId: string, postId: string, viewer?: SocialUser) {
    const community = await this.ensureCommunity(communityId);
    const settings = await this.socialRepository.getSettings(communityId);
    if (!settings.publicFeed || community.visibility !== 'PUBLIC') {
      await this.requireJoined(communityId, viewer?.id);
    }
    const post = await this.socialRepository.findPost(postId);
    if (!post || post.communityId !== communityId || post.status !== 'PUBLISHED') {
      throw new NotFoundException('Không tìm thấy bài viết.');
    }
    return this.socialRepository.listPostReactions(postId, viewer?.id);
  }

  async reactToComment(communityId: string, commentId: string, user: SocialUser, reactionType: string) {
    await this.requireJoined(communityId, user.id);
    const comment = await this.socialRepository.findComment(commentId);
    if (!comment) throw new NotFoundException('Không tìm thấy bình luận.');
    const post = await this.socialRepository.findPost(comment.postId);
    if (!post || post.communityId !== communityId || post.status !== 'PUBLISHED') {
      throw new NotFoundException('Không tìm thấy bình luận.');
    }
    return this.socialRepository.setCommentReaction(commentId, user.id, reactionType);
  }

  async getCommentReactions(communityId: string, commentId: string, viewer?: SocialUser) {
    const community = await this.ensureCommunity(communityId);
    const settings = await this.socialRepository.getSettings(communityId);
    if (!settings.publicFeed || community.visibility !== 'PUBLIC') {
      await this.requireJoined(communityId, viewer?.id);
    }
    const comment = await this.socialRepository.findComment(commentId);
    if (!comment) throw new NotFoundException('Không tìm thấy bình luận.');
    const post = await this.socialRepository.findPost(comment.postId);
    if (!post || post.communityId !== communityId || post.status !== 'PUBLISHED') {
      throw new NotFoundException('Không tìm thấy bình luận.');
    }
    return this.socialRepository.listCommentReactions(commentId, viewer?.id);
  }

  async report(communityId: string, postId: string, user: SocialUser, dto: ReportCommunityContentDto) {
    await this.requireJoined(communityId, user.id);
    const post = await this.socialRepository.findPost(postId);
    if (!post || post.communityId !== communityId) throw new NotFoundException('Không tìm thấy bài viết.');
    if (await this.socialRepository.findOpenPostReport(communityId, postId, user.id)) {
      throw new BadRequestException('Bạn đã báo cáo bài viết này và đang chờ xử lý.');
    }
    return this.socialRepository.createReport({ communityId, reporterId: user.id, postId, reason: dto.reason, details: dto.details });
  }

  async listReports(communityId: string, user: SocialUser, status?: string) {
    await this.requireManager(communityId, user);
    return this.socialRepository.listReports(communityId, status);
  }

  async updateReportStatus(communityId: string, reportId: string, user: SocialUser, status: string) {
    await this.requireManager(communityId, user);
    const updated = await this.socialRepository.updateReportStatus(communityId, reportId, status);
    if (!updated) throw new NotFoundException('Không tìm thấy báo cáo.');
    return updated;
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
      await this.sendMentionNotifications({
        communityId,
        communityName: community.name,
        mentionIds: Array.isArray(post.mentions) ? post.mentions : [],
        senderId: post.authorId,
        senderName: 'Thành viên CLB',
        postId: post.id,
      });
    }
    return updated;
  }

  async votePoll(communityId: string, pollId: string, optionId: string, user: SocialUser) {
    await this.ensureCommunity(communityId);
    await this.requireJoined(communityId, user.id);
    const poll = await this.socialRepository.getPollDetails(pollId);
    if (!poll || poll.communityId !== communityId) {
      throw new NotFoundException('Không tìm thấy cuộc bình chọn.');
    }
    if (poll.isClosed || (poll.expiresAt && new Date(poll.expiresAt) < new Date())) {
      throw new BadRequestException('Cuộc bình chọn đã kết thúc.');
    }
    const updated = await this.socialRepository.votePollOption(pollId, optionId, user.id);
    return updated;
  }

  async addPollOption(communityId: string, pollId: string, optionText: string, user: SocialUser) {
    const community = await this.ensureCommunity(communityId);
    await this.requireJoined(communityId, user.id);
    const poll = await this.socialRepository.getPollDetails(pollId);
    if (!poll || poll.communityId !== communityId) {
      throw new NotFoundException('Không tìm thấy cuộc bình chọn.');
    }
    if (!poll.allowAddOptions) {
      throw new ForbiddenException('Bình chọn này không cho phép người khác thêm đáp án.');
    }
    if (poll.isClosed || (poll.expiresAt && new Date(poll.expiresAt) < new Date())) {
      throw new BadRequestException('Cuộc bình chọn đã kết thúc.');
    }
    await this.requireTextAllowed(optionText, user, community.name);
    const updated = await this.socialRepository.addPollOption(pollId, user.id, optionText);
    return updated;
  }

  async closePoll(communityId: string, pollId: string, user: SocialUser) {
    await this.ensureCommunity(communityId);
    const member = await this.requireJoined(communityId, user.id);
    const poll = await this.socialRepository.getPollDetails(pollId);
    if (!poll || poll.communityId !== communityId) {
      throw new NotFoundException('Không tìm thấy cuộc bình chọn.');
    }
    const canManage = poll.creatorId === user.id || member.role === 'OWNER' || member.role === 'MODERATOR' || user.roles?.includes('ADMIN');
    if (!canManage) {
      throw new ForbiddenException('Chỉ người tạo hoặc ban quản trị mới được kết thúc bình chọn sớm.');
    }
    const updated = await this.socialRepository.closePoll(pollId);
    return updated;
  }

  private async moderateText(
    content: string,
    user: SocialUser,
    communityName: string,
    mediaUrls: string[] = [],
  ): Promise<{ flagged: boolean; reason?: string }> {
    const whiteboxResult = this.whiteboxService.checkContent(content);
    if (whiteboxResult.rejected) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'CONTENT_MODERATION_REJECTED',
        ruleCode: whiteboxResult.ruleCode,
        message: whiteboxResult.reasonVi || 'Nội dung vi phạm tiêu chuẩn cộng đồng.',
      });
    }
    if (!whiteboxResult.flagged && mediaUrls.length === 0) return { flagged: false };

    const normalizedContent = typeof (this.whiteboxService as CommunityWhiteboxService & {
      getNormalizedText?: (value?: string | null) => string;
    }).getNormalizedText === 'function'
      ? this.whiteboxService.getNormalizedText(content)
      : content;
    // Gửi bản đã chuẩn hóa một lần để tránh nhân đôi token bởi cả bản gốc và
    // bản chống né luật. Whitebox đã giữ lại nội dung có ý nghĩa cần xét.
    const aiContent = normalizedContent;
    const aiResult = await this.blackboxAiService.evaluatePost(
      aiContent,
      {
        authorName: user.fullName || 'Thành viên',
        communityName,
      },
      mediaUrls,
    );
    if (aiResult.isFallback) {
      return {
        flagged: true,
        reason: 'Không thể hoàn tất kiểm tra tự động; nội dung đang chờ duyệt.',
      };
    }
    if (!aiResult.isSafe && aiResult.riskScore >= 0.7) {
      return {
        flagged: true,
        reason: aiResult.reasonVi || 'Nội dung có nguy cơ vi phạm tiêu chuẩn cộng đồng.',
      };
    }
    return { flagged: false };
  }

  private async requireTextAllowed(content: string, user: SocialUser, communityName: string) {
    const decision = await this.moderateText(content, user, communityName);
    if (decision.flagged) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'CONTENT_MODERATION_REVIEW_REQUIRED',
        message: decision.reason || 'Nội dung cần được kiểm duyệt trước khi đăng.',
      });
    }
  }

  private async ensureCommunity(communityId: string) {
    const community = await this.communitiesRepository.findById(communityId);
    if (!community) throw new NotFoundException('Không tìm thấy cộng đồng.');
    return community;
  }

  private async sendMentionNotifications(params: {
    communityId: string;
    communityName: string;
    mentionIds: string[];
    senderId: string;
    senderName: string;
    postId: string;
  }) {
    const preferences = await this.socialRepository.getMentionNotificationPreferences(
      params.communityId,
      [...new Set(params.mentionIds)],
    );
    await Promise.all(
      preferences
        .filter((preference) =>
          preference.userId !== params.senderId &&
          preference.notificationPreference !== 'MUTED' &&
          preference.socialMuted !== true &&
          preference.socialNotificationsEnabled !== false,
        )
        .map((preference) =>
          this.notificationsService.sendNotification(
            buildCommunityPostMentionedNotification({
              communityId: params.communityId,
              communityName: params.communityName,
              senderName: params.senderName,
              receiverId: preference.userId,
              senderId: params.senderId,
              postId: params.postId,
            }),
          ),
        ),
    );
  }

  private async sendNewPostNotifications(params: {
    communityId: string;
    communityName: string;
    senderId: string;
    senderName: string;
    postId: string;
    excludeUserIds?: string[];
  }) {
    // Giữ tương thích với các adapter/test double cũ; repository thật luôn có method này.
    if (typeof this.socialRepository.getAllNotificationPreferences !== 'function') return;
    const preferences = await this.socialRepository.getAllNotificationPreferences(
      params.communityId,
      params.senderId,
    );
    const excluded = new Set(params.excludeUserIds ?? []);
    await Promise.all(
      preferences
        .filter((preference) =>
          !excluded.has(preference.userId) &&
          preference.notificationPreference === 'ALL' &&
          preference.socialMuted !== true &&
          preference.socialNotificationsEnabled !== false,
        )
        .map((preference) =>
          this.notificationsService.sendNotification(
            buildCommunityPostNewNotification({
              communityId: params.communityId,
              communityName: params.communityName,
              senderName: params.senderName,
              receiverId: preference.userId,
              senderId: params.senderId,
              postId: params.postId,
            }),
          ),
        ),
    );
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
    if (!['OWNER', 'ADMIN', 'MODERATOR'].includes(member.role)) {
      throw new ForbiddenException('Bạn không có quyền quản trị không gian này.');
    }
    return member;
  }
}
