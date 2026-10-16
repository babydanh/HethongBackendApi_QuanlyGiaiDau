import { MatchType } from '../dto/create-division.dto';

type LiteFormat = 'singles' | 'doubles' | 'mixed_doubles';
type GenderRestriction = 'MALE' | 'FEMALE' | 'MIXED';

export interface LiteDefaultDivisionInput {
  sport: string | undefined;
  /** `format` as the organizer sent it, before any default. */
  requestedFormat: string | undefined;
  genderRestriction: GenderRestriction | undefined;
  hasDivisions: boolean;
  isSuperLite: boolean;
  footballTeamSize: number | undefined;
}

/**
 * Format of a Lite tournament. With no division and no format it is doubles,
 * the format of the default division (owner decision 2026-10-16); football is
 * team-vs-team and stays singles.
 */
export function resolveLiteFormat(
  input: Pick<LiteDefaultDivisionInput, 'sport' | 'requestedFormat' | 'hasDivisions'>,
): LiteFormat {
  if (input.requestedFormat) return input.requestedFormat as LiteFormat;
  return !input.hasDivisions && input.sport !== 'football' ? 'doubles' : 'singles';
}

/**
 * The one division a Lite tournament gets when the organizer sends none. With
 * no format and no gender restriction it is "Đôi Linh Hoạt": doubles, open to
 * any gender.
 */
export function resolveLiteDefaultDivision(input: LiteDefaultDivisionInput): {
  name: string;
  matchType: MatchType;
  genderRestriction: GenderRestriction | undefined;
} {
  const { sport, genderRestriction, isSuperLite } = input;
  if (sport === 'football') {
    return {
      name: isSuperLite
        ? `Bóng đá ${input.footballTeamSize || 7} người`
        : genderRestriction === 'FEMALE'
          ? 'Đội nữ'
          : genderRestriction === 'MALE'
            ? 'Đội nam'
            : 'Không giới hạn',
      // Football is team-vs-team; the category contract uses SINGLES for it.
      matchType: MatchType.SINGLES,
      genderRestriction,
    };
  }

  const format = resolveLiteFormat(input);
  if (format === 'singles') {
    return {
      name: isSuperLite ? 'Đánh Đơn' : genderRestriction === 'FEMALE' ? 'Đơn Nữ' : 'Đơn Nam',
      matchType: MatchType.SINGLES,
      genderRestriction,
    };
  }

  const mixed = format === 'mixed_doubles' || genderRestriction === 'MIXED';
  const flexible = !input.requestedFormat && !genderRestriction;
  return {
    name: flexible
      ? 'Đôi Linh Hoạt'
      : isSuperLite
        ? 'Đánh Đôi'
        : mixed
          ? 'Đôi Nam Nữ'
          : genderRestriction === 'FEMALE'
            ? 'Đôi Nữ'
            : 'Đôi Nam',
    matchType: mixed ? MatchType.MIXED_DOUBLES : MatchType.DOUBLES,
    genderRestriction,
  };
}
