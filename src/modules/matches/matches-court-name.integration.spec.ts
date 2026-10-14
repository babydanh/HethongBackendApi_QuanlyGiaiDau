import { randomUUID } from 'crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../database/schema';
import { MatchesRepository } from './matches.repository';

// Runs only when CON_TEST_DATABASE_URL points at a disposable, migrated database.
const DB_URL = process.env.CON_TEST_DATABASE_URL;
const describeIfDb = DB_URL ? describe : describe.skip;

const client = postgres(DB_URL ?? '', { max: 4, onnotice: () => {} });
const db = drizzle(client, { schema });
const repo = new MatchesRepository(db, null as never);

afterAll(async () => {
  await client.end();
});

jest.setTimeout(60_000);

interface SeedOptions {
  storedCourtName: string | null;
  venueDeleted?: boolean;
}

async function seedCourtMatch({
  storedCourtName,
  venueDeleted = false,
}: SeedOptions) {
  const suffix = randomUUID().slice(0, 8);
  const [organizer] = await db
    .insert(schema.users)
    .values({
      id: randomUUID(),
      email: `organizer.${suffix}@con.test`,
      isEmailVerified: true,
    })
    .returning({ id: schema.users.id });
  const [category] = await db
    .insert(schema.categories)
    .values({ name: `cat-${suffix}`, slug: `cat-${suffix}` })
    .returning({ id: schema.categories.id });
  const [tournament] = await db
    .insert(schema.tournaments)
    .values({
      categoryId: category.id,
      createdBy: organizer.id,
      name: `CON ${suffix}`,
      sportRules: {},
      tournamentConfig: {},
      entryFee: '0.00',
    })
    .returning({ id: schema.tournaments.id });
  const [venue] = await db
    .insert(schema.tournamentVenues)
    .values({
      name: `Venue ${suffix}`,
      locationAddress: 'CON test address',
      deletedAt: venueDeleted ? new Date() : null,
    })
    .returning({ id: schema.tournamentVenues.id });
  const courtName = `San ${suffix}`;
  const [court] = await db
    .insert(schema.venueCourts)
    .values({ venueId: venue.id, courtName })
    .returning({ id: schema.venueCourts.id });
  const [stage] = await db
    .insert(schema.tournamentStages)
    .values({
      tournamentId: tournament.id,
      name: 'Vong 1',
      type: 'GROUP',
      order: 1,
    })
    .returning({ id: schema.tournamentStages.id });
  const [match] = await db
    .insert(schema.matches)
    .values({
      tournamentId: tournament.id,
      stageId: stage.id,
      roundNumber: 1,
      matchOrder: 1,
      courtId: court.id,
      courtName: storedCourtName,
    })
    .returning({ id: schema.matches.id });
  return { tournamentId: tournament.id, matchId: match.id, courtName };
}

describeIfDb('MatchesRepository.findAll court name enrichment', () => {
  it('fills the canonical venue court name when the row has a courtId but no stored name', async () => {
    const seeded = await seedCourtMatch({ storedCourtName: null });

    const result = await repo.findAll({
      tournamentId: seeded.tournamentId,
      limit: 100,
    } as never);
    const row = result.data.find((m) => m.id === seeded.matchId);

    expect(row?.courtName).toBe(seeded.courtName);
  });

  it('keeps a stored court name instead of replacing it with the venue court name', async () => {
    const seeded = await seedCourtMatch({
      storedCourtName: 'Ten da luu tren tran',
    });

    const result = await repo.findAll({
      tournamentId: seeded.tournamentId,
      limit: 100,
    } as never);
    const row = result.data.find((m) => m.id === seeded.matchId);

    expect(row?.courtName).toBe('Ten da luu tren tran');
  });

  it('leaves the court name empty when the venue is soft-deleted', async () => {
    const seeded = await seedCourtMatch({
      storedCourtName: null,
      venueDeleted: true,
    });

    const result = await repo.findAll({
      tournamentId: seeded.tournamentId,
      limit: 100,
    } as never);
    const row = result.data.find((m) => m.id === seeded.matchId);

    expect(row?.courtName).toBeNull();
  });
});
