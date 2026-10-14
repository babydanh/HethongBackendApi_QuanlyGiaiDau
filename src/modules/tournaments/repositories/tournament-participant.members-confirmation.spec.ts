import { TournamentParticipantRepository } from './tournament-participant.repository';

type Row = Record<string, unknown>;

const LINKED_AT = new Date('2026-10-14T03:00:00.000Z');

/**
 * Resolves a select by call order and projects the requested keys out of the stored row, so a
 * select that never asks for a column leaves that key undefined in the result: the assertions
 * below fail if the repository forgets to read the confirmation mark.
 */
function createRepository(participants: Row[], rosters: Row[]) {
  const results = [participants, rosters];
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

const participant = (id: string): Row => ({
  id,
  teamName: `Team ${id}`,
  footballTeamId: null,
  teamStatus: 'COMPLETE',
  customResponses: null,
  registeredBy: null,
});

const roster = (
  participantId: string,
  userId: string,
  accountLinkConfirmedAt: Date | null,
): Row => ({
  participantId,
  userId,
  email: `${userId}@example.test`,
  phoneNumber: null,
  gender: null,
  role: 'MAIN',
  isMock: false,
  fullName: userId,
  avatarUrl: null,
  eloPoints: null,
  tierName: null,
  footballTeamEloPoints: null,
  accountLinkConfirmedAt,
});

describe('TournamentParticipantRepository member confirmation mark', () => {
  it('tells the organizer which member still has to confirm the account link', async () => {
    const repository = createRepository(
      [participant('p1'), participant('p2')],
      [
        roster('p1', 'waiting', null),
        roster('p2', 'confirmed', LINKED_AT),
      ],
    );

    const rows = await repository.findParticipants('t1', 'category-1');
    const markOf = (participantId: string) =>
      rows.find((row) => row.id === participantId)?.members[0]
        .accountLinkConfirmedAt;

    // null means "waiting"; a date means confirmed. undefined would mean the field is missing.
    expect(markOf('p1')).toBeNull();
    expect(markOf('p2')).toEqual(LINKED_AT);
  });

  it('keeps the confirmation mark out of the public roster', async () => {
    const repository = createRepository(
      [participant('p1')],
      [roster('p1', 'waiting', null)],
    );

    const rows = await repository.findPublicParticipants('t1', 'category-1');

    expect(rows[0].members[0]).not.toHaveProperty('accountLinkConfirmedAt');
  });
});
