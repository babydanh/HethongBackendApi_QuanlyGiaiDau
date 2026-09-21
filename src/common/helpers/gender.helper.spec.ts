import {
  isMixedGenderPair,
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
