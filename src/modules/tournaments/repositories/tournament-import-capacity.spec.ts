import { BadRequestException, ConflictException } from '@nestjs/common';
import * as schema from '../../../database/schema';
import {
  AddAthleteCandidateDto,
  AddAthleteDirectDto,
  ListAddAthleteCandidatesQueryDto,
} from '../dto/add-athlete.dto';
import { TournamentImportRepository } from './tournament-import.repository';

// Drizzle tables are object keys, so the lookup must be by identity.
const TABLE_KEYS = new Map<unknown, string>([
  [schema.tournaments, 'tournaments'],
  [schema.tournamentDivisions, 'divisions'],
  [schema.tournamentParticipants, 'participants'],
  [schema.tournamentRosters, 'rosters'],
  [schema.profiles, 'profiles'],
  [schema.users, 'users'],
[schema.friendships, 'friendships'],
[schema.communities, 'communities'],
[schema.communityMembers, 'communityMembers'],
[schema.userBans, 'userBans'],
]);

type Row = Record<string, unknown>;

function createHarness(queues: Record<string, Row[][]>) {
  const inserts: Array<{ table: string; values: Row }> = [];
  const selections: Array<{ key: string; locked: boolean }> = [];
  const lockCounter = { count: 0 };

  const takeRows = (key: string): Row[] => {
    const queue = queues[key];
    if (!queue || queue.length === 0) return [];
    return queue.length === 1 ? queue[0] : queue.shift()!;
  };

  const tableKey = (tables: string[]): string =>
    [...new Set(tables)].sort().join('+');

  // The fake tx never evaluates WHERE, so a row is projected onto the columns
  // the query asked for — only those fields, exactly as the real projection
  // would return. An occupancy row additionally reads under its division for a
  // division read and under its tournament for a tournament read.
  const projectRow = (fields: Record<string, unknown>, row: Row): Row => {
    const projected: Row = {};
    for (const [key, column] of Object.entries(fields)) {
      if (column === schema.tournamentParticipants.tournamentDivisionId)
        projected[key] =
          row.divisionId !== undefined ? row.divisionId : row.scopeId;
      else if (column === schema.tournamentParticipants.tournamentId)
        projected[key] = row.tournamentId ?? row.scopeId ?? null;
      else projected[key] = row[key];
    }
    return projected;
  };

  const tx = {
    select: (fields?: Record<string, unknown>) => {
      const tables: string[] = [];
      const query: Record<string, unknown> = {};
      let locked = false;

      const record =
        (fn: (...args: unknown[]) => unknown) =>
        (...args: unknown[]) => {
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
      query.for = () => {
        lockCounter.count += 1;
        locked = true;
        return query;
      };
      query.then = (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown,
      ) =>
        Promise.resolve()
          .then(() => {
            const key = tableKey(tables);
            selections.push({ key, locked });
            const rows = takeRows(key);
            return fields ? rows.map((row) => projectRow(fields, row)) : rows;
          })
          .then(resolve, reject);

      return query;
    },
    insert: (table: unknown) => {
      const name = TABLE_KEYS.get(table) ?? 'unknown';
      return {
        values: (values: Row) => {
          inserts.push({ table: name, values });
          return {
            returning: async () => [
              { id: `participant-${inserts.length}`, ...values },
            ],
          };
        },
      };
    },
  };

  return {
    tx: tx as unknown as Record<string, unknown>,
    inserts,
    selections,
    lockCount: () => lockCounter.count,
  };
}

function createRepository(tx: unknown) {
  const db = {
    transaction: async (callback: (inner: unknown) => unknown) =>
      callback(tx),
    select: (fields?: Record<string, unknown>) =>
      (
        tx as {
          select: (value?: Record<string, unknown>) => unknown;
        }
      ).select(fields),
  };
  const paymentRepository = {
    resolveDivisionEntryFee: jest.fn().mockResolvedValue(0),
  };

  return new TournamentImportRepository(
    db as never,
    paymentRepository as never,
  );
}

describe('TournamentImportRepository.previewRosterImport', () => {
  it('returns row and capacity verdicts without writes or capacity locks', async () => {
    const tournament = {
      id: 'tournament-1',
      matchType: 'SINGLES',
      maxParticipants: 4,
      tournamentConfig: null,
      entryFee: 0,
    };
    const { tx, inserts, lockCount } = createHarness({
      tournaments: [[tournament], [tournament]],
      participants: [[]],
      users: [[]],
      'participants+rosters': [[]],
    });
    const repository = createRepository(tx);

    const result = await repository.previewRosterImport('tournament-1', {
      participants: [
        {
          teamName: 'Guest entrant',
          player1Name: 'Guest entrant',
          player1Email: 'guest@example.test',
          source: 'EXCEL',
        },
      ],
    });

    expect(result.rows[0]).toMatchObject({
      rowIndex: 0,
      status: ['NOT_FOUND'],
      isEligible: true,
      capacityDelta: 1,
    });
    expect(result.requestedTeamSlots).toBe(1);
    expect(result.capacityRemaining).toBe(4);
    expect(lockCount()).toBe(0);
    expect(inserts).toHaveLength(0);
  });
});

const PAIR = {
  teamName: 'Cặp đôi',
  player1Name: 'Nguyen Van A',
  player1Email: 'player-one@example.test',
  player2Name: 'Nguyen Van B',
  player2Email: 'player-two@example.test',
  autoApprove: true,
  source: 'GOOGLE_FORM' as const,
};

const PAIR_TWO = {
  teamName: 'Cặp đôi thứ hai',
  player1Name: 'Nguyen Van C',
  player1Email: 'player-three@example.test',
  player2Name: 'Nguyen Van D',
  player2Email: 'player-four@example.test',
  autoApprove: true,
  source: 'GOOGLE_FORM' as const,
};

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

const SOLO_ROSTER_ENTRY = {
  teamName: 'Nguyen Van A',
  player1Name: 'Nguyen Van A',
  player1Email: 'solo@example.test',
  autoApprove: true,
  source: 'EXCEL' as const,
};

const SOLO_ROSTER_ENTRY_TWO = {
  ...SOLO_ROSTER_ENTRY,
  teamName: 'Nguyen Van B',
  player1Name: 'Nguyen Van B',
  player1Email: 'solo-two@example.test',
};

const SOLO_ROSTER_ENTRY_THREE = {
  ...SOLO_ROSTER_ENTRY,
  teamName: 'Nguyen Van C',
  player1Name: 'Nguyen Van C',
  player1Email: 'solo-three@example.test',
};

function divisionImportQueues(options: {
  entries: Row[];
  tournamentConfig?: unknown;
}): Record<string, Row[][]> {
  return {
    tournaments: [
      [
        {
          id: 'tournament-1',
          matchType: 'DOUBLES',
          maxParticipants: 4,
          tournamentConfig: options.tournamentConfig ?? null,
          entryFee: 0,
        },
      ],
      [{ id: 'tournament-1' }],
    ],
    divisions: [
      [
        {
          id: 'division-1',
          tournamentId: 'tournament-1',
          matchType: 'DOUBLES',
        },
      ],
      [{ id: 'division-1' }],
    ],
    'divisions+tournaments': [
      [
        {
          id: 'division-1',
          matchType: 'DOUBLES',
          maxParticipants: 4,
          tournamentConfig: options.tournamentConfig ?? null,
        },
      ],
    ],
    'participants+rosters': [options.entries],
  };
}

describe('bulk doubles import capacity', () => {
  it('weighs unpaired members as half a team instead of one row each', async () => {
    // Four unpaired doubles members are four rows but only two team slots, so
    // importing two more pairs exactly fills the four-team cap.
    const harness = createHarness(
      divisionImportQueues({
        entries: [LONE_MEMBER, LONE_MEMBER, LONE_MEMBER, LONE_MEMBER],
      }),
    );

    const result = await createRepository(harness.tx).importRosterRows(
      'tournament-1',
      'organizer-1',
      [PAIR, PAIR_TWO],
      'division-1',
    );

    expect(result.importedCount).toBe(2);
    expect(
      harness.inserts.filter((insert) => insert.table === 'participants'),
    ).toHaveLength(2);
  });

  it('rejects an import that would overflow the division and writes nothing', async () => {
    const harness = createHarness(
      divisionImportQueues({
        entries: [COMPLETE_PAIR, COMPLETE_PAIR, COMPLETE_PAIR],
      }),
    );

    await expect(
      createRepository(harness.tx).importRosterRows(
        'tournament-1',
        'organizer-1',
        [PAIR, PAIR_TWO],
        'division-1',
      ),
    ).rejects.toThrow(BadRequestException);

    expect(harness.inserts).toHaveLength(0);
  });

  it('counts a football squad as one whole team, not half a team per athlete', async () => {
    // Three complete squads fill three of four teams even though each roster
    // holds eleven athletes.
    const harness = createHarness(
      divisionImportQueues({
        entries: [COMPLETE_PAIR, COMPLETE_PAIR, COMPLETE_PAIR],
        tournamentConfig: { teamSize: 11, minTeamSize: 7 },
      }),
    );

    const result = await createRepository(harness.tx).importRosterRows(
      'tournament-1',
      'organizer-1',
      [PAIR],
      'division-1',
    );

    expect(result.importedCount).toBe(1);
  });

  it('never blocks a tournament without a configured limit', async () => {
    const uncappedTournament: Row = {
      id: 'tournament-1',
      matchType: 'DOUBLES',
      maxParticipants: null,
      tournamentConfig: null,
      entryFee: 0,
    };
    const harness = createHarness({
      tournaments: [
        [uncappedTournament],
        [{ id: 'tournament-1' }],
        [uncappedTournament],
      ],
      'participants+rosters': [Array.from({ length: 40 }, () => COMPLETE_PAIR)],
      // A tournament-wide occupancy read also carries each row's division
      // format, so its rows arrive under the joined read.
      'divisions+participants+rosters': [
        Array.from({ length: 40 }, () => COMPLETE_PAIR),
      ],
    });

    const result = await createRepository(harness.tx).importRosterRows(
      'tournament-1',
      'organizer-1',
      [PAIR],
    );

    expect(result.importedCount).toBe(1);
  });
});

describe('imported pair metadata survives caller-supplied form answers', () => {
  it('keeps both the form answers and the validated pair metadata', async () => {
    const harness = createHarness(divisionImportQueues({ entries: [] }));

    await createRepository(harness.tx).importRosterRows(
      'tournament-1',
      'organizer-1',
      [
        {
          ...PAIR,
          customResponses: { shirtSize: 'L', note: 'Đăng ký qua Google Form' },
        },
      ],
      'division-1',
    );

    const participantInsert = harness.inserts.find(
      (insert) => insert.table === 'participants',
    );
    expect(participantInsert?.values.customResponses).toEqual({
      shirtSize: 'L',
      note: 'Đăng ký qua Google Form',
      importedFrom: 'GOOGLE_FORM',
      player1Email: 'player-one@example.test',
      player2Name: 'Nguyen Van B',
      player2Email: 'player-two@example.test',
    });
    // Neither contact has an account, so the pair exists only as metadata.
    expect(
      harness.inserts.filter((insert) => insert.table === 'rosters'),
    ).toHaveLength(0);
  });

  it('lets the validated second player win over a same-named form answer', async () => {
    const harness = createHarness(divisionImportQueues({ entries: [] }));

    await createRepository(harness.tx).importRosterRows(
      'tournament-1',
      'organizer-1',
      [{ ...PAIR, customResponses: { player2Name: 'Ten nhập sai' } }],
      'division-1',
    );

    const participantInsert = harness.inserts.find(
      (insert) => insert.table === 'participants',
    );
    expect((participantInsert?.values.customResponses as Row).player2Name).toBe(
      'Nguyen Van B',
    );
  });
});

describe('bulk singles import capacity', () => {
  function singlesImportQueues(): Record<string, Row[][]> {
    const tournament: Row = {
      id: 'tournament-1',
      matchType: 'SINGLES',
      maxParticipants: 2,
      tournamentConfig: null,
      entryFee: 0,
    };
    return {
      tournaments: [[tournament], [{ id: 'tournament-1' }], [tournament]],
      divisions: [
        [
          {
            id: 'division-singles',
            tournamentId: 'tournament-1',
            matchType: 'SINGLES',
          },
        ],
        [{ id: 'division-singles' }],
      ],
      'divisions+tournaments': [
        [
          {
            id: 'division-singles',
            matchType: 'SINGLES',
            maxParticipants: 2,
            tournamentConfig: null,
          },
        ],
      ],
      'participants+rosters': [[]],
    };
  }

  it('rejects three singles rows against an empty two-slot cap and writes nothing', async () => {
    // Each singles row owns a whole team, so three rows need three of two slots.
    const harness = createHarness(singlesImportQueues());

    await expect(
      createRepository(harness.tx).importRosterRows(
        'tournament-1',
        'organizer-1',
        [SOLO_ROSTER_ENTRY, SOLO_ROSTER_ENTRY_TWO, SOLO_ROSTER_ENTRY_THREE],
        'division-singles',
      ),
    ).rejects.toThrow(BadRequestException);

    expect(harness.inserts).toHaveLength(0);
  });

  it('admits the two singles rows that exactly fill the cap', async () => {
    const harness = createHarness(singlesImportQueues());

    const result = await createRepository(harness.tx).importRosterRows(
      'tournament-1',
      'organizer-1',
      [SOLO_ROSTER_ENTRY, SOLO_ROSTER_ENTRY_TWO],
      'division-singles',
    );

    expect(result.importedCount).toBe(2);
  });
});

describe('import into a division that has no limit of its own', () => {
  function tournamentCappedQueues(options: {
    entries: Row[];
    tournamentMaxParticipants: number;
  }): Record<string, Row[][]> {
    const tournament: Row = {
      id: 'tournament-1',
      matchType: 'DOUBLES',
      maxParticipants: options.tournamentMaxParticipants,
      tournamentConfig: null,
      entryFee: 0,
    };
    return {
      tournaments: [[tournament], [{ id: 'tournament-1' }], [tournament]],
      divisions: [
        [
          {
            id: 'division-1',
            tournamentId: 'tournament-1',
            matchType: 'DOUBLES',
          },
        ],
        [{ id: 'division-1' }],
      ],
      'divisions+tournaments': [
        [
          {
            id: 'division-1',
            // The division sets no limit, so its parent tournament governs it;
            // the division row has to name that parent.
            tournamentId: 'tournament-1',
            matchType: 'DOUBLES',
            maxParticipants: null,
            tournamentConfig: null,
          },
        ],
      ],
      'participants+rosters': [options.entries],
      // An uncapped division falls back to the tournament cap, whose occupancy
      // read joins the division to weigh each row by its own format.
      'divisions+participants+rosters': [options.entries],
    };
  }

  it('rejects a full tournament instead of letting an uncapped division through', async () => {
    // Two pairs already hold both tournament teams; two more cannot be added.
    const harness = createHarness(
      tournamentCappedQueues({
        entries: [COMPLETE_PAIR, COMPLETE_PAIR],
        tournamentMaxParticipants: 2,
      }),
    );

    await expect(
      createRepository(harness.tx).importRosterRows(
        'tournament-1',
        'organizer-1',
        [PAIR, PAIR_TWO],
        'division-1',
      ),
    ).rejects.toThrow(BadRequestException);

    expect(harness.inserts).toHaveLength(0);
  });

  it('still imports when the tournament cap has room left', async () => {
    const harness = createHarness(
      tournamentCappedQueues({
        entries: [COMPLETE_PAIR],
        tournamentMaxParticipants: 4,
      }),
    );

    const result = await createRepository(harness.tx).importRosterRows(
      'tournament-1',
      'organizer-1',
      [PAIR, PAIR_TWO],
      'division-1',
    );

    expect(result.importedCount).toBe(2);
  });
});

type AddAthleteRepository = {
  listAddAthleteCandidates(
    tournamentId: string,
    organizerUserId: string,
    communityId: string | null,
    dto: ListAddAthleteCandidatesQueryDto,
  ): Promise<{ items: Array<{ userId: string; fullName: string }> }>;
  addAthleteCandidate(
    tournamentId: string,
    organizerUserId: string,
    dto: AddAthleteCandidateDto,
  ): Promise<Row>;
  addDirectAthlete(
    tournamentId: string,
    organizerUserId: string,
    dto: AddAthleteDirectDto,
  ): Promise<Row>;
};

function createAddAthleteRepository(tx: unknown): AddAthleteRepository {
  return createRepository(tx) as unknown as AddAthleteRepository;
}

function addAthleteQueues(options: {
  source: 'FRIENDS' | 'CLUB';
  relationRows: Row[];
  duplicateRows: Row[];
  occupancyRows: Row[];
  divisionLimit?: number;
}): Record<string, Row[][]> {
  const tournament: Row = {
    id: 'tournament-1',
    communityId: 'community-1',
    status: 'REGISTRATION_OPEN',
    isRegistrationLocked: false,
    matchType: 'SINGLES',
    maxParticipants: 4,
    tournamentConfig: null,
    entryFee: 0,
  };
  const division: Row = {
    id: 'division-1',
    tournamentId: 'tournament-1',
    matchType: 'SINGLES',
    maxParticipants: options.divisionLimit ?? 4,
    tournamentConfig: null,
  };
  const queues: Record<string, Row[][]> = {
    tournaments: [[tournament], [tournament]],
    divisions: [[division], [division]],
    'divisions+tournaments': [[division]],
    'profiles+users': [[{ id: 'athlete-1', fullName: 'VĐV thử nghiệm' }]],
    'participants+rosters': [
      options.duplicateRows,
      options.occupancyRows,
    ],
  };

  if (options.source === 'FRIENDS') {
    queues.friendships = [options.relationRows];
  } else {
    queues['communities+communityMembers'] = [options.relationRows];
  }
  return queues;
}

describe('TournamentImportRepository organizer add-athlete flow', () => {
  const candidateDto = Object.assign(new AddAthleteCandidateDto(), {
    source: 'FRIENDS',
    userId: 'athlete-1',
    tournamentDivisionId: 'division-1',
  });

  it('projects approved profile and linked-club image fields without private data', async () => {
    const harness = createHarness({
      'communities+profiles+users': [
        [
          {
            userId: 'athlete-1',
            fullName: 'VĐV thử nghiệm',
            avatarUrl: 'https://avatars.example.test/athlete.png',
            logoUrl: 'https://clubs.example.test/community.png',
            email: 'private@example.test',
            phoneNumber: '0900000000',
          },
        ],
      ],
    });

    const result = await createAddAthleteRepository(harness.tx)
      .listAddAthleteCandidates(
        'tournament-1',
        'organizer-1',
        'community-1',
        Object.assign(new ListAddAthleteCandidatesQueryDto(), {
          source: 'CLUB',
        }),
      );

    expect(result).toEqual({
      items: [
        {
          userId: 'athlete-1',
          fullName: 'VĐV thử nghiệm',
          avatarUrl: 'https://avatars.example.test/athlete.png',
          logoUrl: 'https://clubs.example.test/community.png',
        },
      ],
    });
  });

  it.each([['FRIENDS'], ['CLUB']] as const)(
    'rejects a stale %s relationship after capacity locks',
    async (source) => {
      const harness = createHarness(
        addAthleteQueues({
          source,
          relationRows: [],
          duplicateRows: [],
          occupancyRows: [],
        }),
      );
      const dto = Object.assign(new AddAthleteCandidateDto(), {
        ...candidateDto,
        source,
      });

      await expect(
        createAddAthleteRepository(harness.tx).addAthleteCandidate(
          'tournament-1',
          'organizer-1',
          dto,
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(harness.inserts).toHaveLength(0);
      expect(harness.selections.slice(0, 2)).toEqual([
        { key: 'tournaments', locked: true },
        { key: 'divisions', locked: true },
      ]);
      expect(harness.selections[2]?.key).toBe('tournaments');
    },
  );

  it('rejects an active roster duplicate without writing another participant', async () => {
    const harness = createHarness(
      addAthleteQueues({
        source: 'FRIENDS',
        relationRows: [{ id: 'friendship-1' }],
        duplicateRows: [{ id: 'participant-existing' }],
        occupancyRows: [],
      }),
    );

    await expect(
      createAddAthleteRepository(harness.tx).addAthleteCandidate(
        'tournament-1',
        'organizer-1',
        candidateDto,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(harness.inserts).toHaveLength(0);
  });

  it('rejects a candidate when the locked division capacity is full', async () => {
    const harness = createHarness(
      addAthleteQueues({
        source: 'FRIENDS',
        relationRows: [{ id: 'friendship-1' }],
        duplicateRows: [],
        occupancyRows: [
          {
            teamStatus: 'PENDING_APPROVAL',
            rosterMemberCount: 1,
            tournamentId: 'tournament-1',
            divisionId: 'division-1',
          },
        ],
        divisionLimit: 1,
      }),
    );

    await expect(
      createAddAthleteRepository(harness.tx).addAthleteCandidate(
        'tournament-1',
        'organizer-1',
        candidateDto,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(harness.inserts).toHaveLength(0);
  });

  it('writes a linked candidate without setting athlete ranking consent', async () => {
    const harness = createHarness(
      addAthleteQueues({
        source: 'FRIENDS',
        relationRows: [{ id: 'friendship-1' }],
        duplicateRows: [],
        occupancyRows: [],
      }),
    );

    const result = await createAddAthleteRepository(harness.tx)
      .addAthleteCandidate('tournament-1', 'organizer-1', candidateDto);
    const participant = harness.inserts.find(
      (insert) => insert.table === 'participants',
    );
    const roster = harness.inserts.find((insert) => insert.table === 'rosters');

    expect(result.participant).toMatchObject({
      participantId: expect.any(String),
      teamStatus: 'PENDING_APPROVAL',
    });
    expect(participant?.values).toMatchObject({
      registeredBy: 'organizer-1',
      teamName: 'VĐV thử nghiệm',
    });
    expect(roster?.values).toMatchObject({ userId: 'athlete-1' });
    expect(roster?.values).not.toHaveProperty('rankingConsentAt');
  });

  it('stores a direct entry as unlinked metadata and checks capacity', async () => {
    const queues: Record<string, Row[][]> = {
      tournaments: [
        [
          {
            id: 'tournament-1',
            status: 'REGISTRATION_OPEN',
            isRegistrationLocked: false,
            matchType: 'DOUBLES',
            maxParticipants: 4,
            tournamentConfig: null,
            entryFee: 0,
          },
        ],
        [
          {
            id: 'tournament-1',
            status: 'REGISTRATION_OPEN',
            isRegistrationLocked: false,
            matchType: 'DOUBLES',
            maxParticipants: 4,
            tournamentConfig: null,
            entryFee: 0,
          },
        ],
      ],
      divisions: [
        [
          {
            id: 'division-1',
            tournamentId: 'tournament-1',
            matchType: 'DOUBLES',
            maxParticipants: 4,
            tournamentConfig: null,
          },
        ],
        [
          {
            id: 'division-1',
            tournamentId: 'tournament-1',
            matchType: 'DOUBLES',
            maxParticipants: 4,
            tournamentConfig: null,
          },
        ],
      ],
      'divisions+tournaments': [
        [
          {
            id: 'division-1',
            tournamentId: 'tournament-1',
            matchType: 'DOUBLES',
            maxParticipants: 4,
            tournamentConfig: null,
          },
        ],
      ],
      'participants+rosters': [[]],
    };
    const harness = createHarness(queues);

    await createAddAthleteRepository(harness.tx).addDirectAthlete(
      'tournament-1',
      'organizer-1',
      Object.assign(new AddAthleteDirectDto(), {
        name: 'Khách trực tiếp',
        tournamentDivisionId: 'division-1',
      }),
    );

    const participant = harness.inserts.find(
      (insert) => insert.table === 'participants',
    );
    expect(participant?.values).toMatchObject({
      registeredBy: 'organizer-1',
      teamName: 'Khách trực tiếp',
      customResponses: { importedFrom: 'ORGANIZER_DIRECT' },
    });
    expect(
      harness.inserts.filter((insert) => insert.table === 'rosters'),
    ).toHaveLength(0);
  });
});
