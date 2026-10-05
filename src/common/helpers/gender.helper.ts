export type ProfileGender = 'MALE' | 'FEMALE' | 'OTHER';
export type GenderRestriction = 'MALE' | 'FEMALE' | 'MIXED';

const normalizeToken = (value?: string | null) =>
  String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toUpperCase()
    .replace(/[-–\s]+/g, '_');

const profileGenderAliases: Record<ProfileGender, readonly string[]> = {
  MALE: ['MALE', 'MEN', 'NAM', 'M'],
  FEMALE: ['FEMALE', 'WOMEN', 'NU', 'NỮ', 'F'],
  OTHER: ['OTHER', 'OTHERS', 'KHAC', 'KHÁC'],
};

const restrictionAliases: Record<GenderRestriction, readonly string[]> = {
  MALE: profileGenderAliases.MALE,
  FEMALE: profileGenderAliases.FEMALE,
  MIXED: ['MIXED', 'MIXED_DOUBLES', 'MIX'],
};

export function normalizeProfileGender(
  value?: string | null,
): ProfileGender | null {
  const token = normalizeToken(value);
  for (const gender of Object.keys(profileGenderAliases) as ProfileGender[]) {
    if (profileGenderAliases[gender].includes(token)) return gender;
  }
  return null;
}

export function normalizeGenderRestriction(
  value?: string | null,
): GenderRestriction | null {
  const token = normalizeToken(value);
  for (const restriction of Object.keys(
    restrictionAliases,
  ) as GenderRestriction[]) {
    if (restrictionAliases[restriction].includes(token)) return restriction;
  }
  return null;
}

export function getProfileGenderAliases(
  gender: Exclude<ProfileGender, 'OTHER'>,
): readonly string[] {
  return profileGenderAliases[gender];
}

export function isMixedGenderPair(
  first?: string | null,
  second?: string | null,
): boolean {
  const firstGender = normalizeProfileGender(first);
  const secondGender = normalizeProfileGender(second);
  return (
    (firstGender === 'MALE' && secondGender === 'FEMALE') ||
    (firstGender === 'FEMALE' && secondGender === 'MALE')
  );
}

export function isGenderUnrestricted(
  value?: string | null,
): boolean {
  const token = normalizeToken(value);
  return token === '' || token === 'OPEN';
}

export function isPairEligibleForDivision(
  divisionMatchType?: string | null,
  genderRestriction?: string | null,
  firstGender?: string | null,
  secondGender?: string | null,
): boolean {
  const isUnrestricted = isGenderUnrestricted(genderRestriction);
  const restriction = normalizeGenderRestriction(genderRestriction);
  if (!isUnrestricted && !restriction) return false;

  const normalizedMatchType = normalizeToken(divisionMatchType);
  const first = normalizeProfileGender(firstGender);
  const second = normalizeProfileGender(secondGender);
  const hasBinaryGenders =
    (first === 'MALE' || first === 'FEMALE') &&
    (second === 'MALE' || second === 'FEMALE');
  if (restriction && !hasBinaryGenders) return false;

  const isMixedPair =
    (first === 'MALE' && second === 'FEMALE') ||
    (first === 'FEMALE' && second === 'MALE');
  const targetMatchType = isMixedPair ? 'MIXED_DOUBLES' : 'DOUBLES';
  const matchTypeIsValid =
    normalizedMatchType === targetMatchType ||
    (isUnrestricted &&
      normalizedMatchType === 'DOUBLES' &&
      isMixedPair);
  if (!matchTypeIsValid) return false;

  switch (restriction) {
    case 'MALE':
      return first === 'MALE' && second === 'MALE';
    case 'FEMALE':
      return first === 'FEMALE' && second === 'FEMALE';
    case 'MIXED':
      return isMixedPair;
    default:
      return isUnrestricted;
  }
}
