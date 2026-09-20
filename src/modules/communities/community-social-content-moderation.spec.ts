import { BadRequestException } from '@nestjs/common';
import { CommunitySocialService } from './community-social.service';
import type { CommunitySocialRepository } from './community-social.repository';
import type { CommunitiesRepository } from './communities.repository';
import type { NotificationsService } from '../notifications/notifications.service';
import type { CommunityWhiteboxService } from './moderation/community-whitebox.service';
import type { CommunityBlackboxAiService } from './moderation/community-blackbox-ai.service';

const COMMUNITY_ID = '11111111-1111-4111-8111-111111111111';
const AUTHOR_ID = '22222222-2222-4222-8222-222222222222';
const POST_ID = '33333333-3333-4333-8333-333333333333';
const COMMENT_ID = '44444444-4444-4444-8444-444444444444';
const POLL_ID = '55555555-5555-4555-8555-555555555555';

describe('CommunitySocialService content moderation coverage', () => {
  let service: CommunitySocialService;
  let socialRepository: Record<string, jest.Mock>;
  let communitiesRepository: Record<string, jest.Mock>;
  let notificationsService: { sendNotification: jest.Mock };
  let whiteboxService: { checkContent: jest.Mock };
  let blackboxAiService: { evaluatePost: jest.Mock };

  beforeEach(() => {
    socialRepository = {
      getSettings: jest.fn().mockResolvedValue({
        memberTaggingPolicy: 'MEMBERS',
        postingPolicy: 'MEMBERS',
        postApprovalRequired: false,
        commentsEnabled: true,
      }),
      findLinkedActivity: jest.fn().mockResolvedValue({
        kind: 'SESSION',
        resource: { status: 'OPEN', name: 'Giao lưu cuối tuần' },
      }),
      createLinkedActivityPost: jest.fn().mockResolvedValue({
        reused: false,
        post: { id: POST_ID, status: 'PUBLISHED' },
      }),
      findPost: jest.fn().mockResolvedValue({
        id: POST_ID,
        communityId: COMMUNITY_ID,
        status: 'PUBLISHED',
        authorId: AUTHOR_ID,
      }),
      findComment: jest.fn().mockResolvedValue({
        id: COMMENT_ID,
        postId: POST_ID,
        authorId: AUTHOR_ID,
      }),
      createComment: jest.fn().mockResolvedValue({ id: COMMENT_ID, status: 'PUBLISHED' }),
      updateComment: jest.fn().mockResolvedValue({ id: COMMENT_ID, status: 'PUBLISHED' }),
      getPollDetails: jest.fn().mockResolvedValue({
        id: POLL_ID,
        communityId: COMMUNITY_ID,
        creatorId: AUTHOR_ID,
        isClosed: false,
        allowAddOptions: true,
      }),
      addPollOption: jest.fn().mockResolvedValue({ id: 'option-id' }),
    };
    communitiesRepository = {
      findById: jest.fn().mockResolvedValue({ id: COMMUNITY_ID, name: 'CLB SportO', visibility: 'PUBLIC' }),
      findMember: jest.fn().mockResolvedValue({ status: 'JOINED', role: 'MEMBER' }),
    };
    notificationsService = { sendNotification: jest.fn().mockResolvedValue(undefined) };
    whiteboxService = {
      checkContent: jest.fn().mockReturnValue({ passed: true, flagged: false, rejected: false, severity: 'CLEAN' }),
    };
    blackboxAiService = {
      evaluatePost: jest.fn().mockResolvedValue({ isSafe: true, riskScore: 0, flaggedCategory: 'NONE', isFallback: false }),
    };
    service = new CommunitySocialService(
      socialRepository as unknown as CommunitySocialRepository,
      communitiesRepository as unknown as CommunitiesRepository,
      notificationsService as unknown as NotificationsService,
      whiteboxService as unknown as CommunityWhiteboxService,
      blackboxAiService as unknown as CommunityBlackboxAiService,
    );
  });

  const rejectWhitebox = () => {
    whiteboxService.checkContent.mockReturnValue({
      passed: false,
      flagged: true,
      rejected: true,
      severity: 'CRITICAL',
      ruleCode: 'WHITEBOX_LINK_FORBIDDEN',
      reasonVi: 'Bài viết không được chứa đường dẫn hoặc liên kết mời.',
    });
  };

  it.each([
    ['activity share', () => service.shareActivity(COMMUNITY_ID, { id: AUTHOR_ID }, { body: 'example.com', clubMatchSessionId: POST_ID })],
    ['comment create', () => service.createComment(COMMUNITY_ID, POST_ID, { id: AUTHOR_ID }, { body: 'example.com' })],
    ['comment update', () => service.updateComment(COMMUNITY_ID, COMMENT_ID, { id: AUTHOR_ID }, { body: 'example.com' })],
    ['poll option', () => service.addPollOption(COMMUNITY_ID, POLL_ID, 'example.com', { id: AUTHOR_ID })],
  ])('blocks a deterministic link on %s before persistence', async (_surface, action) => {
    rejectWhitebox();

    await expect(action()).rejects.toBeInstanceOf(BadRequestException);

    expect(blackboxAiService.evaluatePost).not.toHaveBeenCalled();
    expect(socialRepository.createLinkedActivityPost).not.toHaveBeenCalled();
    expect(socialRepository.createComment).not.toHaveBeenCalled();
    expect(socialRepository.updateComment).not.toHaveBeenCalled();
    expect(socialRepository.addPollOption).not.toHaveBeenCalled();
  });

  it('sends ambiguous comment content to AI and fails closed on fallback', async () => {
    whiteboxService.checkContent.mockReturnValue({
      passed: true,
      flagged: true,
      rejected: false,
      severity: 'NEEDS_REVIEW',
      ruleCode: 'WHITEBOX_SUSPICIOUS_CONTACT_OR_LINK',
    });
    blackboxAiService.evaluatePost.mockResolvedValueOnce({
      isSafe: true,
      riskScore: 0,
      flaggedCategory: 'NONE',
      isFallback: true,
    });

    await expect(
      service.createComment(COMMUNITY_ID, POST_ID, { id: AUTHOR_ID }, { body: 'inbox mình nhé' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(blackboxAiService.evaluatePost).toHaveBeenCalledTimes(1);
    expect(socialRepository.createComment).not.toHaveBeenCalled();
  });
});
