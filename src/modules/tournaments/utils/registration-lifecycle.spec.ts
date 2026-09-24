import { BadRequestException } from '@nestjs/common';
import { TournamentsService } from '../tournaments.service';
import { TournamentAccessService } from '../services/tournament-access.service';
import type { TournamentsRepository } from '../tournaments.repository';
import { TournamentVenueService } from '../services/tournament-venue.service';
import type { VenuesService } from '../../venues/venues.service';
import { TournamentMediaService } from '../services/tournament-media.service';
import type { StorageService } from '../../../providers/storage/storage.service';
import { TournamentDiscoveryService } from '../services/tournament-discovery.service';
import type { RedisService } from '../../../providers/redis/redis.service';
import { TournamentLifecycleService } from '../services/tournament-lifecycle.service';
import { TournamentFeePolicyService } from '../services/tournament-fee-policy.service';
import { TournamentStaffService } from '../services/tournament-staff.service';
import { TournamentRefereeService } from '../services/tournament-referee.service';
import { TournamentFollowService } from '../services/tournament-follow.service';
import { TournamentResultsService } from '../services/tournament-results.service';
import { TournamentDivisionService } from '../services/tournament-division.service';
import { TournamentParticipantAdminService } from '../services/tournament-participant-admin.service';
import { TournamentImportService } from '../services/tournament-import.service';
import { TournamentBracketService } from '../services/tournament-bracket.service';
import type { BracketGeneratorService } from '../bracket-generator.service';
import type { NotificationsService } from '../../notifications/notifications.service';
import type { CommunitySocialRepository } from '../../communities/community-social.repository';
import { TournamentRealtimeService } from '../services/tournament-realtime.service';
import { TournamentRegistrationService } from '../services/tournament-registration.service';
import { TournamentLiteService } from '../services/tournament-lite.service';
import type { ConfigService } from '@nestjs/config';
import { TournamentFootballRosterService } from '../services/tournament-football-roster.service';
import {
  canOpenRegistrationImmediately,
  isRegistrationDeadlineExpired,
  isRegistrationOpenStatus,
} from './registration-lifecycle';

describe('registration lifecycle policy', () => {
  it('accepts submissions only when the lifecycle status is open', () => {
    expect(isRegistrationOpenStatus('REGISTRATION_OPEN')).toBe(true);
    expect(isRegistrationOpenStatus('UPCOMING')).toBe(false);
    expect(isRegistrationOpenStatus('REGISTRATION_CLOSED')).toBe(false);
  });

  it('allows the explicit open-now action only from scheduled or closed states', () => {
    expect(canOpenRegistrationImmediately('UPCOMING')).toBe(true);
    expect(canOpenRegistrationImmediately('REGISTRATION_CLOSED')).toBe(true);
    expect(canOpenRegistrationImmediately('REGISTRATION_OPEN')).toBe(false);
    expect(canOpenRegistrationImmediately('IN_PROGRESS')).toBe(false);
  });

  it('treats the deadline as expired at the exact boundary', () => {
    const now = new Date('2026-09-14T10:00:00.000Z');
    expect(isRegistrationDeadlineExpired('2026-09-14T09:59:59.000Z', now)).toBe(
      true,
    );
    expect(isRegistrationDeadlineExpired('2026-09-14T10:00:00.000Z', now)).toBe(
      true,
    );
    expect(isRegistrationDeadlineExpired('2026-09-14T10:00:01.000Z', now)).toBe(
      false,
    );
  });
});

describe('TournamentRegistrationService registration access', () => {
  const service = Object.create(
    TournamentRegistrationService.prototype,
  ) as TournamentRegistrationService;

  it('rejects UPCOMING even when its scheduled date has arrived', () => {
    expect(() =>
      service.assertRegistrationAccessible({
        status: 'UPCOMING',
        registrationStartDate: new Date('2026-09-14T09:00:00.000Z'),
        registrationEndDate: new Date('2026-09-14T11:00:00.000Z'),
      }),
    ).toThrow(BadRequestException);
  });

  it('does not let a stale future opening date block REGISTRATION_OPEN', () => {
    expect(() =>
      service.assertRegistrationAccessible({
        status: 'REGISTRATION_OPEN',
        registrationStartDate: new Date(Date.now() + 60 * 60 * 1000),
        registrationEndDate: new Date(Date.now() + 2 * 60 * 60 * 1000),
        isRegistrationLocked: false,
      }),
    ).not.toThrow();
  });
});

describe('TournamentsService registration lifecycle', () => {
  it('persists the server time when opening a scheduled tournament immediately', async () => {
    const now = Date.now();
    const repository = {
      findById: jest.fn().mockResolvedValue({
        id: 'tournament-1',
        status: 'UPCOMING',
        startDate: new Date(now + 24 * 60 * 60 * 1000),
        registrationEndDate: new Date(now + 2 * 60 * 60 * 1000),
      }),
      findBracket: jest.fn().mockResolvedValue(null),
      reopenRegistration: jest.fn().mockResolvedValue({
        id: 'tournament-1',
        status: 'REGISTRATION_OPEN',
      }),
    };
    const accessService = new TournamentAccessService(
      repository as unknown as TournamentsRepository,
    );
    const realtimeService = new TournamentRealtimeService();
    const service = new TournamentsService(
      repository as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      accessService,
      new TournamentVenueService(
        repository as unknown as TournamentsRepository,
        null as unknown as VenuesService,
        new TournamentAccessService(
          repository as unknown as TournamentsRepository,
        ),
      ),
      new TournamentMediaService(
        repository as unknown as TournamentsRepository,
        null as unknown as StorageService,
        new TournamentAccessService(
          repository as unknown as TournamentsRepository,
        ),
      ),
      new TournamentDiscoveryService(
        repository as unknown as TournamentsRepository,
        null as unknown as RedisService,
        new TournamentAccessService(
          repository as unknown as TournamentsRepository,
        ),
      ),
      null as unknown as TournamentLifecycleService,
      new TournamentFeePolicyService(
        repository as unknown as TournamentsRepository,
      ),
      new TournamentStaffService(
        repository as unknown as TournamentsRepository,
        new TournamentAccessService(
          repository as unknown as TournamentsRepository,
        ),
        null as unknown as NotificationsService,
      ),
      new TournamentRefereeService(
        repository as unknown as TournamentsRepository,
        new TournamentAccessService(
          repository as unknown as TournamentsRepository,
        ),
        null as unknown as NotificationsService,
      ),
      new TournamentFollowService(
        repository as unknown as TournamentsRepository,
      ),
      new TournamentResultsService(
        repository as unknown as TournamentsRepository,
      ),
      new TournamentDivisionService(
        repository as unknown as TournamentsRepository,
        new TournamentAccessService(
          repository as unknown as TournamentsRepository,
        ),
        new TournamentFeePolicyService(
          repository as unknown as TournamentsRepository,
        ),
      ),
      new TournamentParticipantAdminService(
        repository as unknown as TournamentsRepository,
        new TournamentAccessService(
          repository as unknown as TournamentsRepository,
        ),
        null as unknown as NotificationsService,
      ),
      new TournamentImportService(
        repository as unknown as TournamentsRepository,
        new TournamentAccessService(
          repository as unknown as TournamentsRepository,
        ),
        null as unknown as NotificationsService,
      ),
      new TournamentBracketService(
        repository as unknown as TournamentsRepository,
        null as unknown as BracketGeneratorService,
        new TournamentAccessService(
          repository as unknown as TournamentsRepository,
        ),
        null as unknown as RedisService,
        null as unknown as CommunitySocialRepository,
      ),
      realtimeService,
      new TournamentRegistrationService(
        repository as unknown as TournamentsRepository,
        accessService,
        null as unknown as NotificationsService,
        realtimeService,
      ),
      new TournamentLiteService(
        repository as unknown as TournamentsRepository,
        accessService,
        null as unknown as TournamentLifecycleService,
        null as unknown as TournamentBracketService,
        null as unknown as RedisService,
        null as unknown as CommunitySocialRepository,
        null as unknown as ConfigService,
      ),
      new TournamentFootballRosterService(
        repository as unknown as TournamentsRepository,
        accessService,
        null as unknown as NotificationsService,
        realtimeService,
      ),
    );
    jest.spyOn(accessService, 'isManager').mockResolvedValue(true);

    await service.reopenRegistration('tournament-1', 'organizer-1');

    expect(repository.reopenRegistration).toHaveBeenCalledWith(
      'tournament-1',
      expect.any(Date),
    );
  });
});
