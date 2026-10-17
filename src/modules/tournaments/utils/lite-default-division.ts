import { MatchType } from '../dto/create-division.dto';
import { validateMatchTypeGenderRestriction } from './tournament-input-policy';

type LiteFormat = 'singles' | 'doubles' | 'mixed_doubles';
type GenderRestriction = 'MALE' | 'FEMALE' | 'MIXED';

export interface LiteDefaultDivisionInput {
  sport: string | undefined;
  /** `format` as the organizer sent it, before any default. */
  requestedFormat: string | undefined;
  genderRestriction: GenderRestriction | undefined;
  isSuperLite: boolean;
  footballTeamSize: number | undefined;
}

/**
 * Format of a Lite tournament. A missing format is doubles for every sport
 * except football, which is team-vs-team and stays singles.
 */
export function resolveLiteFormat(
  input: Pick<LiteDefaultDivisionInput, 'sport' | 'requestedFormat'>,
): LiteFormat {
  if (input.requestedFormat) return input.requestedFormat as LiteFormat;
  return input.sport === 'football' ? 'singles' : 'doubles';
}

/** Gender appears in the name only when the gender is set; otherwise it is open. */
function nonFootballDivisionName(
  matchType: MatchType,
  genderRestriction: GenderRestriction | undefined,
): string {
  if (matchType === MatchType.MIXED_DOUBLES) return 'Đôi Nam Nữ';
  const side = matchType === MatchType.SINGLES ? 'Đơn' : 'Đôi';
  if (genderRestriction === 'FEMALE') return `${side} Nữ`;
  if (genderRestriction === 'MALE') return `${side} Nam`;
  return `${side} linh hoạt`;
}

/**
 * The one division a Lite tournament gets when the organizer sends none. Doubles
 * and singles without a gender are open ("Đôi linh hoạt" / "Đơn linh hoạt");
 * mixed doubles always carries genderRestriction MIXED.
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
  let matchType = MatchType.DOUBLES;
  if (format === 'singles') {
    matchType = MatchType.SINGLES;
  } else if (format === 'mixed_doubles' || genderRestriction === 'MIXED') {
    matchType = MatchType.MIXED_DOUBLES;
  }
  const restriction =
    matchType === MatchType.MIXED_DOUBLES
      ? (genderRestriction ?? 'MIXED')
      : genderRestriction;
  validateMatchTypeGenderRestriction(matchType, restriction, 'division');
  return {
    name: nonFootballDivisionName(matchType, restriction),
    matchType,
    genderRestriction: restriction,
  };
}

/**
 * Tournament-level match type and gender restriction of a Lite tournament,
 * derived from its divisions (D9). Divisions that share a match type give that
 * type; otherwise the tournament is DOUBLES when any division is doubles or
 * mixed doubles, and SINGLES when none is. The gender restriction is kept only
 * for a single division. Returns null when there is no division to derive from.
 */
export function resolveLiteTournamentPolicy(
  divisions: ReadonlyArray<{ matchType: string; genderRestriction: string | null }>,
): { matchType: string; genderRestriction: string | null } | null {
  if (divisions.length === 0) return null;
  const [first] = divisions;
  const sharedMatchType = divisions.every((division) => division.matchType === first.matchType);
  let matchType: string = MatchType.SINGLES;
  if (sharedMatchType) {
    matchType = first.matchType;
  } else if (
    divisions.some(
      (division) =>
        division.matchType === 'DOUBLES' ||
        division.matchType === 'MIXED_DOUBLES',
    )
  ) {
    matchType = MatchType.DOUBLES;
  }
  return {
    matchType,
    genderRestriction: divisions.length === 1 ? first.genderRestriction : null,
  };
}
