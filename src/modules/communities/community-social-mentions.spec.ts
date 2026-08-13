import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { validate } from 'class-validator';
import { CommunitySocialService } from './community-social.service';
import { CommunitySocialRepository } from './community-social.repository';
import { CommunitiesRepository } from './communities.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateCommunityPostDto } from './dto/create-community-post.dto';

const COMMUNITY_ID = '11111111-1111-4111-8111-111111111111';
const AUTHOR_ID = '22222222-2222-4222-8222-222222222222';
const MENTION_ID = '33333333-3333-4333-8333-333333333333';

describe('Community @mention contract', () => {
  it.each([
    ['non-UUID', 'not-a-user-id'],
    ['wrong UUID version', '33333333-3333-5333-8333-333333333333'],
  ])('rejects %s mention IDs', async (_label, mention) => {
    const dto = Object.assign(new CreateCommunityPostDto(), {
      mentions: [mention],
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('rejects duplicate or over-limit mention IDs', async () => {
    const duplicateDto = Object.assign(new CreateCommunityPostDto(), {
      mentions: [MENTION_ID, MENTION_ID],
    });
    const overLimitDto = Object.assign(new CreateCommunityPostDto(), {
      mentions: Array.from(
        { length: 21 },
        (_, index) =>
          `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`,
      ),
    });

    expect(await validate(duplicateDto)).not.toHaveLength(0);
    expect(await validate(overLimitDto)).not.toHaveLength(0);
  });
});

describe('CommunitySocialService @mention policy', () => {
  let service: CommunitySocialService;
  let socialRepository: {
    getSettings: jest.Mock;
    getJoinedMentionIds: jest.Mock;
    createPost: jest.Mock;
  };
  let communitiesRepository: {
    findById: jest.Mock;
    findMember: jest.Mock;
  };
  let notificationsService: { sendNotification: jest.Mock };

  beforeEach(() => {
    socialRepository = {
      getSettings: jest.fn().mockResolvedValue({
        memberTaggingPolicy: 'MEMBERS',
        postingPolicy: 'MEMBERS',
        postApprovalRequired: false,
      }),
      getJoinedMentionIds: jest.fn().mockResolvedValue([MENTION_ID]),
      createPost: jest.fn().mockResolvedValue({ id: 'post-id' }),
    };
    communitiesRepository = {
      findById: jest.fn().mockResolvedValue({ id: COMMUNITY_ID }),
      findMember: jest
        .fn()
        .mockResolvedValue({ status: 'JOINED', role: 'MEMBER' }),
    };
    notificationsService = {
      sendNotification: jest.fn().mockResolvedValue(undefined),
    };
    service = new CommunitySocialService(
      socialRepository as unknown as CommunitySocialRepository,
      communitiesRepository as unknown as CommunitiesRepository,
      notificationsService as unknown as NotificationsService,
    );
  });

  const create = () =>
    service.createPost(
      COMMUNITY_ID,
      { id: AUTHOR_ID },
      { body: 'Nhắc thành viên', mentions: [MENTION_ID] },
    );

  it('rejects mentions when tagging is disabled', async () => {
    socialRepository.getSettings.mockResolvedValueOnce({
      memberTaggingPolicy: 'OFF',
      postingPolicy: 'MEMBERS',
      postApprovalRequired: false,
    });

    await expect(create()).rejects.toBeInstanceOf(ForbiddenException);
    expect(socialRepository.getJoinedMentionIds).not.toHaveBeenCalled();
  });

  it('rejects a member when only managers can mention', async () => {
    socialRepository.getSettings.mockResolvedValueOnce({
      memberTaggingPolicy: 'ADMINS',
      postingPolicy: 'MEMBERS',
      postApprovalRequired: false,
    });

    await expect(create()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a target that is not a JOINED member', async () => {
    socialRepository.getJoinedMentionIds.mockResolvedValueOnce([]);

    await expect(create()).rejects.toBeInstanceOf(BadRequestException);
    expect(socialRepository.createPost).not.toHaveBeenCalled();
  });

  it('notifies each valid non-author mention once', async () => {
    await create();

    expect(socialRepository.createPost).toHaveBeenCalledWith(
      COMMUNITY_ID,
      AUTHOR_ID,
      expect.objectContaining({ mentions: [MENTION_ID] }),
      'PUBLISHED',
      undefined,
    );
    expect(notificationsService.sendNotification).toHaveBeenCalledTimes(1);
  });
});
