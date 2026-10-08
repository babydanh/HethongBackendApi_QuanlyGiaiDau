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
 * Live state the policy must re-read from the database. Callers pass real
 * repository reads so a stale UI preview never grants commit rights.
 */
export type SpreadsheetRosterStateProbe = {
  hasStartedMatch: () => Promise<boolean>;
  hasActiveBracketStage: () => Promise<boolean>;
};

/**
 * Shared eligibility policy for the two spreadsheet roster workflows:
 * `POST /tournaments/:id/import-participants/preview` and
 * `POST /tournaments/:id/roster-import`.
 *
 * Compared with the legacy Google Form import and the manual add-athlete
 * flows, registration being closed or locked is NOT disqualifying: the roster
 * may still be loaded while the bracket does not exist yet and no match has
 * started. A completed tournament, an existing bracket stage, or a started
 * match always block, so the roster can never drift from a live bracket.
 *
 * Manager authorization stays with the caller; this only covers tournament
 * state.
 */
export async function assertSpreadsheetRosterEligible(
  tournament: SpreadsheetRosterTournament,
  probe: SpreadsheetRosterStateProbe,
): Promise<void> {
  if (tournament.status === 'COMPLETED') {
    throw new BadRequestException('Giải đấu đã kết thúc');
  }
  if (await probe.hasStartedMatch()) {
    throw new BadRequestException(
      'Không thể nhập danh sách VĐV sau khi trận đấu đã bắt đầu.',
    );
  }
  if (await probe.hasActiveBracketStage()) {
    throw new BadRequestException(
      'Không thể nhập danh sách VĐV sau khi sơ đồ thi đấu đã được tạo. Hãy xử lý lại sơ đồ theo quy trình riêng để tránh kết quả cũ bị lệch.',
    );
  }
}
