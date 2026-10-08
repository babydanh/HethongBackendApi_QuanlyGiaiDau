import { BadRequestException } from '@nestjs/common';
import { TournamentRegistrationService } from './tournament-registration.service';

const now = new Date('2026-10-07T12:00:00.000Z');
const tournament = {
  id: 'tournament-1',
  status: 'REGISTRATION_CLOSED',
  registrationEndDate: new Date('2026-10-08T12:00:00.000Z'),
  startDate: new Date('2026-10-09T12:00:00.000Z'),
  endDate: new Date('2026-10-12T12:00:00.000Z'),
  tournamentConfig: {},
};

function createHarness({
  hasStartedMatch = false,
  stages = [],
}: {
  hasStartedMatch?: boolean;
  stages?: unknown[];
} = {}) {
  const repository = {
    findById: jest.fn().mockResolvedValue({ ...tournament }),
    findBracket: jest.fn().mockResolvedValue({ stages }),
    hasStartedMatch: jest.fn().mockResolvedValue(hasStartedMatch),
    reopenRegistration: jest.fn().mockResolvedValue({ ...tournament }),
  };
  const access = { isManager: jest.fn().mockResolvedValue(true) };
  const service = new TournamentRegistrationService(
    repository as never,
    access as never,
    {} as never,
    {} as never,
  );

  return { service, repository };
}

describe('TournamentRegistrationService.reopenRegistration', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects when any match has started even if no active bracket stage exists', async () => {
    const { service, repository } = createHarness({ hasStartedMatch: true });

    await expect(
      service.reopenRegistration('tournament-1', 'organizer-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repository.reopenRegistration).not.toHaveBeenCalled();
  });

  it('shifts the tournament schedule when the selected deadline exceeds the start', async () => {
    const { service, repository } = createHarness();
    const deadline = new Date('2026-10-10T12:00:00.000Z');

    await service.reopenRegistration('tournament-1', 'organizer-1', [], {
      registrationEndDate: deadline,
      startDate: new Date('2026-10-09T12:00:00.000Z'),
    });

    expect(repository.reopenRegistration).toHaveBeenCalledWith(
      'tournament-1',
      now,
      {
        registrationEndDate: deadline,
        startDate: new Date('2026-10-10T12:01:00.000Z'),
        endDate: new Date('2026-10-13T12:01:00.000Z'),
      },
    );
  });
});
