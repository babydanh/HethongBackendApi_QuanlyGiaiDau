import { CommunitiesService } from './communities.service';
import { CommunitiesRepository } from './communities.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../../providers/storage/storage.service';

const COMMUNITY_ID = '11111111-1111-4111-8111-111111111111';

describe('CommunitiesService mentionable member search', () => {
  it('forces JOINED and bounds the result to 20', async () => {
    const communitiesRepository = {
      findById: jest.fn().mockResolvedValue({ id: COMMUNITY_ID }),
      getMembers: jest.fn().mockResolvedValue({ data: [], meta: {} }),
      getCommunityMemberStreaks: jest.fn().mockResolvedValue([]),
    };
    const service = new CommunitiesService(
      communitiesRepository as unknown as CommunitiesRepository,
      {} as NotificationsService,
      {} as StorageService,
    );

    await service.getMembers(COMMUNITY_ID, {
      mentionable: true,
      status: 'PENDING',
      limit: 200,
      search: 'Nguyen Van A',
    });

    expect(communitiesRepository.getMembers).toHaveBeenCalledWith(
      COMMUNITY_ID,
      expect.objectContaining({
        mentionable: true,
        status: 'JOINED',
        limit: 20,
        search: 'Nguyen Van A',
      }),
    );
  });

  it('trims and de-duplicates member tags without changing their display case', async () => {
    const communitiesRepository = {
      updateMemberTags: jest.fn().mockResolvedValue({ id: 'member-id' }),
      findMember: jest
        .fn()
        .mockResolvedValue({ status: 'JOINED', role: 'MEMBER' }),
    };
    const service = new CommunitiesService(
      communitiesRepository as unknown as CommunitiesRepository,
      {} as NotificationsService,
      {} as StorageService,
    );

    await service.updateMemberTags(
      '22222222-2222-4222-8222-222222222222',
      COMMUNITY_ID,
      '33333333-3333-4333-8333-333333333333',
      [' MVP tuần ', 'mvp tuần', 'Cây hài'],
      ['ADMIN'],
    );

    expect(communitiesRepository.updateMemberTags).toHaveBeenCalledWith(
      COMMUNITY_ID,
      '33333333-3333-4333-8333-333333333333',
      ['MVP tuần', 'Cây hài'],
      '22222222-2222-4222-8222-222222222222',
    );
  });
});
