import { BadRequestException } from '@nestjs/common';
import * as schema from '../../../database/schema';
import {
  LITE_NO_PAIRABLE_MESSAGE,
  TournamentLiteRepository,
} from './tournament-lite.repository';

type PairingSource = 'UNKNOWN' | 'MANUAL' | 'SYSTEM';

function participant(
  id: string,
  pairingSource: PairingSource = 'UNKNOWN',
  teamStatus = 'PENDING_PARTNER',
) {
  return {
    id,
    tournamentId: 'tournament-1',
    tournamentDivisionId: 'division-1',
    registeredBy: `user-${id}`,
    teamName: id,
    teamStatus,
    teamInviteToken: null,
    pairingSource,
    isPaid: false,
    entryFeeAtRegistration: '0.00',
  };
}

function roster(id: string, participantId: string, userId: string) {
  return { id, participantId, userId, role: 'MAIN' };
}

type QueryBuilder = PromiseLike<unknown> & {
  from: (table: unknown) => QueryBuilder;
  where: (...args: unknown[]) => QueryBuilder;
  innerJoin: (...args: unknown[]) => QueryBuilder;
  limit: (...args: unknown[]) => QueryBuilder;
  for: (...args: unknown[]) => QueryBuilder;
  orderBy: (...args: unknown[]) => QueryBuilder;
};

type UpdateBuilder = QueryBuilder & {
  set: (values: Record<string, unknown>) => UpdateBuilder;
  returning: () => Promise<unknown[]>;
};

type InsertBuilder = {
  values: (values: Record<string, unknown>) => InsertBuilder;
  returning: () => Promise<unknown[]>;
};

function makeQueryBuilder(value: unknown): QueryBuilder {
  const query = {} as QueryBuilder;
  query.from = () => query;
  query.where = () => query;
  query.innerJoin = () => query;
  query.limit = () => query;
  query.for = () => query;
  query.orderBy = () => query;
  query.then = <TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) => Promise.resolve(value).then(onfulfilled, onrejected);
  return query;
}

function makeRepository(
  selectResults: unknown[][],
  participantRows: ReturnType<typeof participant>[] = [],
) {
  let selectIndex = 0;
  let participantUpdateIndex = 0;
  let insertedValues: Record<string, unknown> | undefined;
  const updates: Array<{ table: unknown; values: Record<string, unknown> }> =
    [];
  const insertions: Array<{ table: unknown; values: Record<string, unknown> }> =
    [];
  const auditService = {
    logCreate: jest.fn().mockResolvedValue(undefined),
    logUpdate: jest.fn().mockResolvedValue(undefined),
  };
  const paymentRepository = {
    findCompletedParticipantPaymentInTx: jest.fn().mockResolvedValue(null),
  };

  const makeSelectQuery = () => {
    const index = selectIndex++;
    if (index >= selectResults.length) {
      return makeQueryBuilder(
        Promise.reject(new Error('Unexpected database select')),
      );
    }
    return makeQueryBuilder(selectResults[index]);
  };

  const tx = {
    select: jest.fn(() => makeSelectQuery()),
    update: jest.fn((table: unknown) => {
      let values: Record<string, unknown> = {};
      const query = makeQueryBuilder(undefined) as UpdateBuilder;
      query.set = (nextValues) => {
        values = nextValues;
        updates.push({ table, values });
        return query;
      };
      query.returning = () => {
        if (table !== schema.tournamentParticipants) {
          return Promise.resolve([]);
        }
        const base =
          participantRows[
            Math.min(participantUpdateIndex++, participantRows.length - 1)
          ];
        return Promise.resolve([{ ...base, ...values }]);
      };
      return query;
    }),
    insert: jest.fn((table: unknown) => {
      const query = {} as InsertBuilder;
      query.values = (values) => {
        insertedValues = values;
        insertions.push({ table, values });
        return query;
      };
      query.returning = () =>
        Promise.resolve([
          {
            id: 'new-participant',
            pairingSource: 'UNKNOWN',
            ...insertedValues,
          },
        ]);
      return query;
    }),
  };
  const db = {
    transaction: jest.fn((callback: (transaction: unknown) => unknown) =>
      callback(tx),
    ),
  };
  const repository = new TournamentLiteRepository(
    db as never,
    auditService as never,
    paymentRepository as never,
    {} as never,
  );
  return {
    repository,
    tx,
    updates,
    insertions,
    auditService,
    getSelectCount: () => selectIndex,
  };
}

const doublesTournament = {
  id: 'tournament-1',
  tournamentConfig: { isLite: true },
  matchType: 'DOUBLES',
};

function manualPairSelects(
  p1: ReturnType<typeof participant>,
  p2: ReturnType<typeof participant>,
) {
  return [
    [doublesTournament], // assertLitePairableInTx
    [{ count: 0 }], // no started matches
    [], // lockCapacityOwner
    [p1],
    [p2],
    [roster('r1', p1.id, 'athlete-1')],
    [roster('r2', p2.id, 'athlete-2')],
    [], // account names
    [], // no duplicate roster membership
    [{ tournamentConfig: { isLite: true } }],
  ];
}

describe('TournamentLiteRepository pairing source', () => {
  it('records MANUAL when an organizer pairs participants', async () => {
    const p1 = participant('p1');
    const p2 = participant('p2');
    const state = makeRepository(manualPairSelects(p1, p2), [p1, p2]);

    await state.repository.lockTournamentAndPair(
      'tournament-1',
      'p1',
      'p2',
      'organizer-1',
      'OPEN',
      'Athlete 1 / Athlete 2',
    );

    expect(state.updates).toContainEqual({
      table: schema.tournamentParticipants,
      values: expect.objectContaining({ pairingSource: 'MANUAL' }),
    });
  });

  it('records SYSTEM when RANDOM generation pairs participants', async () => {
    const p1 = participant('p1');
    const p2 = participant('p2');
    const state = makeRepository(
      [
        [doublesTournament],
        [{ count: 0 }],
        [p1, p2],
        [roster('r1', p1.id, 'athlete-1'), roster('r2', p2.id, 'athlete-2')],
        [
          { userId: 'athlete-1', fullName: 'Athlete 1' },
          { userId: 'athlete-2', fullName: 'Athlete 2' },
        ],
        [],
        [p1],
        [p2],
        [roster('r1', p1.id, 'athlete-1')],
        [roster('r2', p2.id, 'athlete-2')],
        [
          { userId: 'athlete-1', gender: null },
          { userId: 'athlete-2', gender: null },
        ],
        [],
        [{ tournamentConfig: { isLite: true } }],
      ],
      [p1, p2],
    );

    const result = await state.repository.generateLitePairsTx(
      'tournament-1',
      'organizer-1',
      'RANDOM',
    );

    expect(result.paired).toHaveLength(1);
    expect(state.updates).toContainEqual({
      table: schema.tournamentParticipants,
      values: expect.objectContaining({ pairingSource: 'SYSTEM' }),
    });
  });

  it.each(['SYSTEM', 'UNKNOWN'] as const)(
    'rejects unpairing a %s pair before any roster or audit write',
    async (pairingSource) => {
      const existingPair = participant('pair-1', pairingSource, 'COMPLETE');
      const state = makeRepository([[existingPair]], [existingPair]);

      await expect(
        state.repository.unpairParticipantInTx(
          state.tx as never,
          'tournament-1',
          existingPair.id,
          'organizer-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(state.getSelectCount()).toBe(1);
      expect(state.updates).toHaveLength(0);
      expect(state.insertions).toHaveLength(0);
      expect(state.auditService.logCreate).not.toHaveBeenCalled();
      expect(state.auditService.logUpdate).not.toHaveBeenCalled();
    },
  );

  it('unpairs MANUAL and allows a subsequent manual pairing', async () => {
    const existingPair = {
      ...participant('pair-1', 'MANUAL', 'COMPLETE'),
      registeredBy: 'athlete-1',
    };
    const leader = roster('r1', existingPair.id, 'athlete-1');
    const partner = roster('r2', existingPair.id, 'athlete-2');
    const state = makeRepository(
      [
        [existingPair],
        [leader, partner],
        [{ fullName: 'Athlete 1' }],
        [{ fullName: 'Athlete 2' }],
      ],
      [existingPair],
    );

    const result = await state.repository.unpairParticipantInTx(
      state.tx as never,
      'tournament-1',
      existingPair.id,
      'organizer-1',
    );

    expect(result.leader.pairingSource).toBe('UNKNOWN');
    expect(result.partner.pairingSource).toBe('UNKNOWN');
    expect(result.leader.teamInviteToken).toBeNull();
    expect(result.partner.teamInviteToken).toBeNull();

    const singles = [result.leader, result.partner].map((single, index) => ({
      ...single,
      id: index === 0 ? 'single-1' : 'single-2',
      registeredBy: index === 0 ? 'athlete-1' : 'athlete-2',
      teamStatus: 'PENDING_PARTNER',
    }));
    const rePairState = makeRepository(
      manualPairSelects(singles[0], singles[1]),
      singles,
    );

    await rePairState.repository.lockTournamentAndPair(
      'tournament-1',
      'single-1',
      'single-2',
      'organizer-1',
      'OPEN',
      'Athlete 1 / Athlete 2',
    );

    expect(rePairState.updates).toContainEqual({
      table: schema.tournamentParticipants,
      values: expect.objectContaining({ pairingSource: 'MANUAL' }),
    });
  });
});

describe('TournamentLiteRepository guest athletes', () => {
  const guestSide = () => ({
    ...participant('a-guest'),
    teamName: 'Khách A',
    registeredBy: 'organizer-1',
    customResponses: {
      importedFrom: 'ORGANIZER_DIRECT',
      player1Email: 'a@example.test',
    },
  });
  const accountSide = () => ({ ...participant('acct'), customResponses: null });

  function guestPairSelects(guest = guestSide()) {
    const p1 = guest;
    const p2 = accountSide();
    return {
      p1,
      p2,
      selects: [
        [doublesTournament],
        [{ count: 0 }],
        [], // lockCapacityOwner
        [p1],
        [p2],
        [], // a guest has no roster
        [roster('r2', p2.id, 'athlete-2')],
        [{ userId: 'athlete-2', fullName: 'An' }],
        [], // no duplicate roster membership
        [{ tournamentConfig: { isLite: true } }],
      ],
    };
  }

  it('pairs a guest with an account and names both athletes on the pair', async () => {
    const { p1, p2, selects } = guestPairSelects();
    const state = makeRepository(selects, [p1 as never, p2 as never]);

    await state.repository.lockTournamentAndPair(
      'tournament-1',
      p1.id,
      p2.id,
      'organizer-1',
      'APPROVAL',
      'Khách A / An',
    );

    expect(state.updates).toContainEqual({
      table: schema.tournamentRosters,
      values: { participantId: p1.id },
    });
    expect(state.updates).toContainEqual({
      table: schema.tournamentParticipants,
      values: expect.objectContaining({
        teamStatus: 'COMPLETE',
        customResponses: expect.objectContaining({
          importedFrom: 'ORGANIZER_DIRECT',
          player1Name: 'Khách A',
          player1UserId: null,
          player2Name: 'An',
          player2UserId: 'athlete-2',
        }),
      }),
    });
  });

  it('pairs an athlete the organizer imported from Excel without athlete 2 like a guest', async () => {
    const imported = {
      ...guestSide(),
      teamName: 'Khách Excel',
      customResponses: {
        importedFrom: 'EXCEL',
        player1Name: 'Khách Excel',
        player1Email: 'excel@example.test',
      },
    };
    const { p1, p2, selects } = guestPairSelects(imported);
    const state = makeRepository(selects, [p1 as never, p2 as never]);

    await state.repository.lockTournamentAndPair(
      'tournament-1',
      p1.id,
      p2.id,
      'organizer-1',
      'APPROVAL',
      'Khách Excel / An',
    );

    expect(state.updates).toContainEqual({
      table: schema.tournamentParticipants,
      values: expect.objectContaining({
        teamStatus: 'COMPLETE',
        customResponses: expect.objectContaining({
          player1Name: 'Khách Excel',
          player1UserId: null,
          player2UserId: 'athlete-2',
        }),
      }),
    });
  });

  it.each([
    ['an unknown source', { importedFrom: 'ROSTER_IMPORT' }],
    ['an import that already names athlete 2', { importedFrom: 'EXCEL', player2Name: 'B' }],
  ])('rejects a no-roster side from %s', async (_label, customResponses) => {
    const { p2, selects } = guestPairSelects();
    const imported = { ...guestSide(), customResponses };
    selects[3] = [imported];
    const state = makeRepository(selects, [imported as never, p2 as never]);

    await expect(
      state.repository.lockTournamentAndPair(
        'tournament-1',
        'a-guest',
        'acct',
        'organizer-1',
        'APPROVAL',
        'x',
      ),
    ).rejects.toThrow('Participant 1 phải có đúng 1 thành viên');
  });

  it('unpairs a guest pair back into a guest row and an account row', async () => {
    const pair = {
      ...participant('pair-1', 'MANUAL', 'COMPLETE'),
      registeredBy: 'organizer-1',
      customResponses: {
        importedFrom: 'ORGANIZER_DIRECT',
        player1Name: 'Khách A',
        player1Email: 'a@example.test',
        player1Phone: null,
        player1UserId: null,
        player2Name: 'An',
        player2UserId: 'athlete-2',
      },
    };
    const state = makeRepository(
      [[pair], [roster('r2', pair.id, 'athlete-2')]],
      [pair as never],
    );

    const result = await state.repository.unpairParticipantInTx(
      state.tx as never,
      'tournament-1',
      pair.id,
      'organizer-1',
    );

    expect(result.partner).toMatchObject({
      registeredBy: 'athlete-2',
      teamName: 'An',
      teamStatus: 'PENDING_PARTNER',
      customResponses: null,
    });
    expect(state.updates).toContainEqual({
      table: schema.tournamentRosters,
      values: { participantId: 'new-participant' },
    });
    expect(result.leader).toMatchObject({
      teamName: 'Khách A',
      teamStatus: 'PENDING_PARTNER',
      customResponses: {
        importedFrom: 'ORGANIZER_DIRECT',
        player1Email: 'a@example.test',
      },
    });
  });
});

describe('TournamentLiteRepository BTC pairing (TC-BTCPAIR)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('TC-BTCPAIR-06 marks the surviving participant of an organizer pair as fee-settled', async () => {
    const p1 = { ...participant('p1'), entryFeeAtRegistration: '150000.00' };
    const p2 = participant('p2');
    const state = makeRepository(manualPairSelects(p1, p2), [p1, p2]);

    await state.repository.lockTournamentAndPair(
      'tournament-1',
      'p1',
      'p2',
      'organizer-1',
      'OPEN',
      'Athlete 1 / Athlete 2',
    );

    expect(state.updates).toContainEqual({
      table: schema.tournamentParticipants,
      values: expect.objectContaining({
        pairingSource: 'MANUAL',
        isPaid: true,
        organizerWaivedFee: true,
      }),
    });
  });

  it('TC-BTCPAIR-07 unpairs a pair whose registeredBy matches no roster: the first roster by id leads', async () => {
    const existingPair = {
      ...participant('pair-1', 'MANUAL', 'COMPLETE'),
      registeredBy: 'organizer-1',
      organizerWaivedFee: true,
    };
    const leader = roster('r1', existingPair.id, 'athlete-1');
    const partner = roster('r2', existingPair.id, 'athlete-2');
    const state = makeRepository(
      [
        [existingPair],
        [partner, leader],
        [{ fullName: 'Athlete 1' }],
        [{ fullName: 'Athlete 2' }],
      ],
      [existingPair],
    );

    const result = await state.repository.unpairParticipantInTx(
      state.tx as never,
      'tournament-1',
      existingPair.id,
      'organizer-1',
    );

    expect(result.leader).toMatchObject({
      teamName: 'Athlete 1',
      teamStatus: 'PENDING_PARTNER',
    });
    expect(result.partner).toMatchObject({
      registeredBy: 'athlete-2',
      teamName: 'Athlete 2',
      teamStatus: 'PENDING_PARTNER',
    });
    expect(state.insertions[0].values).toMatchObject({
      registeredBy: 'athlete-2',
      organizerWaivedFee: true,
    });
    expect(state.updates).toContainEqual({
      table: schema.tournamentRosters,
      values: { participantId: 'new-participant' },
    });
  });

  it('TC-BTCPAIR-08 writes the organizer marker when an account pairs with a guest', async () => {
    const account = { ...participant('acct-p'), customResponses: null };
    const guest = {
      ...participant('guest-p'),
      teamName: 'Khách A',
      registeredBy: 'organizer-1',
      customResponses: {
        importedFrom: 'ORGANIZER_DIRECT',
        player1Email: 'a@example.test',
      },
    };
    const state = makeRepository(
      [
        [doublesTournament],
        [{ count: 0 }],
        [], // lockCapacityOwner
        [account], // sorted lock order: 'acct-p' before 'guest-p'
        [guest],
        [roster('r1', account.id, 'athlete-1')],
        [], // a guest has no roster
        [{ userId: 'athlete-1', fullName: 'An' }],
        [{ tournamentConfig: { isLite: true } }],
      ],
      [account, guest],
    );

    await state.repository.lockTournamentAndPair(
      'tournament-1',
      'acct-p',
      'guest-p',
      'organizer-1',
      'OPEN',
      'An / Khách A',
    );

    expect(state.updates).toContainEqual({
      table: schema.tournamentParticipants,
      values: expect.objectContaining({
        customResponses: expect.objectContaining({
          importedFrom: 'ORGANIZER_DIRECT',
          player1UserId: 'athlete-1',
          player2Name: 'Khách A',
          player2UserId: null,
        }),
      }),
    });
  });

  it('TC-BTCPAIR-09 random pairing with a division id pairs only that division', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.9); // keeps shuffle in list order
    const first = { ...participant('p1'), tournamentDivisionId: 'division-1' };
    const second = { ...participant('p2'), tournamentDivisionId: 'division-1' };
    const other = { ...participant('p3'), tournamentDivisionId: 'division-2' };
    const another = { ...participant('p4'), tournamentDivisionId: 'division-2' };
    const state = makeRepository(
      [
        [doublesTournament],
        [{ count: 0 }],
        [first, second], // SQL division scope: only division-1 rows come back
        [
          roster('r1', 'p1', 'athlete-1'),
          roster('r2', 'p2', 'athlete-2'),
        ],
        [
          { userId: 'athlete-1', fullName: 'Athlete 1' },
          { userId: 'athlete-2', fullName: 'Athlete 2' },
        ],
        [], // lockCapacityOwner
        [first],
        [second],
        [roster('r1', 'p1', 'athlete-1')],
        [roster('r2', 'p2', 'athlete-2')],
        [
          { userId: 'athlete-1', fullName: 'Athlete 1' },
          { userId: 'athlete-2', fullName: 'Athlete 2' },
        ],
        [], // no duplicate roster membership
        [{ tournamentConfig: { isLite: true } }],
      ],
      [first, second, other, another],
    );

    const result = await state.repository.generateLitePairsTx(
      'tournament-1',
      'organizer-1',
      'RANDOM',
      'division-1',
    );

    expect(
      result.paired.map((pair) => [pair.participant1Id, pair.participant2Id]),
    ).toEqual([['p1', 'p2']]);
    expect(result.unpairedParticipantIds).toEqual([]);
    expect(
      state.auditService.logUpdate.mock.calls.map((call) => call[3]),
    ).toEqual(['p1', 'p2']);
  });

  it('TC-BTCPAIR-10 reports both member names, a guest by team name, and the leftover name', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.9); // keeps shuffle in list order
    const first = participant('p1');
    const guest = {
      ...participant('p2'),
      teamName: 'Khách B',
      customResponses: {
        importedFrom: 'ORGANIZER_DIRECT',
        player1Email: 'b@example.test',
      },
    };
    const third = participant('p3');
    const state = makeRepository(
      [
        [doublesTournament],
        [{ count: 0 }],
        [first, guest, third],
        [roster('r1', 'p1', 'athlete-1'), roster('r3', 'p3', 'athlete-3')],
        [
          { userId: 'athlete-1', fullName: 'Athlete 1' },
          { userId: 'athlete-3', fullName: 'Athlete 3' },
        ],
        [], // lockCapacityOwner
        [first],
        [guest],
        [roster('r1', 'p1', 'athlete-1')],
        [], // a guest has no roster
        [{ userId: 'athlete-1', fullName: 'Athlete 1' }],
        [{ tournamentConfig: { isLite: true } }],
      ],
      [first, guest, third],
    );

    const result = await state.repository.generateLitePairsTx(
      'tournament-1',
      'organizer-1',
      'RANDOM',
    );

    expect(result).toMatchObject({
      strategy: 'RANDOM',
      paired: [
        {
          participantId: 'p1',
          participant1Id: 'p1',
          participant2Id: 'p2',
          teamName: 'Athlete 1 / Khách B',
          memberNames: ['Athlete 1', 'Khách B'],
        },
      ],
      unpairedParticipantIds: ['p3'],
      unpairedNames: ['Athlete 3'],
    });
  });

  it('TC-BTCPAIR-11 rejects random pairing under two waiting participants with the shared message', async () => {
    const only = participant('p1');
    const state = makeRepository(
      [
        [doublesTournament],
        [{ count: 0 }],
        [only],
        [roster('r1', 'p1', 'athlete-1')],
        [{ userId: 'athlete-1', fullName: 'Athlete 1' }],
      ],
      [only],
    );
    expect(LITE_NO_PAIRABLE_MESSAGE).toBe(
      'Cần ít nhất 2 người chơi đang chờ ghép cặp.',
    );

    await expect(
      state.repository.generateLitePairsTx(
        'tournament-1',
        'organizer-1',
        'RANDOM',
      ),
    ).rejects.toThrow(LITE_NO_PAIRABLE_MESSAGE);
  });

  it('TC-BTCPAIR-11 does not turn a failed pair into a success', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.9); // keeps shuffle in list order
    const first = participant('p1');
    const second = participant('p2');
    const state = makeRepository(
      [
        [doublesTournament],
        [{ count: 0 }],
        [first, second],
        [roster('r1', 'p1', 'athlete-1'), roster('r2', 'p2', 'athlete-2')],
        [
          { userId: 'athlete-1', fullName: 'Athlete 1' },
          { userId: 'athlete-2', fullName: 'Athlete 2' },
        ],
        [], // lockCapacityOwner
        [first],
        [second],
        [roster('r1', 'p1', 'athlete-1')],
        [roster('r2', 'p2', 'athlete-2')],
        [
          { userId: 'athlete-1', fullName: 'Athlete 1' },
          { userId: 'athlete-2', fullName: 'Athlete 2' },
        ],
        [{ userId: 'athlete-2' }], // athlete 2 already plays another participant
      ],
      [first, second],
    );

    await expect(
      state.repository.generateLitePairsTx(
        'tournament-1',
        'organizer-1',
        'RANDOM',
      ),
    ).rejects.toThrow(
      'Thành viên của Participant 2 đã tham gia đội khác trong giải này',
    );
  });
});
