import * as schema from '../../../database/schema';
import { TournamentParticipantRepository } from './tournament-participant.repository';

type Row = Record<string, unknown>;

const CONSENTED = new Date('2026-09-01T00:00:00.000Z');
const LINKED = new Date('2026-09-02T00:00:00.000Z');
const NOTIFIED = new Date('2026-09-03T00:00:00.000Z');

/**
 * Drives the real `updateFootballRoster` through a stubbed transaction. Selects resolve by call
 * order (participant, entry, tournament, team members, duplicate rows, previous rosters); every
 * `insert(...).values(...)` is captured, so the assertions read what the repository itself decided
 * to write back, not what a helper would return in isolation.
 */
function createRepository() {
  const selects: Row[][] = [
    [
      {
        id: 'participant-1',
        tournamentId: 'tournament-1',
        tournamentDivisionId: 'division-1',
        footballTeamId: 'team-1',
        registeredBy: 'leader',
        rosterLockedAt: null,
      },
    ],
    [{ id: 'entry-1', status: 'DRAFT' }],
    [{ tournamentConfig: { teamSize: 7, minTeamSize: 7, maxReserve: 2 } }],
    [{ userId: 'leader' }, { userId: 'kept' }, { userId: 'newcomer' }],
    [],
    [
      {
        userId: 'leader',
        rankingConsentAt: CONSENTED,
        accountLinkConfirmedAt: LINKED,
        consentNotifiedAt: NOTIFIED,
        consentNotifiedCount: 2,
      },
      {
        userId: 'kept',
        rankingConsentAt: CONSENTED,
        accountLinkConfirmedAt: null,
        consentNotifiedAt: null,
        consentNotifiedCount: 0,
      },
    ],
  ];
  let selectCall = 0;
  const rosterInserts: Row[][] = [];

  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = self;
  chain.from = self;
  chain.innerJoin = self;
  chain.where = self;
  chain.for = self;
  chain.limit = self;
  chain.delete = self;
  chain.update = self;
  chain.set = self;
  chain.returning = () => Promise.resolve([{ id: 'entry-1', status: 'PENDING_CONFIRMATION' }]);
  chain.insert = (table: unknown) => ({
    values: (values: Row[]) => {
      if (table === schema.tournamentRosters) rosterInserts.push(values);
      return Promise.resolve();
    },
  });
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve().then(() => {
      resolve(selects[selectCall++] ?? []);
    });

  const db = { transaction: (run: (tx: unknown) => unknown) => run(chain) };
  const repository = new TournamentParticipantRepository(
    db as never,
    { logUpdate: jest.fn() } as never,
    {} as never,
  );
  return { repository, rosterInserts };
}

describe('TournamentParticipantRepository.updateFootballRoster confirmation marks', () => {
  it('writes back every mark of a member who stays in the team, and none for a newcomer', async () => {
    const { repository, rosterInserts } = createRepository();

    await repository.updateFootballRoster(
      'participant-1',
      ['leader', 'kept'],
      ['newcomer'],
      'leader',
    );

    const written = rosterInserts.flat();
    const rowFor = (userId: string) => written.find((row) => row.userId === userId);

    // Dropping any of these on the delete + reinsert would stop the player's ELO, hide their
    // matches, or restart their reminder mails.
    expect(rowFor('leader')).toMatchObject({
      role: 'MAIN',
      rankingConsentAt: CONSENTED,
      accountLinkConfirmedAt: LINKED,
      consentNotifiedAt: NOTIFIED,
      consentNotifiedCount: 2,
    });
    // A member who consented but never confirmed the link keeps exactly that state.
    expect(rowFor('kept')).toMatchObject({
      role: 'MAIN',
      rankingConsentAt: CONSENTED,
      accountLinkConfirmedAt: null,
    });
    // Someone the captain just added waits for their own confirmation.
    expect(rowFor('newcomer')).toMatchObject({
      role: 'RESERVE',
      rankingConsentAt: null,
      accountLinkConfirmedAt: null,
      consentNotifiedAt: null,
      consentNotifiedCount: 0,
    });
  });
});
