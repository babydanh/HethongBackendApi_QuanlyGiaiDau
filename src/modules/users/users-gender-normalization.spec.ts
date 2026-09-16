import { BadRequestException } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { RankingsService } from '../rankings/rankings.service';
import { StorageService } from '../../providers/storage/storage.service';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';

const buildUser = (gender: string | null = null) => ({
  id: USER_ID,
  email: 'player@example.com',
  passwordHash: 'never-returned',
  isEmailVerified: false,
  profile: {
    gender,
    isGenderLocked: false,
    provinceCode: null,
  },
});

describe('UsersService profile gender normalization', () => {
  it('stores canonical gender codes when the client sends a localized alias', async () => {
    const repository = {
      findById: jest
        .fn()
        .mockResolvedValueOnce(buildUser())
        .mockResolvedValueOnce(buildUser('FEMALE')),
      updateProfile: jest.fn().mockResolvedValue(undefined),
    };
    const service = new UsersService(
      repository as unknown as UsersRepository,
      {} as StorageService,
      {} as RankingsService,
      {} as NotificationsService,
    );

    await service.updateProfile(USER_ID, { gender: 'Nữ' });

    expect(repository.updateProfile).toHaveBeenCalledWith(USER_ID, {
      gender: 'FEMALE',
    });
  });

  it('rejects unknown gender values before writing profile data', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(buildUser()),
      updateProfile: jest.fn(),
    };
    const service = new UsersService(
      repository as unknown as UsersRepository,
      {} as StorageService,
      {} as RankingsService,
      {} as NotificationsService,
    );

    await expect(
      service.updateProfile(USER_ID, { gender: 'UNKNOWN' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.updateProfile).not.toHaveBeenCalled();
  });
});
