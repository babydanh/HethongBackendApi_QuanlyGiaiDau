import { BadRequestException } from '@nestjs/common';
import { MatchType } from '../dto/create-division.dto';
import {
  resolveLiteDefaultDivision,
  resolveLiteFormat,
  resolveLiteTournamentPolicy,
} from './lite-default-division';

const base = {
  sport: 'badminton',
  requestedFormat: undefined,
  genderRestriction: undefined,
  isSuperLite: true,
  footballTeamSize: undefined,
};

describe('Lite default division', () => {
  it('TC-BTCPAIR-14 names a non-gender doubles default "Đôi linh hoạt" with no gender', () => {
    expect(resolveLiteDefaultDivision(base)).toEqual({
      name: 'Đôi linh hoạt',
      matchType: MatchType.DOUBLES,
      genderRestriction: undefined,
    });
  });

  it('TC-BTCPAIR-14 keeps "Đôi linh hoạt" when doubles is sent explicitly without a gender', () => {
    expect(
      resolveLiteDefaultDivision({ ...base, requestedFormat: 'doubles', isSuperLite: false }),
    ).toEqual({
      name: 'Đôi linh hoạt',
      matchType: MatchType.DOUBLES,
      genderRestriction: undefined,
    });
  });

  it('TC-BTCPAIR-14 names a non-gender singles default "Đơn linh hoạt"', () => {
    expect(resolveLiteDefaultDivision({ ...base, requestedFormat: 'singles' })).toEqual({
      name: 'Đơn linh hoạt',
      matchType: MatchType.SINGLES,
      genderRestriction: undefined,
    });
  });

  it('TC-BTCPAIR-14 adds a gender label only when the gender is explicitly set', () => {
    expect(
      resolveLiteDefaultDivision({ ...base, genderRestriction: 'MALE', isSuperLite: false }),
    ).toEqual({ name: 'Đôi Nam', matchType: MatchType.DOUBLES, genderRestriction: 'MALE' });
    expect(
      resolveLiteDefaultDivision({ ...base, genderRestriction: 'FEMALE', isSuperLite: false }),
    ).toEqual({ name: 'Đôi Nữ', matchType: MatchType.DOUBLES, genderRestriction: 'FEMALE' });
    expect(
      resolveLiteDefaultDivision({ ...base, requestedFormat: 'singles', genderRestriction: 'MALE' }),
    ).toEqual({ name: 'Đơn Nam', matchType: MatchType.SINGLES, genderRestriction: 'MALE' });
    expect(
      resolveLiteDefaultDivision({
        ...base,
        requestedFormat: 'singles',
        genderRestriction: 'FEMALE',
      }),
    ).toEqual({ name: 'Đơn Nữ', matchType: MatchType.SINGLES, genderRestriction: 'FEMALE' });
  });

  it('TC-BTCPAIR-15 resolves a missing format to doubles for every non-football sport', () => {
    expect(resolveLiteFormat(base)).toBe('doubles');
    expect(resolveLiteFormat({ ...base, sport: 'tennis' })).toBe('doubles');
    expect(resolveLiteFormat({ ...base, requestedFormat: undefined, sport: 'pickleball' })).toBe(
      'doubles',
    );
  });

  it('TC-BTCPAIR-15 keeps an explicitly requested format', () => {
    expect(resolveLiteFormat({ ...base, requestedFormat: 'singles' })).toBe('singles');
    expect(resolveLiteFormat({ ...base, requestedFormat: 'mixed_doubles' })).toBe('mixed_doubles');
  });

  it('TC-BTCPAIR-15 keeps football team-vs-team singles by default', () => {
    expect(resolveLiteFormat({ ...base, sport: 'football' })).toBe('singles');
    expect(resolveLiteDefaultDivision({ ...base, sport: 'football' })).toEqual({
      name: 'Bóng đá 7 người',
      matchType: MatchType.SINGLES,
      genderRestriction: undefined,
    });
  });

  it('TC-BTCPAIR-16 gives a mixed_doubles default matchType MIXED_DOUBLES and genderRestriction MIXED', () => {
    expect(
      resolveLiteDefaultDivision({ ...base, requestedFormat: 'mixed_doubles', isSuperLite: false }),
    ).toEqual({
      name: 'Đôi Nam Nữ',
      matchType: MatchType.MIXED_DOUBLES,
      genderRestriction: 'MIXED',
    });
  });

  it('TC-BTCPAIR-16 rejects mixed_doubles paired with a single-gender restriction', () => {
    expect(() =>
      resolveLiteDefaultDivision({
        ...base,
        requestedFormat: 'mixed_doubles',
        genderRestriction: 'MALE',
      }),
    ).toThrow(BadRequestException);
  });
});

describe('Lite tournament policy derived from divisions (TC-BTCPAIR-17)', () => {
  it('TC-BTCPAIR-17 keeps the shared match type and the gender of a single division', () => {
    expect(
      resolveLiteTournamentPolicy([
        { matchType: MatchType.DOUBLES, genderRestriction: 'FEMALE' },
      ]),
    ).toEqual({ matchType: MatchType.DOUBLES, genderRestriction: 'FEMALE' });
  });

  it('TC-BTCPAIR-17 uses DOUBLES when divisions share no match type and one of them is doubles', () => {
    expect(
      resolveLiteTournamentPolicy([
        { matchType: MatchType.SINGLES, genderRestriction: 'MALE' },
        { matchType: MatchType.DOUBLES, genderRestriction: null },
      ]),
    ).toEqual({ matchType: MatchType.DOUBLES, genderRestriction: null });
  });

  it('TC-BTCPAIR-17 drops the gender restriction once there are several divisions', () => {
    expect(
      resolveLiteTournamentPolicy([
        { matchType: MatchType.SINGLES, genderRestriction: 'MALE' },
        { matchType: MatchType.SINGLES, genderRestriction: 'MALE' },
      ]),
    ).toEqual({ matchType: MatchType.SINGLES, genderRestriction: null });
  });

  it('TC-BTCPAIR-17 returns null when there are no divisions to derive from', () => {
    expect(resolveLiteTournamentPolicy([])).toBeNull();
  });
});
