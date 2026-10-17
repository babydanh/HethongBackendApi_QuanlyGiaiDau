import { IMPORT_SOURCES } from '../dto/roster-import.dto';

/**
 * One athlete of a doubles pair: a SportO account (it has a roster row) or a
 * guest the organizer typed in (no account, so no roster row: roster user_id is
 * NOT NULL). Guests live on the participant itself, in `customResponses`.
 */
export type PairMember =
  | { kind: 'ACCOUNT'; userId: string; name: string | null }
  | { kind: 'GUEST'; name: string; email: string | null; phone: string | null };

type Responses = Record<string, unknown>;

const SLOT_KEYS = ['Name', 'Email', 'Phone', 'UserId'] as const;

function asResponses(value: unknown): Responses {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Responses)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

const ORGANIZER_ENTRY_SOURCES: readonly unknown[] = ['ORGANIZER_DIRECT', ...IMPORT_SOURCES];

/**
 * Athletes a participant holds. An entry the organizer typed in or imported
 * (Excel, AI Excel, manual email, Google Form) always names athlete 1, so it
 * holds at least one athlete even without a roster, and a second one when it
 * names athlete 2. Other participants hold exactly their rosters.
 */
export function countParticipantMembers(
  customResponses: unknown,
  rosterCount: number,
): number {
  const responses = asResponses(customResponses);
  if (!ORGANIZER_ENTRY_SOURCES.includes(responses.importedFrom)) return rosterCount;
  const namesAthlete2 = Boolean(
    text(responses.player2Name) || text(responses.player2Email),
  );
  return Math.max(rosterCount, namesAthlete2 ? 2 : 1);
}

/**
 * The single athlete a waiting doubles participant holds, or null when it does
 * not hold exactly one. An organizer entry without a roster is one guest.
 */
export function resolveSingleMember(
  participant: { teamName: string | null; customResponses: unknown },
  rosters: ReadonlyArray<{ userId: string }>,
  accountName: (userId: string) => string | null = () => null,
): PairMember | null {
  const responses = asResponses(participant.customResponses);
  if (readPairSlots(responses)) return null;
  if (countParticipantMembers(responses, rosters.length) !== 1) return null;
  if (rosters.length === 1) {
    const { userId } = rosters[0];
    return { kind: 'ACCOUNT', userId, name: accountName(userId) };
  }
  return {
    kind: 'GUEST',
    name: text(participant.teamName) ?? text(responses.player1Name) ?? 'VĐV',
    email: text(responses.player1Email),
    phone: text(responses.player1Phone),
  };
}

function withoutSlots(customResponses: unknown): Responses {
  const rest = { ...asResponses(customResponses) };
  for (const slot of ['player1', 'player2']) {
    for (const key of SLOT_KEYS) delete rest[`${slot}${key}`];
  }
  return rest;
}

function slotValues(
  slot: 'player1' | 'player2',
  member: PairMember,
): Responses {
  return member.kind === 'ACCOUNT'
    ? { [`${slot}Name`]: member.name, [`${slot}UserId`]: member.userId }
    : {
        [`${slot}Name`]: member.name,
        [`${slot}Email`]: member.email,
        [`${slot}Phone`]: member.phone,
        [`${slot}UserId`]: null,
      };
}

/**
 * `customResponses` of a pair that holds a guest. The Web organizer view reads
 * the `playerN*` slots to show athletes without a roster; `playerNUserId`
 * (null for a guest) lets unpairing give each athlete back its own row.
 */
export function writePairSlots(
  customResponses: unknown,
  first: PairMember,
  second: PairMember,
): Responses {
  const rest = withoutSlots(customResponses);
  // A pair holding a guest is an organizer entry (no roster row for the guest),
  // so mark it: capacity then counts both athletes, not one roster.
  const holdsGuest = first.kind === 'GUEST' || second.kind === 'GUEST';
  const organizerMarker =
    holdsGuest && !ORGANIZER_ENTRY_SOURCES.includes(rest.importedFrom)
      ? { importedFrom: 'ORGANIZER_DIRECT' }
      : {};
  return {
    ...rest,
    ...organizerMarker,
    ...slotValues('player1', first),
    ...slotValues('player2', second),
  };
}

function readSlot(
  responses: Responses,
  slot: 'player1' | 'player2',
): PairMember | null {
  if (!(`${slot}UserId` in responses)) return null;
  const userId = text(responses[`${slot}UserId`]);
  const name = text(responses[`${slot}Name`]);
  if (userId) return { kind: 'ACCOUNT', userId, name };
  return {
    kind: 'GUEST',
    name: name ?? 'VĐV',
    email: text(responses[`${slot}Email`]),
    phone: text(responses[`${slot}Phone`]),
  };
}

/** Both athletes of a pair written by `writePairSlots`, or null for any other row. */
export function readPairSlots(
  customResponses: unknown,
): [PairMember, PairMember] | null {
  const responses = asResponses(customResponses);
  const first = readSlot(responses, 'player1');
  const second = readSlot(responses, 'player2');
  return first && second ? [first, second] : null;
}

/** `customResponses` of a participant that holds only `member` again. */
export function singleMemberResponses(
  customResponses: unknown,
  member: PairMember,
): Responses {
  const rest = withoutSlots(customResponses);
  if (member.kind === 'ACCOUNT') {
    if (rest.importedFrom === 'ORGANIZER_DIRECT') delete rest.importedFrom;
    return rest;
  }
  return {
    ...rest,
    importedFrom: 'ORGANIZER_DIRECT',
    ...(member.email ? { player1Email: member.email } : {}),
    ...(member.phone ? { player1Phone: member.phone } : {}),
  };
}
