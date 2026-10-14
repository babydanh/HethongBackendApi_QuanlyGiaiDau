/** What one `tournament_rosters` row remembers about the player's own confirmations and the mails sent. */
export interface RosterConfirmationMarks {
  rankingConsentAt: Date | null;
  accountLinkConfirmedAt: Date | null;
  consentNotifiedAt: Date | null;
  consentNotifiedCount: number;
}

type PreviousRosterRow = RosterConfirmationMarks & { userId: string };

/**
 * Builds the lookup used when a participant's roster is deleted and inserted again. A player who was
 * already in the team keeps every mark; a player who was not has confirmed nothing and has not been
 * mailed. Only the player themself ever sets these marks, so nothing is ever filled in here.
 */
export function carryRosterConfirmationMarks(
  previousRows: readonly PreviousRosterRow[],
): (userId: string) => RosterConfirmationMarks {
  const previousByUser = new Map(previousRows.map((row) => [row.userId, row]));
  return (userId) => {
    const previous = previousByUser.get(userId);
    return {
      rankingConsentAt: previous?.rankingConsentAt ?? null,
      accountLinkConfirmedAt: previous?.accountLinkConfirmedAt ?? null,
      consentNotifiedAt: previous?.consentNotifiedAt ?? null,
      consentNotifiedCount: previous?.consentNotifiedCount ?? 0,
    };
  };
}
