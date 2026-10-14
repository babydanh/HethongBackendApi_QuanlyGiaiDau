/**
 * The two instants on a `tournament_rosters` row that decide whether a user's result may move ELO.
 *
 * They mean different things and neither replaces the other:
 * - `rankingConsentAt`: the player agreed to be ranked.
 * - `accountLinkConfirmedAt`: the player confirmed that this roster entry is their account.
 *
 * Only the player themself writes them. A row an organizer added starts with both NULL.
 */
export interface RosterEloMarks {
  rankingConsentAt: Date | null;
  accountLinkConfirmedAt: Date | null;
}

/**
 * True when the user gave BOTH confirmations no later than the instant the match completed. A match
 * finished before that moment is never counted, and a late confirmation never back-fills it.
 *
 * `instanceof Date` rather than a null check: a missing mark must read as "not confirmed", never throw
 * inside the batch loop that calls this.
 */
export function isRosterEligibleForElo(
  marks: RosterEloMarks,
  completedAtMs: number,
): boolean {
  return [marks.rankingConsentAt, marks.accountLinkConfirmedAt].every(
    (mark) => mark instanceof Date && mark.getTime() <= completedAtMs,
  );
}

/**
 * True when one side of a match has at least one roster row and every row is eligible. A side with no
 * row at all (a guest added from an Excel file has no account, so no row can exist) is never eligible:
 * testing the union of both sides would read an empty side as "everyone confirmed".
 */
export function isSideEligibleForElo(
  rows: readonly RosterEloMarks[],
  completedAtMs: number,
): boolean {
  return (
    rows.length > 0 &&
    rows.every((row) => isRosterEligibleForElo(row, completedAtMs))
  );
}
