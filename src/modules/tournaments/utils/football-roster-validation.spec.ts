import { BadRequestException } from '@nestjs/common';
import { validateFootballRosterSelection } from './football-roster-validation';

describe('validateFootballRosterSelection', () => {
  const activeMemberIds = new Set(['captain', 'p2', 'p3', 'reserve']);
  const base = {
    leaderId: 'captain',
    memberIds: ['p2', 'p3'],
    reserveMemberIds: ['reserve'],
    activeMemberIds,
    minMainSize: 3,
    maxMainSize: 3,
    maxReserve: 1,
    maxTotalSize: 4,
  } as const;

  it('normalizes the leader and preserves main/reserve roles', () => {
    expect(validateFootballRosterSelection(base)).toEqual({
      mainMemberIds: ['captain', 'p2', 'p3'],
      reserveMemberIds: ['reserve'],
      allMemberIds: ['captain', 'p2', 'p3', 'reserve'],
    });
  });

  it.each([
    ['leader in reserve', { reserveMemberIds: ['captain'] }],
    ['overlapping roles', { memberIds: ['p2'], reserveMemberIds: ['p2'] }],
    ['inactive main', { memberIds: ['missing', 'p2'] }],
    ['too few main', { memberIds: ['p2'], reserveMemberIds: [] }],
    ['too many reserve', { reserveMemberIds: ['reserve', 'p3'] }],
  ])('rejects %s', (_label, overrides) => {
    expect(() => validateFootballRosterSelection({ ...base, ...overrides })).toThrow(BadRequestException);
  });
});
