import { ConflictException } from '@nestjs/common';
import { SocialPickupsService } from './social-pickups.service';
import type { SocialPickupsRepository } from './social-pickups.repository';

const projection = {
  pickup: {
    id: 'pickup-1',
    hostUserId: 'user-1',
    title: 'Tìm người chơi buổi tối',
    description: 'Giao lưu vui vẻ',
    playDate: '2099-01-01',
    startTime: '19:30',
    endTime: '21:30',
    courtLocation: 'D-Sport Quận 7',
    levelRequirement: 'Mọi trình độ',
    feePerSlot: 50000,
    maxSlots: 4,
    currentSlots: 1,
    status: 'OPEN',
  },
  host: { id: 'user-1', name: 'Người tạo', avatarUrl: null },
  category: { id: 'category-1', name: 'Pickleball', slug: 'pickleball' },
  participantCount: 1,
  participants: [{ userId: 'user-1', name: 'Người tạo', avatarUrl: null }],
  isJoined: true,
};

describe('SocialPickupsService', () => {
  let repository: jest.Mocked<Pick<SocialPickupsRepository, 'findCategory' | 'findByCreationKey' | 'findVenueCourt' | 'createPickup' | 'getProjection' | 'joinPickup'>>;
  let service: SocialPickupsService;

  beforeEach(() => {
    repository = {
      findCategory: jest.fn(),
      findByCreationKey: jest.fn(),
      findVenueCourt: jest.fn(),
      createPickup: jest.fn(),
      getProjection: jest.fn(),
      joinPickup: jest.fn(),
    };
    service = new SocialPickupsService(repository as unknown as SocialPickupsRepository);
  });

  it('creates a standalone pickup and returns the public projection', async () => {
    repository.findCategory.mockResolvedValue({ id: 'category-1', name: 'Pickleball', slug: 'pickleball' });
    repository.createPickup.mockResolvedValue({ id: 'pickup-1' } as never);
    repository.getProjection.mockResolvedValue(projection as never);

    const result = await service.create(
      { id: 'user-1' },
      {
        categoryId: 'category-1',
        title: 'Tìm người chơi buổi tối',
        playDate: '2099-01-01',
        startTime: '19:30',
        endTime: '21:30',
        location: 'D-Sport Quận 7',
        maxSlots: 4,
      },
    );

    expect(repository.createPickup).toHaveBeenCalledWith(expect.objectContaining({
      hostUserId: 'user-1',
      categoryId: 'category-1',
    }));
    expect(repository.createPickup.mock.calls[0][0]).not.toHaveProperty('communityId');
    expect(result.data).toMatchObject({ id: 'pickup-1', type: 'PERSONAL_PICKUP', currentSlots: 1 });
  });

  it('rejects a court that does not belong to the selected venue', async () => {
    repository.findCategory.mockResolvedValue({ id: 'category-1', name: 'Pickleball', slug: 'pickleball' });
    repository.findVenueCourt.mockResolvedValue(null);

    await expect(service.create(
      { id: 'user-1' },
      {
        categoryId: 'category-1',
        title: 'Tìm người chơi buổi tối',
        playDate: '2099-01-01',
        startTime: '19:30',
        endTime: '21:30',
        location: 'D-Sport Quận 7 · Sân 3',
        venueId: 'venue-1',
        courtId: 'court-1',
        maxSlots: 4,
      },
    )).rejects.toMatchObject({ response: { code: 'INVALID_PICKUP_VENUE_OR_COURT' } });
    expect(repository.createPickup).not.toHaveBeenCalled();
  });

  it('allows a venue without selecting a court', async () => {
    repository.findCategory.mockResolvedValue({ id: 'category-1', name: 'Pickleball', slug: 'pickleball' });
    repository.findVenueCourt.mockResolvedValue({
      venueId: 'venue-1',
      venueName: 'D-Sport',
      venueAddress: 'Quận 7',
      courtId: null,
      courtName: null,
    });
    repository.createPickup.mockResolvedValue({ id: 'pickup-1' } as never);
    repository.getProjection.mockResolvedValue(projection as never);

    await service.create(
      { id: 'user-1' },
      {
        categoryId: 'category-1',
        title: 'Tìm người chơi buổi tối',
        playDate: '2099-01-01',
        startTime: '19:30',
        endTime: '21:30',
        location: 'Địa điểm nhập tay',
        venueId: 'venue-1',
        maxSlots: 4,
      },
    );

    expect(repository.createPickup).toHaveBeenCalledWith(expect.objectContaining({
      venueId: 'venue-1',
      courtId: null,
    }));
  });

  it('maps a full pickup to a stable conflict instead of overbooking', async () => {
    repository.joinPickup.mockResolvedValue({ kind: 'FULL' } as never);

    await expect(service.join('pickup-1', { id: 'user-2' })).rejects.toBeInstanceOf(ConflictException);
  });
});
