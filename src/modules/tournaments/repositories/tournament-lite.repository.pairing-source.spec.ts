import { BadRequestException } from '@nestjs/common';
import * as schema from '../../../database/schema';
import { TournamentLiteRepository } from './tournament-lite.repository';

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
const division = { matchType: 'DOUBLES', genderRestriction: null };

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
    [division],
    [], // genders are irrelevant without a restriction
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
        [division],
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
