import {
  isMixedGenderPair,
  isPairEligibleForDivision,
  normalizeGenderRestriction,
  normalizeProfileGender,
} from './gender.helper';

describe('gender normalization', () => {
  it.each([
    ['MALE', 'MALE'],
    ['Nam', 'MALE'],
    ['M', 'MALE'],
    [' men ', 'MALE'],
    ['FEMALE', 'FEMALE'],
    ['Nữ', 'FEMALE'],
    ['NỮ', 'FEMALE'],
    ['F', 'FEMALE'],
    [' women ', 'FEMALE'],
    ['Khác', 'OTHER'],
    ['OTHER', 'OTHER'],
  ])('normalizes profile %s to %s', (input, expected) => {
    expect(normalizeProfileGender(input)).toBe(expected);
  });

  it.each([
    ['Nam', 'MALE'],
    ['Nữ', 'FEMALE'],
    ['NỮ', 'FEMALE'],
    ['MIXED_DOUBLES', 'MIXED'],
  ])('normalizes restriction %s to %s', (input, expected) => {
    expect(normalizeGenderRestriction(input)).toBe(expected);
  });

  it.each([undefined, null, '', 'unknown', 'Khác'])('does not infer %s', (input) => {
    expect(normalizeGenderRestriction(input)).toBeNull();
  });

  it('accepts exactly one male and one female as a mixed pair', () => {
    expect(isMixedGenderPair('Nam', 'NỮ')).toBe(true);
    expect(isMixedGenderPair('MALE', 'MALE')).toBe(false);
    expect(isMixedGenderPair('FEMALE', 'Khác')).toBe(false);
  });
});
describe('open doubles pairing eligibility', () => {
  it.each([
    {
      divisionMatchType: 'DOUBLES',
      genderRestriction: null,
      firstGender: 'MALE',
      secondGender: 'FEMALE',
      eligible: true,
    },
    {
      divisionMatchType: 'DOUBLES',
      genderRestriction: null,
      firstGender: null,
      secondGender: 'MALE',
      eligible: true,
    },
    {
      divisionMatchType: 'DOUBLES',
      genderRestriction: 'OPEN',
      firstGender: null,
      secondGender: null,
      eligible: true,
    },
    {
      divisionMatchType: 'DOUBLES',
      genderRestriction: 'MALE',
      firstGender: 'MALE',
      secondGender: 'MALE',
      eligible: true,
    },
    {
      divisionMatchType: 'DOUBLES',
      genderRestriction: 'MALE',
      firstGender: 'MALE',
      secondGender: 'FEMALE',
      eligible: false,
    },
    {
      divisionMatchType: 'MIXED_DOUBLES',
      genderRestriction: 'MIXED',
      firstGender: 'MALE',
      secondGender: 'FEMALE',
      eligible: true,
    },
    {
      divisionMatchType: 'MIXED_DOUBLES',
      genderRestriction: 'MIXED',
      firstGender: 'MALE',
      secondGender: 'MALE',
      eligible: false,
    },
    {
      divisionMatchType: 'SINGLES',
      genderRestriction: null,
      firstGender: 'MALE',
      secondGender: 'FEMALE',
      eligible: false,
    },
    {
      divisionMatchType: 'DOUBLES',
      genderRestriction: 'UNKNOWN',
      firstGender: 'MALE',
      secondGender: 'MALE',
      eligible: false,
    },
  ])(
    'evaluates $divisionMatchType / $genderRestriction pair eligibility',
    ({
      divisionMatchType,
      genderRestriction,
      firstGender,
      secondGender,
      eligible,
    }) => {
      expect(
        isPairEligibleForDivision(
          divisionMatchType,
          genderRestriction,
          firstGender,
          secondGender,
        ),
      ).toBe(eligible);
    },
  );
});
