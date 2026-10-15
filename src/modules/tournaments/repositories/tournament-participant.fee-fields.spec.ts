import { TournamentParticipantRepository } from './tournament-participant.repository';

type Row = Record<string, unknown>;

/**
 * Resolves a select by call order and projects the requested keys out of the stored row, so a
 * select that never asks for a column leaves that key undefined in the result: the assertions
 * below fail if the repository forgets to read the fee columns.
 */
function createRepository(results: Row[][]) {
  let call = 0;
  const chain: Record<string, unknown> = {};
  let fields: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = (selected: Record<string, unknown>) => {
    fields = selected;
    return chain;
  };
  chain.from = self;
  chain.leftJoin = self;
  chain.where = self;
  chain.orderBy = self;
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve().then(() => {
      const rows = results[call] ?? [];
      call += 1;
      resolve(
        rows.map((row) =>
          Object.fromEntries(Object.keys(fields).map((key) => [key, row[key]])),
        ),
      );
    });

  return new TournamentParticipantRepository(
    chain as never,
    {} as never,
    {} as never,
  );
}

const participant: Row = {
  id: 'p1',
  teamName: 'Doi Linh Hoat',
  footballTeamId: null,
  teamStatus: 'PENDING_PARTNER',
  isPaid: false,
  entryFeeAtRegistration: '0.00',
  organizerWaivedFee: true,
  customResponses: null,
  registeredBy: null,
};

const roster: Row = {
  participantId: 'p1',
  userId: 'u1',
  email: 'u1@example.test',
  phoneNumber: null,
  gender: null,
  role: 'MAIN',
  isMock: false,
  fullName: 'Hoang Linh',
  avatarUrl: null,
  eloPoints: null,
  tierName: null,
  footballTeamEloPoints: null,
  accountLinkConfirmedAt: null,
};

describe('TournamentParticipantRepository fee fields', () => {
  it('gives the organizer view the fee snapshot and the waiver mark', async () => {
    // Order of selects with payment details: participants, payments, rosters.
    const repository = createRepository([[participant], [], [roster]]);

    const [row] = await repository.findParticipants(
      't1',
      'category-1',
      undefined,
      false,
      true,
    );

    expect(row.entryFeeAtRegistration).toBe('0.00');
    expect(row.organizerWaivedFee).toBe(true);
  });

  it('keeps the fee snapshot and the waiver mark out of the default roster', async () => {
    const repository = createRepository([[participant], [roster]]);

    const [row] = await repository.findParticipants('t1', 'category-1');

    expect(row).not.toHaveProperty('entryFeeAtRegistration');
    expect(row).not.toHaveProperty('organizerWaivedFee');
  });

  it('keeps the fee snapshot and the waiver mark out of the public roster', async () => {
    const repository = createRepository([[participant], [roster]]);

    const [row] = await repository.findPublicParticipants('t1', 'category-1');

    expect(row).not.toHaveProperty('entryFeeAtRegistration');
    expect(row).not.toHaveProperty('organizerWaivedFee');
  });
});
