import { randomUUID } from 'crypto';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../../database/schema';
import { TournamentCapacityService } from '../services/tournament-capacity.service';
import { TournamentLiteRepository } from './tournament-lite.repository';
import { TournamentPaymentRepository } from './tournament-payment.repository';
import { TournamentRatingRepository } from './tournament-rating.repository';
import { TournamentRegistrationRepository } from './tournament-registration.repository';

const DB_URL = process.env.CON_TEST_DATABASE_URL;
const describeIfDb = DB_URL ? describe : describe.skip;
const client = postgres(DB_URL ?? '', { max: 8, onnotice: () => {} });
const db = drizzle(client, { schema });
const noopAudit = new Proxy({}, { get: () => () => undefined }) as never;
const payments = new TournamentPaymentRepository(db);
const liteRepository = new TournamentLiteRepository(
  db,
  noopAudit,
  payments,
  new TournamentRatingRepository(db),
);
const registrationRepository = new TournamentRegistrationRepository(
  db,
  noopAudit,
  payments,
);
const capacityService = new TournamentCapacityService(db);

jest.setTimeout(60_000);

afterAll(async () => {
  await client.end();
});

function pause(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(() => resolve(), ms);
  return promise;
}

type ActivityRow = {
  pid: number;
  waitEvent: string | null;
  waitEventType: string | null;
  query: string;
};

async function waitForActivity(
  predicate: (rows: ActivityRow[]) => boolean,
  description: string,
): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const rows = await client`
      SELECT pid, wait_event AS "waitEvent",
        wait_event_type AS "waitEventType", query
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
    `;
    if (predicate(rows)) return;
    await pause(25);
  }
  throw new Error(`Timed out waiting for ${description}`);
}


async function seedUser(label: string) {
  const id = randomUUID();
  await db.insert(schema.users).values({
    id,
    email: `${label}.${id}@race.test`,
    isEmailVerified: true,
  });
  await db.insert(schema.profiles).values({ userId: id, fullName: label });
  return id;
}

async function seedTournament(organizerId: string) {
  const suffix = randomUUID().slice(0, 8);
  const [category] = await db
    .insert(schema.categories)
    .values({ name: `cat-${suffix}`, slug: `cat-${suffix}` })
    .returning({ id: schema.categories.id });
  const [tournament] = await db
    .insert(schema.tournaments)
    .values({
      categoryId: category.id,
      createdBy: organizerId,
      name: `CON-006 ${suffix}`,
      sportRules: {},
      tournamentConfig: {
        isLite: true,
        mode: 'LITE',
        registrationMode: 'OPEN',
        doublesPairingMode: 'ORGANIZER',
      },
      entryFee: '0.00',
      isRanked: false,
      matchType: 'DOUBLES',
      status: 'REGISTRATION_OPEN',
      maxParticipants: 2,
    })
    .returning({ id: schema.tournaments.id });
  const [division] = await db
    .insert(schema.tournamentDivisions)
    .values({
      tournamentId: tournament.id,
      name: 'Doubles',
      matchType: 'DOUBLES',
      maxParticipants: 2,
    })
    .returning({ id: schema.tournamentDivisions.id });
  return { tournamentId: tournament.id, divisionId: division.id };
}

async function seedPendingPlayer(
  tournamentId: string,
  divisionId: string,
  label: string,
) {
  const userId = await seedUser(label);
  const [participant] = await db
    .insert(schema.tournamentParticipants)
    .values({
      tournamentId,
      tournamentDivisionId: divisionId,
      registeredBy: userId,
      teamName: label,
      teamStatus: 'PENDING_PARTNER',
    })
    .returning({ id: schema.tournamentParticipants.id });
  await db.insert(schema.tournamentRosters).values({
    participantId: participant.id,
    userId,
    role: 'MAIN',
    status: 'ACTIVE',
  });
  return { participantId: participant.id, userId };
}

describeIfDb('TC-FEAT-CON-006 batch pairing vs registration on Postgres', () => {
  beforeAll(async () => {
    const rows = await client`SELECT current_database() AS name`;
    if (rows[0].name !== 'pairing_con006_scratch_20261014') {
      throw new Error(`Refusing to run on database "${rows[0].name}"`);
    }
  });

  it('serializes a new doubles registration behind a running batch without exceeding capacity', async () => {
    const organizerId = await seedUser('organizer');
    const { tournamentId, divisionId } = await seedTournament(organizerId);
    const first = await seedPendingPlayer(tournamentId, divisionId, 'first');
    const second = await seedPendingPlayer(tournamentId, divisionId, 'second');
    const registrantId = await seedUser('new-player');
    const suffix = randomUUID().replace(/-/g, '');
    const functionName = `hold_registration_${suffix}`;
    const triggerName = `hold_registration_trg_${suffix}`;

    await db.execute(
      sql.raw(`
        CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.registered_by = '${registrantId}' THEN
            PERFORM pg_sleep(3);
          END IF;
          RETURN NEW;
        END $$
      `),
    );
    await db.execute(
      sql.raw(`
        CREATE TRIGGER ${triggerName}
        BEFORE INSERT ON tournament_participants
        FOR EACH ROW EXECUTE FUNCTION ${functionName}()
      `),
    );
    try {
      const registration = registrationRepository.registerParticipant(
        tournamentId,
        registrantId,
        {
          divisionId,
          teamName: 'New player',
          matchType: 'DOUBLES',
          doublesPairingMode: 'ORGANIZER',
        },
      );

      await waitForActivity(
        (rows) =>
          rows.some(
            (row) =>
              row.waitEvent === 'PgSleep' &&
              String(row.query).toLowerCase().includes('tournament_participants'),
          ),
        'registration transaction to hold the tournament lock',
      );

      const batch = liteRepository.lockTournamentAndPairMany(
        tournamentId,
        [
          {
            p1Id: first.participantId,
            p2Id: second.participantId,
            teamName: 'Paired team',
          },
        ],
        organizerId,
        'LITE',
      );

      await waitForActivity(
        (rows) =>
          rows.some(
            (row) =>
              row.waitEventType === 'Lock' &&
              String(row.query).toLowerCase().includes('tournaments'),
          ),
        'batch transaction to wait for the registration lock',
      );

      await expect(registration).resolves.toBeDefined();
      await expect(batch).resolves.toHaveLength(1);

      const capacity = await capacityService.getDivisionCapacity(divisionId);
      expect(capacity).toMatchObject({
        occupiedTeamSlots: 1.5,
        maxTeamSlots: 2,
        isFull: false,
      });
    } finally {
      await db.execute(
        sql.raw(
          `DROP TRIGGER IF EXISTS ${triggerName} ON tournament_participants`,
        ),
      );
      await db.execute(sql.raw(`DROP FUNCTION IF EXISTS ${functionName}()`));
    }
  });
});
