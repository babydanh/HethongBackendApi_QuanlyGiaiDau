import { BadRequestException } from '@nestjs/common';
import { assertFootballRosterLockable } from './football-roster-lock';

describe('assertFootballRosterLockable', () => {
  const valid = {
    entryExists: true,
    entryStatus: 'CONFIRMED',
  confirmations: ['CONFIRMED'] as Array<'CONFIRMED'>,
  mainRosterCount: 1,
  requiredMainRosterCount: 1,
  };

  it('accepts a confirmed roster', () => {
    expect(() => assertFootballRosterLockable(valid)).not.toThrow();
  });

  it('rejects a missing entry, pending member, declined member, or empty main roster', () => {
    expect(() =>
      assertFootballRosterLockable({ ...valid, entryExists: false }),
    ).toThrow(BadRequestException);
    expect(() =>
      assertFootballRosterLockable({ ...valid, confirmations: ['PENDING'] }),
    ).toThrow(BadRequestException);
    expect(() =>
      assertFootballRosterLockable({ ...valid, confirmations: ['DECLINED'] }),
    ).toThrow(BadRequestException);
    expect(() =>
      assertFootballRosterLockable({ ...valid, mainRosterCount: 0 }),
    ).toThrow(BadRequestException);
  });

  it('is idempotent for an already locked entry', () => {
    expect(() =>
      assertFootballRosterLockable({ ...valid, entryStatus: 'LOCKED' }),
    ).not.toThrow();
  });

  it('keeps an undersized roster from being locked', () => {
    expect(() =>
      assertFootballRosterLockable({
        ...valid,
        requiredMainRosterCount: 5,
        mainRosterCount: 4,
      }),
    ).toThrow(BadRequestException);
  });
});
