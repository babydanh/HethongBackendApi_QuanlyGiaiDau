import { MatchType } from '../dto/create-division.dto';
import { resolveLiteDefaultDivision, resolveLiteFormat } from './lite-default-division';

const base = {
  sport: 'badminton',
  requestedFormat: undefined,
  genderRestriction: undefined,
  hasDivisions: false,
  isSuperLite: true,
  footballTeamSize: undefined,
};

describe('Lite default division', () => {
  it('creates an open "Đôi Linh Hoạt" doubles division when no format and no gender are sent', () => {
    expect(resolveLiteDefaultDivision(base)).toEqual({
      name: 'Đôi Linh Hoạt',
      matchType: MatchType.DOUBLES,
      genderRestriction: undefined,
    });
    expect(resolveLiteFormat(base)).toBe('doubles');
  });

  it('keeps an explicitly requested format', () => {
    expect(resolveLiteDefaultDivision({ ...base, requestedFormat: 'singles' })).toMatchObject({
      name: 'Đánh Đơn',
      matchType: MatchType.SINGLES,
    });
    expect(
      resolveLiteDefaultDivision({ ...base, requestedFormat: 'mixed_doubles', isSuperLite: false }),
    ).toMatchObject({ name: 'Đôi Nam Nữ', matchType: MatchType.MIXED_DOUBLES });
  });

  it('keeps a requested gender restriction on the doubles default', () => {
    expect(
      resolveLiteDefaultDivision({ ...base, genderRestriction: 'FEMALE', isSuperLite: false }),
    ).toEqual({ name: 'Đôi Nữ', matchType: MatchType.DOUBLES, genderRestriction: 'FEMALE' });
  });

  it('leaves football team-vs-team and a tournament with its own divisions singles by default', () => {
    expect(resolveLiteDefaultDivision({ ...base, sport: 'football' })).toMatchObject({
      name: 'Bóng đá 7 người',
      matchType: MatchType.SINGLES,
    });
    expect(resolveLiteFormat({ ...base, sport: 'football' })).toBe('singles');
    expect(resolveLiteFormat({ ...base, hasDivisions: true })).toBe('singles');
  });
});
