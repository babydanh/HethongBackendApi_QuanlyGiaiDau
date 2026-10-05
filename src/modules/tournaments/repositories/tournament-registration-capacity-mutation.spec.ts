import { BadRequestException } from '@nestjs/common';
import * as schema from '../../../database/schema';
import { TournamentRegistrationRepository } from './tournament-registration.repository';

// Drizzle tables are object keys, so the lookup must be by identity.
const TABLE_KEYS = new Map<unknown, string>([
  [schema.tournaments, 'tournaments'],
  [schema.tournamentDivisions, 'divisions'],
  [schema.tournamentParticipants, 'participants'],
  [schema.tournamentRosters, 'rosters'],
  [schema.profiles, 'profiles'],
  [schema.users, 'users'],
  [schema.communityMembers, 'communityMembers'],
]);

type Row = Record<string, unknown>;

interface Harness {
  tx: Record<string, unknown>;
  inserts: Array<{ table: string; values: Row }>;
  updates: Array<{ table: string; values: Row }>;
  lockedTables: string[];
  events: string[];
}

/**
 * A lock on the owner row itself is the capacity claim's serialization; any
 * other row lock is incidental to reading or writing the claim.
 */
function locksOwnerRow(fields: Record<string, unknown> | undefined): boolean {
  if (!fields) return false;
  const columns = Object.values(fields);
  return (
    columns.length > 0 &&
    columns.every(
      (column) =>
        column === schema.tournaments.id ||
        column === schema.tournamentDivisions.id,
    )
  );
}

/**
 * The fake tx never evaluates WHERE, so an occupancy row is projected onto the
 * columns the capacity query asked for: the same row reads under its division
 * for a division read and under its tournament for a tournament read, exactly
 * as the real join would return it.
 */

function projectOccupancyRow(fields: Record<string, unknown>, row: Row): Row {
  const projected: Row = { rosterMemberCount: row.rosterMemberCount };
  for (const [key, column] of Object.entries(fields)) {
    if (key === 'rosterMemberCount') continue;
    if (column === schema.tournamentParticipants.tournamentDivisionId)
      projected[key] =
        row.divisionId !== undefined ? row.divisionId : row.scopeId;
    else if (column === schema.tournamentParticipants.tournamentId)
      projected[key] = row.tournamentId ?? row.scopeId ?? null;
    else projected[key] = row[key];
  }
  return projected;
}

function createHarness(queues: Record<string, Row[][]>): Harness {
  const inserts: Array<{ table: string; values: Row }> = [];
  const updates: Array<{ table: string; values: Row }> = [];
  const lockedTables: string[] = [];
  const events: string[] = [];

  const takeRows = (key: string): Row[] => {
    const queue = queues[key];
    if (!queue || queue.length === 0) return [];
    return queue.length === 1 ? queue[0] : queue.shift()!;
  };

  const tableKey = (tables: string[]): string =>
    [...new Set(tables)].sort().join('+');

  const select = (fields?: Record<string, unknown>) => {
    const tables: string[] = [];
    const query: Record<string, unknown> = {};

    const record = (fn: (...args: unknown[]) => unknown) => (
      ...args: unknown[]
    ) => {
      for (const arg of args) {
        const name = TABLE_KEYS.get(arg);
        if (name) tables.push(name);
      }
      return fn(...args);
    };

    query.from = record(() => query);
    query.innerJoin = record(() => query);
    query.leftJoin = record(() => query);
    query.where = () => query;
    query.groupBy = () => query;
    query.orderBy = () => query;
    query.limit = () => query;
    query.for = (locking: unknown) => {
      if (locking) {
        const key = tableKey(tables);
        lockedTables.push(key);
        const mode = String(locking).toLowerCase();
        const lockKind = locksOwnerRow(fields)
          ? 'lockOwner'
          : mode.includes('share')
            ? 'lockShared'
            : 'lock';
        events.push(`${lockKind}:${key}`);
      }
      return query;
    };
    query.then = (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown,
    ) =>
      Promise.resolve()
        .then(() => {
          const rows = takeRows(tableKey(tables));
          if (fields && 'rosterMemberCount' in fields) {
            events.push('read:occupancy');
            return rows.map((row) => projectOccupancyRow(fields, row));
          }
          events.push(`read:${tableKey(tables)}`);
          return rows;
        })
        .then(resolve, reject);

    return query;
  };

  const tx = {
    select,
    insert: (table: unknown) => {
      const name = TABLE_KEYS.get(table) ?? 'unknown';
      return {
        values: (values: Row) => {
          inserts.push({ table: name, values });
          return {
            returning: async () => [{ id: `participant-${inserts.length}` }],
          };
        },
      };
    },
    update: (table: unknown) => {
      const name = TABLE_KEYS.get(table) ?? 'unknown';
      return {
        set: (values: Row) => ({
          where: () => ({
            returning: async () => {
              updates.push({ table: name, values });
              return [{ id: 'participant-1', ...values }];
            },
          }),
        }),
      };
    },
  };

  return {
    tx: tx as unknown as Record<string, unknown>,
    inserts,
    updates,
    lockedTables,
    events,
  };
}

function createRepository(harness: Harness) {
  const db = {
    transaction: async (callback: (tx: unknown) => unknown) =>
      callback(harness.tx),
  };
  const auditService = { logCreate: jest.fn(), logUpdate: jest.fn() };
  const paymentRepository = {
    resolveDivisionEntryFee: jest.fn().mockResolvedValue(0),
    invalidatePendingParticipantPayments: jest.fn(),
    findCompletedParticipantPaymentInTx: jest.fn().mockResolvedValue(null),
    createPendingRefund: jest.fn(),
  };

  return new TournamentRegistrationRepository(
    db as never,
    auditService as never,
    paymentRepository as never,
  );
}

const TOURNAMENT_ROW: Row = {
  id: 'tournament-1',
  tournamentConfig: null,
  matchType: 'DOUBLES',
  registrationEndDate: null,
  isRegistrationLocked: false,
  maxParticipants: 4,
};

const DIVISION_ROW: Row = {
  id: 'division-1',
  matchType: 'DOUBLES',
  genderRestriction: 'MALE',
  registrationEndDate: null,
  isRegistrationLocked: false,
  maxParticipants: 4,
};

const PARTNER_PENDING_ROW: Row = {
  id: 'participant-1',
  tournamentId: 'tournament-1',
  tournamentDivisionId: 'division-1',
  registeredBy: 'leader-1',
  teamStatus: 'PENDING_PARTNER',
  partnerUserId: 'partner-1',
  partnerInviteExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
  entryFeeAtRegistration: '0',
  isPaid: true,
};

const CAPACITY_OWNER_ROW: Row = {
  id: 'division-1',
  tournamentId: 'tournament-1',
  matchType: 'DOUBLES',
  maxParticipants: 4,
  tournamentConfig: null,
};

function partnerInviteQueues(entries: Row[]): Record<string, Row[][]> {
  return {
    participants: [
      [{ tournamentId: 'tournament-1', tournamentDivisionId: 'division-1' }],
      [PARTNER_PENDING_ROW],
    ],
    tournaments: [[{ id: 'tournament-1' }], [TOURNAMENT_ROW]],
    divisions: [[{ id: 'division-1' }], [DIVISION_ROW]],
    rosters: [[{ userId: 'leader-1' }], []],
    profiles: [[{ gender: 'MALE' }], [{ gender: 'MALE' }]],
    'divisions+tournaments': [[CAPACITY_OWNER_ROW]],
    'participants+rosters': [entries],
  };
}

const COMPLETE_PAIR: Row = {
  scopeId: 'division-1',
  tournamentId: 'tournament-1',
  teamStatus: 'COMPLETE',
  rosterMemberCount: 2,
  customResponses: null,
};

const LONE_MEMBER: Row = {
  scopeId: 'division-1',
  tournamentId: 'tournament-1',
  teamStatus: 'PENDING_PARTNER',
  rosterMemberCount: 1,
  customResponses: null,
};

const UNASSIGNED_PARTNER_PENDING_ROW: Row = {
  ...PARTNER_PENDING_ROW,
  tournamentDivisionId: null,
};

const TOURNAMENT_SCOPED_PAIR: Row = {
  scopeId: 'tournament-1',
  divisionId: null,
  tournamentId: 'tournament-1',
  teamStatus: 'COMPLETE',
  rosterMemberCount: 2,
  customResponses: null,
};

describe('accepting a doubles partner consumes one member slot', () => {
  it('admits the partner that exactly fills a half-open four-team division', async () => {
    const harness = createHarness(
      partnerInviteQueues([
        COMPLETE_PAIR,
        COMPLETE_PAIR,
        COMPLETE_PAIR,
        LONE_MEMBER,
      ]),
    );

    await expect(
      createRepository(harness).acceptPartnerInvite('participant-1', 'partner-1'),
    ).resolves.toMatchObject({ teamStatus: 'COMPLETE' });

    expect(
      harness.inserts.filter((insert) => insert.table === 'rosters'),
    ).toHaveLength(1);
  });

  it('rejects the overflowing partner and writes no roster row', async () => {
    const harness = createHarness(
      partnerInviteQueues([
        COMPLETE_PAIR,
        COMPLETE_PAIR,
        COMPLETE_PAIR,
        LONE_MEMBER,
        LONE_MEMBER,
      ]),
    );

    await expect(
      createRepository(harness).acceptPartnerInvite('participant-1', 'partner-1'),
    ).rejects.toThrow(BadRequestException);

    expect(harness.inserts).toHaveLength(0);
    expect(harness.updates).toHaveLength(0);
  });

  it('locks the capacity owner before touching the participant row', async () => {
    const harness = createHarness(
      partnerInviteQueues([
        COMPLETE_PAIR,
        COMPLETE_PAIR,
        COMPLETE_PAIR,
        LONE_MEMBER,
      ]),
    );

    await createRepository(harness).acceptPartnerInvite(
      'participant-1',
      'partner-1',
    );

    expect(harness.lockedTables.slice(0, 2)).toEqual([
      'tournaments',
      'divisions',
    ]);
  });
});

describe('open doubles partner invitations', () => {
  it('accepts a mixed-gender pair without a gender restriction', async () => {
    const queues = partnerInviteQueues([COMPLETE_PAIR]);
    queues.divisions[1] = [{ ...DIVISION_ROW, genderRestriction: null }];
    queues.profiles = [[{ gender: 'MALE' }], [{ gender: 'FEMALE' }]];
    const harness = createHarness(queues);

    await expect(
      createRepository(harness).acceptPartnerInvite(
        'participant-1',
        'partner-1',
      ),
    ).resolves.toMatchObject({ teamStatus: 'COMPLETE' });

    expect(
      harness.inserts.filter((insert) => insert.table === 'rosters'),
    ).toHaveLength(1);
  });

  it('accepts participants with unset profile gender', async () => {
    const queues = partnerInviteQueues([COMPLETE_PAIR]);
    queues.divisions[1] = [{ ...DIVISION_ROW, genderRestriction: null }];
    queues.profiles = [[{ gender: null }], [{ gender: null }]];
    const harness = createHarness(queues);

    await expect(
      createRepository(harness).acceptPartnerInvite(
        'participant-1',
        'partner-1',
      ),
    ).resolves.toMatchObject({ teamStatus: 'COMPLETE' });

    expect(
      harness.inserts.filter((insert) => insert.table === 'rosters'),
    ).toHaveLength(1);
  });
});

describe('promoting a waitlisted doubles row', () => {
  const WAITLISTED_ROW: Row = {
    id: 'participant-9',
    tournamentId: 'tournament-1',
    tournamentDivisionId: 'division-1',
    registeredAt: new Date('2026-01-01T00:00:00Z'),
    teamStatus: 'WAITLISTED',
    teamInviteToken: null,
    footballTeamId: null,
    isPaid: true,
    entryFeeAtRegistration: '0',
  };

  const promotionQueues = (entries: Row[]): Record<string, Row[][]> => ({
    participants: [[WAITLISTED_ROW]],
    tournaments: [
      [
        {
          id: 'tournament-1',
          matchType: 'DOUBLES',
          entryFee: 0,
          tournamentConfig: null,
        },
      ],
      [{ id: 'tournament-1' }],
    ],
    divisions: [[{ matchType: 'DOUBLES' }], [{ id: 'division-1' }]],
    rosters: [[{ count: 1 }]],
    'divisions+tournaments': [[CAPACITY_OWNER_ROW]],
    'participants+rosters': [entries],
    // A division with no limit of its own promotes against the tournament
    // cap, whose occupancy read joins the division for each row's format.
    'divisions+participants+rosters': [entries],
  });

  function promote(harness: Harness) {
    const repository = createRepository(harness);
    return (
      repository as unknown as {
        promoteNextWaitlisted: (
          tx: unknown,
          tournamentId: string,
          divisionId?: string,
        ) => Promise<Row | null>;
      }
    ).promoteNextWaitlisted(harness.tx, 'tournament-1', 'division-1');
  }

  it('promotes the row when the freed slot fits an unpaired member', async () => {
    const harness = createHarness(
      promotionQueues([COMPLETE_PAIR, COMPLETE_PAIR, COMPLETE_PAIR]),
    );

    await expect(promote(harness)).resolves.toMatchObject({
      teamStatus: 'PENDING_PARTNER',
    });
  });

  it('leaves the row waitlisted instead of overfilling a full division', async () => {
    const harness = createHarness(
      promotionQueues([
        COMPLETE_PAIR,
        COMPLETE_PAIR,
        COMPLETE_PAIR,
        COMPLETE_PAIR,
      ]),
    );

    await expect(promote(harness)).resolves.toBeNull();
    expect(harness.updates).toHaveLength(0);
  });

  it('leaves the row waitlisted when only a full tournament cap applies', async () => {
    // The division sets no limit, so the two-team tournament cap is the only
    // one left, and two pairs already hold both teams.
    const harness = createHarness({
      ...promotionQueues([COMPLETE_PAIR, COMPLETE_PAIR]),
      tournaments: [
        [
          {
            id: 'tournament-1',
            matchType: 'DOUBLES',
            entryFee: 0,
            tournamentConfig: null,
            maxParticipants: 2,
          },
        ],
        [{ id: 'tournament-1' }],
        [
          {
            id: 'tournament-1',
            matchType: 'DOUBLES',
            entryFee: 0,
            tournamentConfig: null,
            maxParticipants: 2,
          },
        ],
      ],
      'divisions+tournaments': [
        [{ ...CAPACITY_OWNER_ROW, maxParticipants: null }],
      ],
    });

    await expect(promote(harness)).resolves.toBeNull();
    expect(harness.updates).toHaveLength(0);
  });
});

describe('a division without its own limit still obeys the tournament cap', () => {
  function scopedPartnerQueues(options: {
    entries: Row[];
    tournamentMaxParticipants: number;
    divisionMaxParticipants: number | null;
  }): Record<string, Row[][]> {
    const tournament: Row = {
      ...TOURNAMENT_ROW,
      maxParticipants: options.tournamentMaxParticipants,
    };
    return {
      participants: [
        [{ tournamentId: 'tournament-1', tournamentDivisionId: 'division-1' }],
        [PARTNER_PENDING_ROW],
      ],
      tournaments: [[{ id: 'tournament-1' }], [tournament], [tournament]],
      divisions: [[{ id: 'division-1' }], [DIVISION_ROW]],
      rosters: [[{ userId: 'leader-1' }], []],
      profiles: [[{ gender: 'MALE' }], [{ gender: 'MALE' }]],
      'divisions+tournaments': [
        [
          {
            ...CAPACITY_OWNER_ROW,
            maxParticipants: options.divisionMaxParticipants,
          },
        ],
      ],
      'participants+rosters': [options.entries],
      // An uncapped division falls back to the tournament cap, whose
      // occupancy read joins the division for each row's format.
      'divisions+participants+rosters': [options.entries],
    };
  }

  it('rejects the partner and writes no roster row when the tournament is full', async () => {
    // Two pairs already hold both tournament teams.
    const harness = createHarness(
      scopedPartnerQueues({
        entries: [COMPLETE_PAIR, COMPLETE_PAIR],
        tournamentMaxParticipants: 2,
        divisionMaxParticipants: null,
      }),
    );

    await expect(
      createRepository(harness).acceptPartnerInvite('participant-1', 'partner-1'),
    ).rejects.toThrow(BadRequestException);

    expect(harness.inserts).toHaveLength(0);
    expect(harness.updates).toHaveLength(0);
  });

  it('still admits the partner when the tournament cap has room left', async () => {
    const harness = createHarness(
      scopedPartnerQueues({
        entries: [COMPLETE_PAIR],
        tournamentMaxParticipants: 2,
        divisionMaxParticipants: null,
      }),
    );

    await expect(
      createRepository(harness).acceptPartnerInvite('participant-1', 'partner-1'),
    ).resolves.toMatchObject({ teamStatus: 'COMPLETE' });

    expect(
      harness.inserts.filter((insert) => insert.table === 'rosters'),
    ).toHaveLength(1);
  });
});

/**
 * A doubles pair that belongs to the tournament only, so the capacity claim has
 * to fall back to the tournament cap and its occupancy read is tournament-wide.
 */
function joinWithoutDivisionQueues(): Record<string, Row[][]> {
  const tournament: Row = { ...TOURNAMENT_ROW, maxParticipants: 4 };
  const pending: Row = {
    ...UNASSIGNED_PARTNER_PENDING_ROW,
    teamInviteToken: 'invite-1',
  };
  return {
    tournaments: [[tournament], [tournament]],
    participants: [[pending]],
    rosters: [[{ userId: 'leader-1' }]],
    profiles: [[{ gender: 'MALE' }], [{ gender: 'MALE' }]],
    // The "already registered elsewhere" roster lookup.
    'participants+rosters': [[]],
    'divisions+participants+rosters': [[TOURNAMENT_SCOPED_PAIR]],
  };
}

function openDivisionJoinQueues(
  leaderGender: string | null,
  partnerGender: string | null,
): Record<string, Row[][]> {
  const tournament = { ...TOURNAMENT_ROW };
  const pending = { ...PARTNER_PENDING_ROW, teamInviteToken: 'invite-1' };
  const openDivision = { ...DIVISION_ROW, genderRestriction: null };
  return {
    tournaments: [[tournament], [tournament]],
    participants: [[pending]],
    divisions: [[openDivision]],
    rosters: [[{ userId: 'leader-1' }]],
    profiles: [[{ gender: leaderGender }], [{ gender: partnerGender }]],
    'participants+rosters': [[]],
    'divisions+tournaments': [[CAPACITY_OWNER_ROW]],
    'divisions+participants+rosters': [[COMPLETE_PAIR]],
  };
}

describe('joining open doubles teams', () => {
  it('accepts a mixed-gender pair without a gender restriction', async () => {
    const harness = createHarness(openDivisionJoinQueues('MALE', 'FEMALE'));

    await expect(
      createRepository(harness).joinTeam(
        'tournament-1',
        'partner-1',
        'participant-1',
        'invite-1',
      ),
    ).resolves.toMatchObject({ participant: { teamStatus: 'COMPLETE' } });

    expect(
      harness.inserts.filter((insert) => insert.table === 'rosters'),
    ).toHaveLength(1);
  });

  it('accepts a pair when both profiles have no gender value', async () => {
    const harness = createHarness(openDivisionJoinQueues(null, null));

    await expect(
      createRepository(harness).joinTeam(
        'tournament-1',
        'partner-1',
        'participant-1',
        'invite-1',
      ),
    ).resolves.toMatchObject({ participant: { teamStatus: 'COMPLETE' } });

    expect(
      harness.inserts.filter((insert) => insert.table === 'rosters'),
    ).toHaveLength(1);
  });
});

describe('a capacity claim locks its owner row before reading occupancy', () => {
  it('locks the tournament owner before a tournament-scoped partner join', async () => {
    const harness = createHarness(joinWithoutDivisionQueues());

    await expect(
      createRepository(harness).joinTeam(
        'tournament-1',
        'partner-1',
        'participant-1',
        'invite-1',
      ),
    ).resolves.toMatchObject({
      participant: { teamStatus: 'COMPLETE' },
    });

    expect(
      harness.inserts.filter((insert) => insert.table === 'rosters'),
    ).toHaveLength(1);

    const ownerLock = harness.events.indexOf('lockOwner:tournaments');
    const occupancyRead = harness.events.indexOf('read:occupancy');
    expect(ownerLock).toBeGreaterThanOrEqual(0);
    expect(ownerLock).toBeLessThan(occupancyRead);
  });
  it('keeps open team-sport joins off the exclusive tournament lock', async () => {
    const tournament: Row = {
      ...TOURNAMENT_ROW,
      tournamentConfig: { teamSize: 5, maxTeamSize: 5 },
    };
    const pending: Row = {
      ...UNASSIGNED_PARTNER_PENDING_ROW,
      teamInviteToken: 'invite-1',
    };
    const harness = createHarness({
      tournaments: [[tournament], [tournament]],
      participants: [[pending]],
      rosters: [[{ userId: 'leader-1' }], [{ total: 4 }]],
      profiles: [[{ gender: 'MALE' }], [{ gender: 'MALE' }]],
      'participants+rosters': [[]],
    });

    await createRepository(harness).joinTeam(
      'tournament-1',
      'partner-1',
      'participant-1',
      'invite-1',
    );

    expect(harness.inserts.filter((insert) => insert.table === 'rosters')).toHaveLength(1);
    expect(harness.events).not.toContain('lock:tournaments');
    expect(harness.events).not.toContain('lockOwner:tournaments');
    expect(harness.events).not.toContain('read:occupancy');
  });

  it('locks the tournament owner before a tournament-scoped partner invite', async () => {
    const tournament: Row = { ...TOURNAMENT_ROW, maxParticipants: 4 };
    const harness = createHarness({
      participants: [
        [{ tournamentId: 'tournament-1', tournamentDivisionId: null }],
        [UNASSIGNED_PARTNER_PENDING_ROW],
      ],
      tournaments: [[{ id: 'tournament-1' }], [tournament], [tournament]],
      rosters: [[{ userId: 'leader-1' }], []],
      profiles: [[{ gender: 'MALE' }], [{ gender: 'MALE' }]],
      'divisions+participants+rosters': [[TOURNAMENT_SCOPED_PAIR]],
    });

    await expect(
      createRepository(harness).acceptPartnerInvite('participant-1', 'partner-1'),
    ).resolves.toMatchObject({ teamStatus: 'COMPLETE' });

    const ownerLock = harness.events.indexOf('lockOwner:tournaments');
    expect(ownerLock).toBeGreaterThanOrEqual(0);
    expect(ownerLock).toBeLessThan(harness.events.indexOf('read:occupancy'));
  });
});