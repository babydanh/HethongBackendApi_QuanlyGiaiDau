import { CommunitySocialService } from './community-social.service';
import type { CommunitySocialRepository } from './community-social.repository';
import type { CommunitiesRepository } from './communities.repository';
import type { NotificationsService } from '../notifications/notifications.service';
import type { CommunityWhiteboxService } from './moderation/community-whitebox.service';
import type { CommunityBlackboxAiService } from './moderation/community-blackbox-ai.service';
import type { CommunityImageModerationService } from './moderation/community-image-moderation.service';
import { buildCommunityPostFingerprint } from './community-content-fingerprint';

const COMMUNITY_ID = '11111111-1111-4111-8111-111111111111';
const AUTHOR_ID = '22222222-2222-4222-8222-222222222222';

describe('community duplicate post protection', () => {
  it('normalizes equivalent text/media before hashing and ignores mentions', () => {
    const first = buildCommunityPostFingerprint({
      body: '  Tìm người chơi\u200b cầu lông  ',
      mediaUrls: ['https://res.cloudinary.com/demo/image/upload/p.jpg?v=1#x'],
      topics: ['#Cầu Lông', 'giao lưu'],
      mentions: ['11111111-1111-4111-8111-111111111111'],
      poll: undefined,
    });
    const second = buildCommunityPostFingerprint({
      body: 'tìm người chơi cầu lông',
      mediaUrls: ['https://res.cloudinary.com/demo/image/upload/p.jpg?v=2'],
      topics: ['giao lưu', '#cầu lông'],
      mentions: [],
      poll: undefined,
    });

    expect(first).toBe(second);
  });

  it('rejects an exact recent duplicate before image scanning, AI, or persistence', async () => {
    const socialRepository = {
      getSettings: jest.fn().mockResolvedValue({
        memberTaggingPolicy: 'MEMBERS',
        postingPolicy: 'MEMBERS',
        postApprovalRequired: false,
      }),
      getJoinedMentionIds: jest.fn().mockResolvedValue([]),
      getMentionNotificationPreferences: jest.fn().mockResolvedValue([]),
      findRecentDuplicatePost: jest.fn().mockResolvedValue({
        id: 'previous-post',
        status: 'PUBLISHED',
        createdAt: new Date(),
      }),
      createPost: jest.fn(),
    };
    const communitiesRepository = {
      findById: jest.fn().mockResolvedValue({ id: COMMUNITY_ID, name: 'CLB SportO', visibility: 'PUBLIC' }),
      findMember: jest.fn().mockResolvedValue({ status: 'JOINED', role: 'MEMBER' }),
    };
    const notificationsService = { sendNotification: jest.fn() };
    const whiteboxService = { checkContent: jest.fn() };
    const blackboxAiService = { evaluatePost: jest.fn() };
    const imageModerationService = { scanMediaUrls: jest.fn() };
    const service = new CommunitySocialService(
      socialRepository as unknown as CommunitySocialRepository,
      communitiesRepository as unknown as CommunitiesRepository,
      notificationsService as unknown as NotificationsService,
      whiteboxService as unknown as CommunityWhiteboxService,
      blackboxAiService as unknown as CommunityBlackboxAiService,
      imageModerationService as unknown as CommunityImageModerationService,
    );

    await expect(service.createPost(COMMUNITY_ID, { id: AUTHOR_ID }, {
      body: 'Tìm người chơi cầu lông',
      mediaUrls: ['https://res.cloudinary.com/demo/image/upload/p.jpg'],
    })).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'DUPLICATE_POST_SPAM' }),
    });

    expect(socialRepository.findRecentDuplicatePost).toHaveBeenCalledWith(
      COMMUNITY_ID,
      AUTHOR_ID,
      expect.any(String),
      1440,
    );
    expect(imageModerationService.scanMediaUrls).not.toHaveBeenCalled();
    expect(blackboxAiService.evaluatePost).not.toHaveBeenCalled();
    expect(socialRepository.createPost).not.toHaveBeenCalled();
  });

  it('allows a retry with the same idempotency key but not a new key', async () => {
    const socialRepository = {
      getSettings: jest.fn().mockResolvedValue({
        memberTaggingPolicy: 'MEMBERS',
        postingPolicy: 'MEMBERS',
        postApprovalRequired: false,
      }),
      getJoinedMentionIds: jest.fn().mockResolvedValue([]),
      getMentionNotificationPreferences: jest.fn().mockResolvedValue([]),
      findRecentDuplicatePost: jest.fn().mockResolvedValue({
        id: 'previous-post',
        status: 'PUBLISHED',
        idempotencyKey: 'retry-key',
        createdAt: new Date(),
      }),
      createPost: jest.fn().mockResolvedValue({ id: 'same-post', status: 'PUBLISHED' }),
    };
    const communitiesRepository = {
      findById: jest.fn().mockResolvedValue({ id: COMMUNITY_ID, name: 'CLB SportO', visibility: 'PUBLIC' }),
      findMember: jest.fn().mockResolvedValue({ status: 'JOINED', role: 'MEMBER' }),
    };
    const service = new CommunitySocialService(
      socialRepository as unknown as CommunitySocialRepository,
      communitiesRepository as unknown as CommunitiesRepository,
      { sendNotification: jest.fn() } as unknown as NotificationsService,
      { checkContent: jest.fn().mockReturnValue({ flagged: false, rejected: false }) } as unknown as CommunityWhiteboxService,
      { evaluatePost: jest.fn() } as unknown as CommunityBlackboxAiService,
    );

    await expect(service.createPost(COMMUNITY_ID, { id: AUTHOR_ID }, { body: 'Nội dung cũ' }, 'retry-key'))
      .resolves.toMatchObject({ id: 'same-post' });
    expect(socialRepository.createPost).toHaveBeenCalled();
    expect(socialRepository.findRecentDuplicatePost).toHaveBeenCalledWith(
      COMMUNITY_ID,
      AUTHOR_ID,
      expect.any(String),
      1440,
    );

    await expect(service.createPost(COMMUNITY_ID, { id: AUTHOR_ID }, { body: 'Nội dung cũ' }, 'new-key'))
      .rejects.toMatchObject({
        response: expect.objectContaining({ error: 'DUPLICATE_POST_SPAM' }),
      });
    expect(socialRepository.createPost).toHaveBeenCalledTimes(1);
  });
});
