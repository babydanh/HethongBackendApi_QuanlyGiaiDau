import {
  evaluateTournamentCleanup,
  TOURNAMENT_CLEANUP_GRACE_DAYS,
} from './tournament-cleanup-policy';

describe('evaluateTournamentCleanup', () => {
  const now = new Date('2026-08-16T12:00:00.000Z');
  const base = {
    status: 'REGISTRATION_CLOSED',
    registrationStartDate: new Date('2026-08-01T12:00:00.000Z'),
    registrationEndDate: new Date('2026-08-08T12:00:00.000Z'),
    startDate: new Date('2026-08-16T12:00:00.000Z'),
    activeRegistrationCount: 0,
    protectedPaymentCount: 0,
    protectedMatchCount: 0,
    hasBracketData: false,
  };

  it('allows an empty tournament after the seven-day grace period', () => {
    expect(evaluateTournamentCleanup(base, now)).toEqual({
      eligible: true,
      reason: 'NO_ACTIVE_REGISTRATION_AFTER_GRACE_PERIOD',
    });
  });

  it('does not allow cleanup before the seven-day grace period', () => {
    const result = evaluateTournamentCleanup(
      { ...base, registrationEndDate: new Date('2026-08-10T12:00:00.000Z') },
      now,
    );

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('GRACE_PERIOD_NOT_ELAPSED');
  });

  it('keeps a tournament scheduled one month later even after registration closes', () => {
    expect(
      evaluateTournamentCleanup(
        {
          ...base,
          registrationEndDate: new Date('2026-08-08T12:00:00.000Z'),
          startDate: new Date('2026-09-16T12:00:00.000Z'),
        },
        now,
      ),
    ).toEqual({ eligible: false, reason: 'TOURNAMENT_NOT_STARTED' });
  });

  it('does not cleanup when registration has not started', () => {
    expect(
      evaluateTournamentCleanup(
        {
          ...base,
          registrationStartDate: new Date('2026-08-20T12:00:00.000Z'),
          registrationEndDate: new Date('2026-08-30T12:00:00.000Z'),
        },
        now,
      ),
    ).toEqual({ eligible: false, reason: 'REGISTRATION_NOT_STARTED' });
  });

  it('does not cleanup an invalid registration window', () => {
    expect(
      evaluateTournamentCleanup(
        { ...base, registrationStartDate: new Date('2026-08-09T12:00:00.000Z') },
        now,
      ),
    ).toEqual({ eligible: false, reason: 'REGISTRATION_WINDOW_INVALID' });
  });

  it.each([
    ['PENDING', 'ACTIVE_REGISTRATION'],
    ['PENDING_APPROVAL', 'ACTIVE_REGISTRATION'],
    ['PENDING_PARTNER', 'ACTIVE_REGISTRATION'],
    ['COMPLETE', 'ACTIVE_REGISTRATION'],
    ['APPROVED', 'ACTIVE_REGISTRATION'],
    ['WAITLISTED', 'ACTIVE_REGISTRATION'],
  ])('protects participant status %s', (status, reason) => {
    const result = evaluateTournamentCleanup(
      { ...base, activeRegistrationCount: 1 },
      now,
    );

    expect(result).toEqual({ eligible: false, reason });
  });

  it.each([
    ['PENDING', 'PROTECTED_PAYMENT'],
    ['COMPLETED', 'PROTECTED_PAYMENT'],
    ['PENDING_REFUND', 'PROTECTED_PAYMENT'],
  ])('protects payment status %s', (_status, reason) => {
    expect(
      evaluateTournamentCleanup({ ...base, protectedPaymentCount: 1 }, now),
    ).toEqual({ eligible: false, reason });
  });

  it('protects tournaments with matches or bracket data', () => {
    expect(
      evaluateTournamentCleanup({ ...base, protectedMatchCount: 1 }, now),
    ).toEqual({ eligible: false, reason: 'PROTECTED_MATCH' });
    expect(
      evaluateTournamentCleanup({ ...base, hasBracketData: true }, now),
    ).toEqual({ eligible: false, reason: 'PROTECTED_BRACKET' });
  });

  it('fails closed when dependency counts or bracket data are unavailable', () => {
    expect(
      evaluateTournamentCleanup({ ...base, activeRegistrationCount: undefined }, now),
    ).toEqual({ eligible: false, reason: 'DEPENDENCY_DATA_INVALID' });
    expect(
      evaluateTournamentCleanup({ ...base, protectedPaymentCount: Number.NaN }, now),
    ).toEqual({ eligible: false, reason: 'DEPENDENCY_DATA_INVALID' });
    expect(
      evaluateTournamentCleanup({ ...base, hasBracketData: undefined }, now),
    ).toEqual({ eligible: false, reason: 'DEPENDENCY_DATA_INVALID' });
  });

  it.each(['DRAFT', 'PENDING_APPROVAL', 'SUSPENDED', 'PENDING_DELETE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])(
    'does not clean up status %s', (status) => {
      expect(
        evaluateTournamentCleanup({ ...base, status }, now),
      ).toEqual({ eligible: false, reason: 'STATUS_NOT_ELIGIBLE' });
    },
  );

  it('uses exactly seven days as the grace period', () => {
    const registrationEndDate = new Date(now.getTime() - TOURNAMENT_CLEANUP_GRACE_DAYS * 24 * 60 * 60 * 1000);
    expect(
      evaluateTournamentCleanup({ ...base, registrationEndDate }, now).eligible,
    ).toBe(true);
  });
});
