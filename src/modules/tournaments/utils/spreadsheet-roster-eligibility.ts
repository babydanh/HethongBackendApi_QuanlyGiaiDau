import { BadRequestException } from '@nestjs/common';

/**
 * Tournament fields the spreadsheet roster policy reads. The registration
 * status/lock deliberately does NOT appear here: unlike the legacy/manual
 * flows, a closed or locked registration does not block the spreadsheet
 * routes on its own.
 */
export type SpreadsheetRosterTournament = {
  status?: string | null;
};

/**
 * Shared eligibility policy for the spreadsheet roster workflows:
 * `POST /tournaments/:id/import-participants/preview`,
 * `POST /tournaments/:id/roster-import` and the batch preview/commit.
 *
 * Only a completed tournament blocks. A started match or an existing bracket
 * no longer does (product owner decision, 2026-10-14): an organizer must be
 * able to add athletes while the event runs. The import only adds registration
 * rows; it never edits a bracket, a match or a result, so an athlete added to a
 * division that already has a bracket is NOT placed into that bracket.
 *
 * Manager authorization stays with the caller; this only covers tournament
 * state.
 */
export function assertSpreadsheetRosterEligible(
  tournament: SpreadsheetRosterTournament,
): void {
  if (tournament.status === 'COMPLETED') {
    throw new BadRequestException('Giải đấu đã kết thúc');
  }
}
