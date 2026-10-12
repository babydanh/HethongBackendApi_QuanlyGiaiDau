import { randomUUID } from 'crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../database/schema';
import { UsersRepository } from './users.repository';

// Runs only when CON_TEST_DATABASE_URL points at a disposable, migrated database.
// Fixtures follow the CON convention: tournaments "CON <id>", users "*.con.test".
const DB_URL = process.env.CON_TEST_DATABASE_URL;
const describeIfDb = DB_URL ? describe : describe.skip;

const client = postgres(DB_URL ?? '', { max: 4, onnotice: () => {} });
const db = drizzle(client, { schema });
// The achievements path touches only db; the audit collaborator is unused here.
const repo = new UsersRepository(db, null as never);

afterAll(async () => {
  await client.end();
});

jest.setTimeout(60_000);

const LINK_CONFIRMED_AT = new Date('2026-06-01T00:00:00.000Z');
const COMPLETED_BEFORE_LINK = new Date('2026-05-01T00:00:00.000Z');
const COMPLETED_AFTER_LINK = new Date('2026-07-01T00:00:00.000Z');

async function seedUser(label: string): Promise<string> {
  const id = randomUUID();
  await db.insert(schema.users).values({
    id,
    email: `${label}.${id}@con.test`,
    isEmailVerified: true,
  });
  await db
    .insert(schema.profiles)
    .values({ userId: id, fullName: `VDV ${label}` });
  return id;
}

// Ranked, completed tournament with a group stage (order 1) and a final stage (order 2).
// The player's final completes at finalCompletedAt and is a win. The player's group match
// completes after the link instant, so the player has a post-link match in the tournament.
async function seedRankedTournament(finalCompletedAt: Date) {
  const organizerId = await seedUser('organizer');
  const playerId = await seedUser('player');
  const otherId = await seedUser('other');
  const thirdId = await seedUser('third');
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
      name: `CON ${suffix}`,
      sportRules: {},
      tournamentConfig: {},
      entryFee: '100000.00',
      isRanked: true,
      status: 'COMPLETED',
    })
    .returning({ id: schema.tournaments.id });
  const [division] = await db
    .insert(schema.tournamentDivisions)
    .values({
      tournamentId: tournament.id,
      name: 'Singles',
      matchType: 'SINGLES',
      maxParticipants: 8,
    })
    .returning({ id: schema.tournamentDivisions.id });
  const [groupStage] = await db
    .insert(schema.tournamentStages)
    .values({ tournamentId: tournament.id, name: 'Vong bang', type: 'GROUP', order: 1 })
    .returning({ id: schema.tournamentStages.id });
  const [finalStage] = await db
    .insert(schema.tournamentStages)
    .values({ tournamentId: tournament.id, name: 'Chung ket', type: 'KNOCKOUT', order: 2 })
    .returning({ id: schema.tournamentStages.id });

  const participantIds: string[] = [];
  for (const [teamName, userId] of [
    [`Doi A ${suffix}`, playerId],
    [`Doi B ${suffix}`, otherId],
    [`Doi C ${suffix}`, thirdId],
  ] as const) {
    const [participant] = await db
      .insert(schema.tournamentParticipants)
      .values({
        tournamentId: tournament.id,
        tournamentDivisionId: division.id,
        registeredBy: organizerId,
        teamName,
      })
      .returning({ id: schema.tournamentParticipants.id });
    participantIds.push(participant.id);
    await db.insert(schema.tournamentRosters).values({
      participantId: participant.id,
      userId,
      role: 'MAIN',
      accountLinkConfirmedAt: userId === playerId ? LINK_CONFIRMED_AT : null,
    });
  }
  const [playerP, otherP, thirdP] = participantIds;

  await db.insert(schema.matches).values([
    {
      tournamentId: tournament.id,
      stageId: finalStage.id,
      participant1Id: playerP,
      participant2Id: otherP,
      winnerId: playerP,
      status: 'COMPLETED',
      roundNumber: 1,
      matchOrder: 1,
      completedAt: finalCompletedAt,
    },
    {
      tournamentId: tournament.id,
      stageId: groupStage.id,
      participant1Id: playerP,
      participant2Id: thirdP,
      winnerId: thirdP,
      status: 'COMPLETED',
      roundNumber: 1,
      matchOrder: 1,
      completedAt: COMPLETED_AFTER_LINK,
    },
  ]);

  return { playerId, tournamentId: tournament.id };
}

describeIfDb('thành tích giải theo mốc xác nhận (Postgres thật)', () => {
  it('does not award a final that completed before the link, even with a later match', async () => {
    const { playerId, tournamentId } = await seedRankedTournament(
      COMPLETED_BEFORE_LINK,
    );

    // Private helper exercised directly: it is the single achievements path.
    const achievements = await repo['getPublicProfileAchievements'](playerId);

    expect(
      achievements.map((item: { tournamentId: string }) => item.tournamentId),
    ).not.toContain(tournamentId);
  });

  it('awards the first-place final that completed after the link', async () => {
    const { playerId, tournamentId } = await seedRankedTournament(
      COMPLETED_AFTER_LINK,
    );

    const achievements = await repo['getPublicProfileAchievements'](playerId);

    const granted = achievements.find(
      (item: { tournamentId: string }) => item.tournamentId === tournamentId,
    );
    expect(granted?.rank).toBe(1);
  });
});
