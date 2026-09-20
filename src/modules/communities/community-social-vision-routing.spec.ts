import { CommunitySocialService } from './community-social.service';
import type { CommunitySocialRepository } from './community-social.repository';
import type { CommunitiesRepository } from './communities.repository';
import type { NotificationsService } from '../notifications/notifications.service';
import type { CommunityWhiteboxService } from './moderation/community-whitebox.service';
import type { CommunityBlackboxAiService } from './moderation/community-blackbox-ai.service';
import type { CommunityImageModerationService } from './moderation/community-image-moderation.service';

const COMMUNITY_ID = '11111111-1111-4111-8111-111111111111';
const AUTHOR_ID = '22222222-2222-4222-8222-222222222222';
const IMAGE_URL = 'https://res.cloudinary.com/example/image/upload/post.jpg';

describe('CommunitySocialService AI Vision routing', () => {
  it('sends scanned image URLs to AI Vision even when OCR is clean', async () => {
    const socialRepository = {
      getSettings: jest.fn().mockResolvedValue({
        memberTaggingPolicy: 'MEMBERS',
        postingPolicy: 'MEMBERS',
        postApprovalRequired: false,
      }),
      getJoinedMentionIds: jest.fn().mockResolvedValue([]),
      createPost: jest.fn().mockResolvedValue({ id: 'post-id', status: 'PUBLISHED' }),
      getMentionNotificationPreferences: jest.fn().mockResolvedValue([]),
    };
    const communitiesRepository = {
      findById: jest.fn().mockResolvedValue({ id: COMMUNITY_ID, name: 'CLB SportO', visibility: 'PUBLIC' }),
      findMember: jest.fn().mockResolvedValue({ status: 'JOINED', role: 'MEMBER' }),
    };
    const notificationsService = { sendNotification: jest.fn().mockResolvedValue(undefined) };
    const whiteboxService = {
      checkContent: jest.fn().mockReturnValue({ passed: true, flagged: false, rejected: false, severity: 'CLEAN' }),
      getNormalizedText: jest.fn((content: string) => content),
    };
    const blackboxAiService = {
      evaluatePost: jest.fn().mockResolvedValue({ isSafe: true, riskScore: 0, flaggedCategory: 'NONE', isFallback: false }),
    };
    const imageModerationService = {
      scanMediaUrls: jest.fn().mockResolvedValue({
        status: 'CLEAN',
        extractedText: '',
        qrPayloads: [],
        scannedUrls: [IMAGE_URL],
        unscannedUrls: [],
      }),
    };
    const service = new CommunitySocialService(
      socialRepository as unknown as CommunitySocialRepository,
      communitiesRepository as unknown as CommunitiesRepository,
      notificationsService as unknown as NotificationsService,
      whiteboxService as unknown as CommunityWhiteboxService,
      blackboxAiService as unknown as CommunityBlackboxAiService,
      imageModerationService as unknown as CommunityImageModerationService,
    );

    await service.createPost(COMMUNITY_ID, { id: AUTHOR_ID }, {
      body: 'Ảnh buổi giao lưu cuối tuần',
      mediaUrls: [IMAGE_URL],
    });

    expect(blackboxAiService.evaluatePost).toHaveBeenCalledWith(
      'Ảnh buổi giao lưu cuối tuần',
      { authorName: 'Thành viên', communityName: 'CLB SportO' },
      [IMAGE_URL],
    );
    expect(socialRepository.createPost).toHaveBeenCalledWith(
      COMMUNITY_ID,
      AUTHOR_ID,
      expect.objectContaining({ mediaUrls: [IMAGE_URL] }),
      'PUBLISHED',
      undefined,
    );
  });
});
