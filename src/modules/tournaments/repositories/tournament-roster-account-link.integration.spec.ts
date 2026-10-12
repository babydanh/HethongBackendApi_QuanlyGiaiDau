import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../../database/schema';
import { MatchesRepository } from '../../matches/matches.repository';
import type { RegisterTournamentDto } from '../dto/register-tournament.dto';
import { TournamentParticipantRepository } from './tournament-participant.repository';
import { TournamentPaymentRepository } from './tournament-payment.repository';
import { TournamentRegistrationRepository } from './tournament-registration.repository';

// Runs only when CON_TEST_DATABASE_URL points at a disposable, migrated database.
// Fixtures follow the convention of the other CON integration specs: tournaments
// named "CON <id>" and users with emails "*.con.test".
const DB_URL = process.env.CON_TEST_DATABASE_URL;
const describeIfDb = DB_URL ? describe : describe.skip;

const client = postgres(DB_URL ?? '', { max: 4, onnotice: () => {} });
const db = drizzle(client, { schema });
// Audit writes are not under test here; the no-op stub keeps the repository runnable.
const noopAudit = new Proxy({}, { get: () => async () => undefined }) as never;
const repo = new TournamentParticipantRepository(
  db,
  noopAudit,
  null as never,
);
const matchesRepo = new MatchesRepository(db, null as never);

const registrationRepo = new TournamentRegistrationRepository(
  db,
  noopAudit,
  new TournamentPaymentRepository(db),
);

afterAll(async () => {
  await client.end();
});

jest.setTimeout(60_000);

const EARLIER_LINK = new Date('2026-01-01T00:00:00.000Z');
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

async function seedTournamentWithDivision(organizerId: string) {
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
  return { tournamentId: tournament.id, divisionId: division.id, suffix };
}

async function seedParticipant(
  tournamentId: string,
  divisionId: string,
  organizerId: string,
  teamName: string,
) {
  const [participant] = await db
    .insert(schema.tournamentParticipants)
    .values({
      tournamentId,
      tournamentDivisionId: divisionId,
      registeredBy: organizerId,
      teamName,
    })
    .returning({ id: schema.tournamentParticipants.id });
  return participant.id;
}

async function seedRoster(accountLinkConfirmedAt: Date | null) {
  const organizerId = await seedUser('organizer');
  const userId = await seedUser('player');
  const { tournamentId, divisionId, suffix } = await seedTournamentWithDivision(
    organizerId,
  );
  const participantId = await seedParticipant(
    tournamentId,
    divisionId,
    organizerId,
    `Doi ${suffix}`,
  );
  const [roster] = await db
    .insert(schema.tournamentRosters)
    .values({
      participantId,
      userId,
      role: 'MAIN',
      accountLinkConfirmedAt,
    })
    .returning({ id: schema.tournamentRosters.id });
  return { tournamentId, userId, rosterId: roster.id };
}

async function seedFeedFixture() {
  const organizerId = await seedUser('organizer');
  const playerId = await seedUser('player');
  const opponentId = await seedUser('opponent');
  const { tournamentId, divisionId, suffix } = await seedTournamentWithDivision(
    organizerId,
  );
  const [stage] = await db
    .insert(schema.tournamentStages)
    .values({ tournamentId, name: 'Vong 1', type: 'GROUP', order: 1 })
    .returning({ id: schema.tournamentStages.id });
  const playerParticipantId = await seedParticipant(
    tournamentId,
    divisionId,
    organizerId,
    `Doi A ${suffix}`,
  );
  const opponentParticipantId = await seedParticipant(
    tournamentId,
    divisionId,
    organizerId,
    `Doi B ${suffix}`,
  );
  await db.insert(schema.tournamentRosters).values([
    {
      participantId: playerParticipantId,
      userId: playerId,
      role: 'MAIN',
      accountLinkConfirmedAt: LINK_CONFIRMED_AT,
    },
    { participantId: opponentParticipantId, userId: opponentId, role: 'MAIN' },
  ]);
  const insertMatch = async (matchOrder: number, completedAt: Date) => {
    const [row] = await db
      .insert(schema.matches)
      .values({
        tournamentId,
        stageId: stage.id,
        participant1Id: playerParticipantId,
        participant2Id: opponentParticipantId,
        status: 'COMPLETED',
        roundNumber: 1,
        matchOrder,
        completedAt,
      })
      .returning({ id: schema.matches.id });
    return row.id;
  };
  return {
    playerId,
    tournamentId,
    beforeLinkMatchId: await insertMatch(1, COMPLETED_BEFORE_LINK),
    afterLinkMatchId: await insertMatch(2, COMPLETED_AFTER_LINK),
  };
}

// Football roster writes need an ACTIVE team holding the members, plus a tournament team entry.
async function seedFootballTeamEntry(params: {
  tournamentId: string;
  divisionId: string;
  organizerId: string;
  suffix: string;
  memberIds: string[];
}): Promise<string> {
  const [category] = await db
    .insert(schema.categories)
    .values({ name: `fb-${params.suffix}`, slug: `fb-${params.suffix}` })
    .returning({ id: schema.categories.id });
  const [team] = await db
    .insert(schema.footballTeams)
    .values({
      name: `Doi bong ${params.suffix}`,
      categoryId: category.id,
      createdBy: params.organizerId,
    })
    .returning({ id: schema.footballTeams.id });
  await db.insert(schema.footballTeamMembers).values(
    params.memberIds.map((userId) => ({
      teamId: team.id,
      userId,
      status: 'ACTIVE',
      joinedAt: new Date(),
    })),
  );
  await db.insert(schema.tournamentTeamEntries).values({
    tournamentId: params.tournamentId,
    divisionId: params.divisionId,
    teamId: team.id,
    displayNameSnapshot: `Doi bong ${params.suffix}`,
    createdBy: params.organizerId,
  });
  return team.id;
}

async function readRoster(rosterId: string) {
  const [row] = await db
    .select({
      linkedAt: schema.tournamentRosters.accountLinkConfirmedAt,
      consentAt: schema.tournamentRosters.rankingConsentAt,
    })
    .from(schema.tournamentRosters)
    .where(eq(schema.tournamentRosters.id, rosterId));
  return row;
}

describeIfDb('roster account-link confirmation (Postgres thật)', () => {
  it('stamps the link instant when an organizer-assigned row consents, and returns it', async () => {
    const { tournamentId, userId, rosterId } = await seedRoster(null);
    const before = Date.now();

    const result = await repo.confirmRankingConsent(tournamentId, userId);

    expect(result?.alreadyConfirmed).toBe(false);
    const row = await readRoster(rosterId);
    expect(row.consentAt).not.toBeNull();
    expect(row.linkedAt).not.toBeNull();
    expect(row.linkedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(result?.accountLinkConfirmedAt?.getTime()).toBe(
      row.linkedAt!.getTime(),
    );
  });

  it('keeps an earlier link instant when the row consents later', async () => {
    const { tournamentId, userId, rosterId } = await seedRoster(EARLIER_LINK);

    const result = await repo.confirmRankingConsent(tournamentId, userId);

    const row = await readRoster(rosterId);
    expect(row.consentAt).not.toBeNull();
    expect(row.linkedAt?.getTime()).toBe(EARLIER_LINK.getTime());
    expect(result?.accountLinkConfirmedAt?.getTime()).toBe(
      EARLIER_LINK.getTime(),
    );
  });

  it('returns the stored link instant on the already-confirmed branch', async () => {
    const { tournamentId, userId } = await seedRoster(null);
    await repo.confirmRankingConsent(tournamentId, userId);
    const stored = await repo.confirmRankingConsent(tournamentId, userId);

    expect(stored?.alreadyConfirmed).toBe(true);
    expect(stored?.accountLinkConfirmedAt).not.toBeNull();
  });

  it('captain-added member gets NULL link; existing member keeps its stamp through updateFootballRoster', async () => {
    const organizerId = await seedUser('organizer');
    const existingId = await seedUser('existing');
    const addedId = await seedUser('added');
    const { tournamentId, divisionId, suffix } =
      await seedTournamentWithDivision(organizerId);
    const teamId = await seedFootballTeamEntry({
      tournamentId,
      divisionId,
      organizerId,
      suffix,
      memberIds: [organizerId, existingId, addedId],
    });
    const [participant] = await db
      .insert(schema.tournamentParticipants)
      .values({
        tournamentId,
        tournamentDivisionId: divisionId,
        registeredBy: organizerId,
        teamName: `Doi C ${suffix}`,
        footballTeamId: teamId,
      })
      .returning({ id: schema.tournamentParticipants.id });
    const participantId = participant.id;
    await db.insert(schema.tournamentRosters).values({
      participantId,
      userId: existingId,
      role: 'MAIN',
      accountLinkConfirmedAt: LINK_CONFIRMED_AT,
    });

    await repo.updateFootballRoster(
      participantId,
      [existingId, addedId],
      [],
      organizerId,
    );

    const rows = await db
      .select({
        userId: schema.tournamentRosters.userId,
        linkedAt: schema.tournamentRosters.accountLinkConfirmedAt,
      })
      .from(schema.tournamentRosters)
      .where(eq(schema.tournamentRosters.participantId, participantId));
    const linkedByUser = new Map(rows.map((row) => [row.userId, row.linkedAt]));
    expect(linkedByUser.get(existingId)?.getTime()).toBe(
      LINK_CONFIRMED_AT.getTime(),
    );
    expect(linkedByUser.get(addedId)).toBeNull();
  });

  it('addRoster by the captain writes a NULL link', async () => {
    const organizerId = await seedUser('organizer');
    const addedId = await seedUser('added');
    const { tournamentId, divisionId, suffix } =
      await seedTournamentWithDivision(organizerId);
    const participantId = await seedParticipant(
      tournamentId,
      divisionId,
      organizerId,
      `Doi D ${suffix}`,
    );

    const row = await repo.addRoster(participantId, addedId, 'MAIN');

    expect(row?.userId).toBe(addedId);
    expect(row?.accountLinkConfirmedAt).toBeNull();
  });

  it('feed counts only matches completed after the link instant (không hồi tố)', async () => {
    const fixture = await seedFeedFixture();

    const result = await matchesRepo.findAll({
      userId: fixture.playerId,
      tournamentId: fixture.tournamentId,
      limit: 50,
    } as never);

    const ids = (result.data as Array<{ id: string }>).map((match) => match.id);
    expect(ids).toContain(fixture.afterLinkMatchId);
    expect(ids).not.toContain(fixture.beforeLinkMatchId);
  });
});

async function seedOpenRankedTournament(organizerId: string) {
  const seeded = await seedTournamentWithDivision(organizerId);
  // Registration is gated on REGISTRATION_OPEN; the fixture defaults to DRAFT.
  await db
    .update(schema.tournaments)
    .set({ status: 'REGISTRATION_OPEN', matchType: 'SINGLES', isRanked: true })
    .where(eq(schema.tournaments.id, seeded.tournamentId));
  return seeded;
}

// Goes through the real registration path (no mocks) with rankingConsent: true.
async function registerWithRankingConsent() {
  const organizerId = await seedUser('organizer');
  const userId = await seedUser('player');
  const { tournamentId, divisionId } =
    await seedOpenRankedTournament(organizerId);
  const { participant } = await registrationRepo.registerParticipant(
    tournamentId,
    userId,
    {
      tournamentDivisionId: divisionId,
      rankingConsent: true,
    } as RegisterTournamentDto,
  );
  const [roster] = await db
    .select({ id: schema.tournamentRosters.id })
    .from(schema.tournamentRosters)
    .where(
      and(
        eq(schema.tournamentRosters.participantId, participant.id),
        eq(schema.tournamentRosters.userId, userId),
      ),
    );
  return { tournamentId, userId, rosterId: roster.id };
}

describeIfDb('registration ranking consent does not confirm the account link (Postgres thật)', () => {
  it('registration with rankingConsent sets only the consent instant', async () => {
    const { rosterId } = await registerWithRankingConsent();

    const row = await readRoster(rosterId);
    expect(row.consentAt).not.toBeNull();
    expect(row.linkedAt).toBeNull();
  });

  it('the confirm endpoint is a separate step that stamps the account link', async () => {
    const { tournamentId, userId, rosterId } =
      await registerWithRankingConsent();

    const result = await repo.confirmRankingConsent(tournamentId, userId);

    expect(result?.alreadyConfirmed).toBe(false);
    const row = await readRoster(rosterId);
    expect(row.linkedAt).not.toBeNull();
    expect(result?.accountLinkConfirmedAt?.getTime()).toBe(
      row.linkedAt!.getTime(),
    );
  });

  it('a second confirm reports alreadyConfirmed and keeps the stored link instant', async () => {
    const { tournamentId, userId, rosterId } =
      await registerWithRankingConsent();
    await repo.confirmRankingConsent(tournamentId, userId);
    const firstLinkedAt = (await readRoster(rosterId)).linkedAt;
    expect(firstLinkedAt).not.toBeNull();

    const second = await repo.confirmRankingConsent(tournamentId, userId);

    expect(second?.alreadyConfirmed).toBe(true);
    expect((await readRoster(rosterId)).linkedAt?.getTime()).toBe(
      firstLinkedAt!.getTime(),
    );
    expect(second?.accountLinkConfirmedAt?.getTime()).toBe(
      firstLinkedAt!.getTime(),
    );
  });
});
