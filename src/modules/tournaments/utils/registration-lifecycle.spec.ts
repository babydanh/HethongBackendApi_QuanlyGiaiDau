import { BadRequestException } from '@nestjs/common';
import { TournamentsService } from '../tournaments.service';
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

describe('TournamentsService registration access', () => {
  it('rejects UPCOMING even when its scheduled date has arrived', () => {
    const service = Object.create(
      TournamentsService.prototype,
    ) as TournamentsService;

    expect(() =>
      (service as any).assertRegistrationAccessible({
        status: 'UPCOMING',
        registrationStartDate: new Date('2026-09-14T09:00:00.000Z'),
        registrationEndDate: new Date('2026-09-14T11:00:00.000Z'),
      }),
    ).toThrow(BadRequestException);
  });

  it('does not let a stale future opening date block REGISTRATION_OPEN', () => {
    const service = Object.create(
      TournamentsService.prototype,
    ) as TournamentsService;

    expect(() =>
      (service as any).assertRegistrationAccessible({
        status: 'REGISTRATION_OPEN',
        registrationStartDate: new Date(Date.now() + 60 * 60 * 1000),
        registrationEndDate: new Date(Date.now() + 2 * 60 * 60 * 1000),
        isRegistrationLocked: false,
      }),
    ).not.toThrow();
  });

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
    const service = new TournamentsService(
      repository as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
    );
    (service as any).isManager = jest.fn().mockResolvedValue(true);
    (service as any).mapTournamentFormat = jest.fn((value: unknown) => value);

    await service.reopenRegistration('tournament-1', 'organizer-1');

    expect(repository.reopenRegistration).toHaveBeenCalledWith(
      'tournament-1',
      expect.any(Date),
    );
  });
});
