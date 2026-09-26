import { BadRequestException } from '@nestjs/common';
import { CommunitySocialRepository } from '../../communities/community-social.repository';
import { NotificationsService } from '../../notifications/notifications.service';
import { RedisService } from '../../../providers/redis/redis.service';
import { TournamentsRepository } from '../tournaments.repository';
import { UpdateTournamentDto } from '../dto/update-tournament.dto';
import { TournamentAccessService } from './tournament-access.service';
import { TournamentFeePolicyService } from './tournament-fee-policy.service';
import { TournamentLifecycleService } from './tournament-lifecycle.service';
import { TournamentMediaService } from './tournament-media.service';

describe('TournamentLifecycleService registration-mode changes', () => {
  it('rejects changing approval mode while active participants exist', async () => {
    const findById = jest.fn().mockResolvedValue({
      id: 'tournament-1',
      status: 'REGISTRATION_OPEN',
      isRegistrationLocked: false,
      categoryId: 'category-1',
      tournamentConfig: { registrationMode: 'OPEN' },
    });
    const countActiveParticipants = jest.fn().mockResolvedValue(1);
    const findCategory = jest.fn().mockResolvedValue({
      id: 'category-1',
      slug: 'badminton',
      categoryConfig: null,
    });
    // This test exercises only the read boundary before any repository write.
    const repository = {
      findById,
      findCategory,
      countActiveParticipants,
    } as unknown as TournamentsRepository;
    const access = {
      isManager: jest.fn().mockResolvedValue(true),
    } as unknown as TournamentAccessService;
    const lifecycle = new TournamentLifecycleService(
      repository,
      access,
      null as unknown as NotificationsService,
      null as unknown as CommunitySocialRepository,
      null as unknown as RedisService,
      null as unknown as TournamentMediaService,
      null as unknown as TournamentFeePolicyService,
    );
    const update = {
      tournamentConfig: { registrationMode: 'APPROVAL' },
    } satisfies UpdateTournamentDto;

    await expect(
      lifecycle.update('tournament-1', 'organizer-1', update),
    ).rejects.toThrow(BadRequestException);
    expect(countActiveParticipants).toHaveBeenCalledWith('tournament-1');
  });
});
