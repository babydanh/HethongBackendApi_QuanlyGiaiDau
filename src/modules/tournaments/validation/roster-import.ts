/**
 * Roster import row contract, shared by the read-only preview and the commit.
 *
 * Preview exists so an organizer can see, before anything is written, exactly
 * which rows would be accepted, which addresses already belong to an eligible
 * SportO account, and how much capacity the batch would consume. Preview and
 * commit therefore cannot disagree: both run this pure validator, and only
 * commit re-checks capacity inside the transaction.
 */

import { and, eq, gt, inArray, isNull, ne, notExists, or, sql } from 'drizzle-orm';
import type { AppDbOrTx } from '../../../database/db.types';
import * as schema from '../../../database/schema';
import { calculateRequestedTeamSlots } from '../utils/tournament-participant-status';

export const ROSTER_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface EligibleRosterAccount {
  id: string;
  email: string;
}

function normalizeCandidateEmails(emails: readonly string[]): string[] {
  return [
    ...new Set(
      emails
        .filter((email) => ROSTER_EMAIL_PATTERN.test(email.trim()))
        .map(normalizeRosterEmail),
    ),
  ];
}

/** Account identities stay inside the write path; preview projects email status only. */
export async function findEligibleRosterAccountIds(
  emails: readonly string[],
  db: AppDbOrTx,
): Promise<Map<string, string>> {
  const normalizedEmails = normalizeCandidateEmails(emails);
  if (normalizedEmails.length === 0) return new Map();

  const now = new Date();
  const activeBan = db
    .select({ id: schema.userBans.id })
    .from(schema.userBans)
    .where(
      and(
        eq(schema.userBans.userId, schema.users.id),
        eq(schema.userBans.isActive, true),
        inArray(schema.userBans.banType, ['SOFT_BAN', 'HARD_BAN']),
        or(
          isNull(schema.userBans.expiresAt),
          gt(schema.userBans.expiresAt, now),
        ),
      ),
    );
  const accounts = await db
    .select({
      id: schema.users.id,
      email: sql<string>`lower(${schema.users.email})`,
    })
    .from(schema.users)
    .where(
      and(
        inArray(sql`lower(${schema.users.email})`, normalizedEmails),
        isNull(schema.users.deletedAt),
        eq(schema.users.isMock, false),
        notExists(activeBan),
      ),
    );

  return new Map(accounts.map((account) => [account.email, account.id]));
}

export async function resolveRosterAccountStatuses(
  emails: readonly string[],
  db: AppDbOrTx,
): Promise<Set<string>> {
  return new Set(
    (await findEligibleRosterAccountIds(emails, db)).keys(),
  );
}

export async function findExistingRosterImportEmails(
  tournamentId: string,
  emails: readonly string[],
  db: AppDbOrTx,
): Promise<Set<string>> {
  const normalizedEmails = normalizeCandidateEmails(emails);
  if (normalizedEmails.length === 0) return new Set();

  const activeParticipant = and(
    ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
    ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
    ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
    ne(schema.tournamentParticipants.teamStatus, 'EXPIRED'),
  );
  const player1Email =
    sql<string | null>`lower(${schema.tournamentParticipants.customResponses}->>'player1Email')`;
  const player2Email =
    sql<string | null>`lower(${schema.tournamentParticipants.customResponses}->>'player2Email')`;
  const metadataRows = await db
    .select({ player1Email, player2Email })
    .from(schema.tournamentParticipants)
    .where(
      and(
        eq(schema.tournamentParticipants.tournamentId, tournamentId),
        activeParticipant,
        or(
          inArray(player1Email, normalizedEmails),
          inArray(player2Email, normalizedEmails),
        ),
      ),
    );
  const rosterRows = await db
    .select({ email: sql<string>`lower(${schema.users.email})` })
    .from(schema.tournamentRosters)
    .innerJoin(
      schema.tournamentParticipants,
      eq(
        schema.tournamentRosters.participantId,
        schema.tournamentParticipants.id,
      ),
    )
    .innerJoin(
      schema.users,
      eq(schema.tournamentRosters.userId, schema.users.id),
    )
    .where(
      and(
        eq(schema.tournamentParticipants.tournamentId, tournamentId),
        activeParticipant,
        inArray(sql`lower(${schema.users.email})`, normalizedEmails),
      ),
    );

  return new Set([
    ...metadataRows.flatMap((row) =>
      [row.player1Email, row.player2Email].filter(
        (email): email is string =>
          typeof email === 'string' && normalizedEmails.includes(email),
      ),
    ),
    ...rosterRows.map((row) => row.email),
  ]);
}

export type RosterRowStatus =
  | 'FOUND'
  | 'NOT_FOUND'
  | 'INVALID_EMAIL'
  | 'MISSING_EMAIL'
  | 'MISSING_NAME'
  | 'DUPLICATE_IN_FILE'
  | 'DUPLICATE_IN_TOURNAMENT'
  | 'PLAYER2_REQUIRED'
  | 'PLAYER2_NOT_ALLOWED'
  | 'DIVISION_UNKNOWN';

export type RosterEntryType = 'REGULAR' | 'WILD_CARD_REQUEST';

export interface RosterImportItem {
  teamName?: string;
  divisionName?: string;
  player1Name?: string;
  player1Email?: string;
  player1Phone?: string;
  player2Name?: string;
  player2Email?: string;
  player2Phone?: string;
  elo?: number;
  isPaid?: boolean;
  autoApprove?: boolean;
  entryType?: RosterEntryType;
  customResponses?: Record<string, unknown>;
}

export interface RosterPreviewRow {
  rowIndex: number;
  player1Email: string;
  player2Email: string | null;
  status: RosterRowStatus[];
  /** No blocking status remains; the row may be committed. */
  isEligible: boolean;
  capacityDelta: number;
}

export interface ValidateRosterRowsInput {
  items: readonly RosterImportItem[];
  isDoubles: boolean;
  matchType?: string | null;
  tournamentConfig?: unknown;
  divisionNames?: readonly string[];
  existingEmails?: ReadonlySet<string>;
}

export interface ValidatedRosterRows {
  rows: RosterPreviewRow[];
  /** Team slots the whole batch would claim, summed row by row. */
  requestedTeamSlots: number;
}

const BLOCKING_STATUSES: ReadonlySet<RosterRowStatus> = new Set<RosterRowStatus>([
  'INVALID_EMAIL',
  // MISSING_EMAIL is deliberately absent. A missing address means the athlete
  // has no account yet, not that the row is unusable: organizers collect fees on
  // paper all the time. The row still imports, is still a real athlete rather
  // than mock data, and the preview shows a note.
  //
  // The cost is identity. Nothing can later match this row to a user, to an
  // existing entry, or to a notification, so it cannot complete its own profile.
  // That trade belongs to the organizer, not to the system.
  'MISSING_NAME',
  'DUPLICATE_IN_FILE',
  'DUPLICATE_IN_TOURNAMENT',
  'PLAYER2_REQUIRED',
  'PLAYER2_NOT_ALLOWED',
  'DIVISION_UNKNOWN',
]);

/** Whether a status prevents the row from being committed. */
export function isBlockingRosterStatus(status: RosterRowStatus): boolean {
  return BLOCKING_STATUSES.has(status);
}

export function normalizeRosterEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Validate a batch of roster rows without touching the database.
 *
 * `FOUND`/`NOT_FOUND` are deliberately absent here: account eligibility is a
 * database question answered by `resolveRosterAccountStatuses`, so this stays
 * pure and the preview and commit share one rule set.
 */
/**
 * Fallback identity for a row that carries no address.
 *
 * Weaker than an address on purpose: it cannot tell two different athletes with
 * the same team name apart, and it cannot be compared against entries already
 * in the tournament. But it is the only thing left when the address is blank,
 * and without it importing the same file twice silently doubles the roster.
 */
const rosterIdentityKey = (item: {
  teamName?: string;
  divisionName?: string;
  player1Name?: string;
}): string =>
  [item.teamName ?? '', item.divisionName ?? '', item.player1Name ?? '']
    .map((part) => part.trim().toLowerCase())
    .join(' ');

export function validateRosterRows(
  input: ValidateRosterRowsInput,
): ValidatedRosterRows {
  const {
    items,
    isDoubles,
    matchType,
    tournamentConfig,
    divisionNames,
    existingEmails,
  } = input;

  // An address claimed by more than one row is a file-level duplicate, so it
  // can only be decided once the whole batch has been seen.
  const claimedBy = new Map<string, number[]>();
  const rows: RosterPreviewRow[] = [];

  const claimEmail = (email: string, rowIndex: number): void => {
    const owners = claimedBy.get(email);
    if (owners) owners.push(rowIndex);
    else claimedBy.set(email, [rowIndex]);
  };

  // Rows with no address never enter claimedBy, because claiming is gated on
  // the address pattern. Once MISSING_EMAIL stopped blocking, that left them
  // with no duplicate detection at all, so they are keyed separately.
  const claimedByIdentity = new Map<string, number[]>();
  const claimIdentity = (key: string, rowIndex: number): void => {
    const owners = claimedByIdentity.get(key);
    if (owners) owners.push(rowIndex);
    else claimedByIdentity.set(key, [rowIndex]);
  };

  for (const [rowIndex, item] of items.entries()) {
    const status = new Set<RosterRowStatus>();
    const player1Email = item.player1Email
      ? normalizeRosterEmail(item.player1Email)
      : '';
    const player2Email = item.player2Email?.trim()
      ? normalizeRosterEmail(item.player2Email)
      : null;

    if (!item.player1Name?.trim()) status.add('MISSING_NAME');
    if (!player1Email) status.add('MISSING_EMAIL');
    else if (!ROSTER_EMAIL_PATTERN.test(player1Email)) {
      status.add('INVALID_EMAIL');
    }

    if (
      isDoubles &&
      !item.player2Name?.trim() &&
      (item.player2Email?.trim() || item.player2Phone?.trim())
    ) {
      status.add('PLAYER2_REQUIRED');
    }
    if (
      isDoubles &&
      item.player2Name?.trim() &&
      !player2Email
    ) {
      status.add('MISSING_EMAIL');
    }
    if (
      !isDoubles &&
      (item.player2Name?.trim() ||
        item.player2Email?.trim() ||
        item.player2Phone?.trim())
    ) {
      status.add('PLAYER2_NOT_ALLOWED');
    }
    if (player2Email && !ROSTER_EMAIL_PATTERN.test(player2Email)) {
      status.add('INVALID_EMAIL');
    }

    const divisionName = item.divisionName?.trim();
    if (
      divisionName &&
      divisionNames &&
      !divisionNames.some(
        (name) => name.trim().toLowerCase() === divisionName.toLowerCase(),
      )
    ) {
      status.add('DIVISION_UNKNOWN');
    }

    // Keep both occurrences so an address used twice on the same pair row is
    // rejected as a duplicate just like an address reused across two rows.
    if (ROSTER_EMAIL_PATTERN.test(player1Email)) {
      claimEmail(player1Email, rowIndex);
    }
    if (!player1Email) {
      claimIdentity(rosterIdentityKey(item), rowIndex);
    }
    if (player2Email && ROSTER_EMAIL_PATTERN.test(player2Email)) {
      claimEmail(player2Email, rowIndex);
    }
    if (player1Email && existingEmails?.has(player1Email)) {
      status.add('DUPLICATE_IN_TOURNAMENT');
    }
    if (player2Email && existingEmails?.has(player2Email)) {
      status.add('DUPLICATE_IN_TOURNAMENT');
    }

    const capacityDelta = calculateRequestedTeamSlots(
      matchType,
      item.player2Name?.trim() ? 2 : 1,
      { tournamentConfig },
    );

    rows.push({
      rowIndex,
      player1Email,
      player2Email,
      status: [...status],
      isEligible: [...status].every((code) => !isBlockingRosterStatus(code)),
      capacityDelta,
    });
  }

  for (const owners of claimedBy.values()) {
    if (owners.length < 2) continue;
    for (const rowIndex of owners) {
      const row = rows[rowIndex];
      if (row.status.includes('DUPLICATE_IN_FILE')) continue;
      row.status.push('DUPLICATE_IN_FILE');
      row.isEligible = false;
    }
  }
  for (const owners of claimedByIdentity.values()) {
    if (owners.length < 2) continue;
    for (const rowIndex of owners) {
      const row = rows[rowIndex];
      if (row.status.includes('DUPLICATE_IN_FILE')) continue;
      row.status.push('DUPLICATE_IN_FILE');
      row.isEligible = false;
    }
  }
  const requestedTeamSlots = rows.reduce(
    (total, row) => total + (row.isEligible ? row.capacityDelta : 0),
    0,
  );

  return { rows, requestedTeamSlots };
}
