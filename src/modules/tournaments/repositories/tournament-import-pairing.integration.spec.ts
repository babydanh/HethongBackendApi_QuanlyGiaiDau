import { randomUUID } from 'crypto';
import { HttpException } from '@nestjs/common';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, count, eq, sql } from 'drizzle-orm';
import * as schema from '../../../database/schema';
import { TournamentImportRepository } from './tournament-import.repository';
import { TournamentPaymentRepository } from './tournament-payment.repository';
import { TournamentBracketRepository } from './tournament-bracket.repository';
import * as capacityService from '../services/tournament-capacity.service';

// Integration test for addAthletePairs on real Postgres. Runs only when
// CON_TEST_DATABASE_URL points at a disposable, migrated database; otherwise
// the suite is skipped so the default `jest` run never touches a database.
// Fixtures are left in place: tournaments named "CON <id>" and users with
// emails "*.con.test".
const DB_URL = process.env.CON_TEST_DATABASE_URL;
const describeIfDb = DB_URL ? describe : describe.skip;

const client = postgres(DB_URL ?? '', { max: 8, onnotice: () => {} });
const db = drizzle(client, { schema });
const repo = new TournamentImportRepository(
  db,
  new TournamentPaymentRepository(db),
);
const bracketRepo = new TournamentBracketRepository(db, null as never);

jest.setTimeout(240_000);

type Counts = { participants: number; rosters: number };
type Settled =
  | { ok: true }
  | { ok: false; status: number | null; message: string };

function messageChain(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause: unknown = error.cause;
  return cause === undefined
    ? error.message
    : `${error.message} | ${messageChain(cause)}`;
}

async function settle(run: Promise<unknown>): Promise<Settled> {
  try {
    await run;
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      status: error instanceof HttpException ? error.getStatus() : null,
      message: messageChain(error),
    };
  }
}

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

async function seedTournament(organizerId: string, divisionMax: number) {
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
      name: 'Doubles',
      matchType: 'DOUBLES',
      maxParticipants: divisionMax,
    })
    .returning({ id: schema.tournamentDivisions.id });
  return { tournamentId: tournament.id, divisionId: division.id };
}

async function countRows(tournamentId: string): Promise<Counts> {
  const [participants] = await db
    .select({ n: count() })
    .from(schema.tournamentParticipants)
    .where(eq(schema.tournamentParticipants.tournamentId, tournamentId));
  const [rosters] = await db
    .select({ n: count() })
    .from(schema.tournamentRosters)
    .innerJoin(
      schema.tournamentParticipants,
      eq(
        schema.tournamentParticipants.id,
        schema.tournamentRosters.participantId,
      ),
    )
    .where(eq(schema.tournamentParticipants.tournamentId, tournamentId));
  return { participants: participants.n, rosters: rosters.n };
}

async function activeRosterCount(tournamentId: string, userId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(schema.tournamentRosters)
    .innerJoin(
      schema.tournamentParticipants,
      eq(
        schema.tournamentParticipants.id,
        schema.tournamentRosters.participantId,
      ),
    )
    .where(
      and(
        eq(schema.tournamentParticipants.tournamentId, tournamentId),
        eq(schema.tournamentRosters.userId, userId),
        eq(schema.tournamentRosters.status, 'ACTIVE'),
      ),
    );
  return row.n;
}

describeIfDb('addAthletePairs integration (Postgres thật)', () => {
  let organizerId: string;

  beforeAll(async () => {
    organizerId = await seedUser('organizer');
  });

  afterAll(async () => {
    await client.end();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const request = (
    tournamentId: string,
    divisionId: string,
    userIds: string[],
  ) =>
    repo.addAthletePairs(tournamentId, organizerId, {
      source: 'EMAIL',
      tournamentDivisionId: divisionId,
      userIds,
    });

  test('CON-001: hai request đồng thời chung một VĐV → đúng một thành công, một 409', async () => {
    const { tournamentId, divisionId } = await seedTournament(organizerId, 50);
    const [a, b, c, d, e, f, g] = await Promise.all(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((label) =>
        seedUser(`con1-${label}`),
      ),
    );
    const results = await Promise.all([
      settle(request(tournamentId, divisionId, [a, b, c, d])),
      settle(request(tournamentId, divisionId, [d, e, f, g])),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([
      expect.objectContaining({ status: 409 }),
    ]);
    expect(await countRows(tournamentId)).toEqual({
      participants: 2,
      rosters: 4,
    });
    expect(await activeRosterCount(tournamentId, d)).toBe(1);
  });

  test('CON-001 lặp 10 lần: mỗi lần đúng 1 thành công, VĐV chung có đúng 1 roster active', async () => {
    for (let i = 0; i < 10; i += 1) {
      const { tournamentId, divisionId } = await seedTournament(organizerId, 50);
      const [a, b, c, d, e, f, g] = await Promise.all(
        ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((label) =>
          seedUser(`con1r-${i}-${label}`),
        ),
      );
      const results = await Promise.all([
        settle(request(tournamentId, divisionId, [a, b, c, d])),
        settle(request(tournamentId, divisionId, [d, e, f, g])),
      ]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(await activeRosterCount(tournamentId, d)).toBe(1);
    }
  });

  test('CON-002: retry sau khi request đầu đã commit → 409, số hàng không đổi', async () => {
    const { tournamentId, divisionId } = await seedTournament(organizerId, 50);
    const a = await seedUser('con2-a');
    const b = await seedUser('con2-b');
    const first = await settle(request(tournamentId, divisionId, [a, b]));
    const before = await countRows(tournamentId);
    const retry = await settle(request(tournamentId, divisionId, [a, b]));
    const after = await countRows(tournamentId);
    expect(first).toEqual({ ok: true });
    expect(retry).toMatchObject({ ok: false, status: 409 });
    expect(after).toEqual(before);
    expect(after).toEqual({ participants: 1, rosters: 2 });
  });

  test('CON-006: hai request cùng division, user khác nhau, đồng thời → cả hai thành công, không deadlock', async () => {
    const { tournamentId, divisionId } = await seedTournament(organizerId, 50);
    const users = await Promise.all(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((label) =>
        seedUser(`con6-${label}`),
      ),
    );
    const results = await Promise.all([
      settle(request(tournamentId, divisionId, users.slice(0, 4))),
      settle(request(tournamentId, divisionId, users.slice(4, 8))),
    ]);
    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(await countRows(tournamentId)).toEqual({
      participants: 4,
      rosters: 8,
    });
  });

  test('CON-007: lô 4 VĐV, lỗi insert roster ở VĐV thứ 3 → rollback toàn bộ, retry sau đó thành công', async () => {
    const { tournamentId, divisionId } = await seedTournament(organizerId, 50);
    const [a, b, c, d] = await Promise.all(
      ['a', 'b', 'c', 'd'].map((label) => seedUser(`con7-${label}`)),
    );
    // Trigger chặn đúng roster của user c. UUID do randomUUID sinh nên nội suy an toàn.
    await db.execute(
      sql.raw(`
        CREATE OR REPLACE FUNCTION con_fail_roster() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.user_id = '${c}'::uuid THEN
            RAISE EXCEPTION 'CON-007 injected roster failure';
          END IF;
          RETURN NEW;
        END $$
      `),
    );
    await db.execute(
      sql.raw(`
        CREATE TRIGGER con_fail_roster_trg BEFORE INSERT ON tournament_rosters
          FOR EACH ROW EXECUTE FUNCTION con_fail_roster()
      `),
    );
    let first: Settled;
    let mid: Counts;
    try {
      first = await settle(request(tournamentId, divisionId, [a, b, c, d]));
      mid = await countRows(tournamentId);
    } finally {
      await db.execute(
        sql.raw('DROP TRIGGER IF EXISTS con_fail_roster_trg ON tournament_rosters'),
      );
      await db.execute(sql.raw('DROP FUNCTION IF EXISTS con_fail_roster()'));
    }
    const retry = await settle(request(tournamentId, divisionId, [a, b, c, d]));
    const end = await countRows(tournamentId);
    expect(first.ok).toBe(false);
    expect(first.ok ? '' : first.message).toContain(
      'CON-007 injected roster failure',
    );
    expect(mid).toEqual({ participants: 0, rosters: 0 });
    expect(retry).toEqual({ ok: true });
    expect(end).toEqual({ participants: 2, rosters: 4 });
  });

  test('CON-008: còn đúng 1 đội, hai lô khác user đồng thời → đúng một thành công', async () => {
    const { tournamentId, divisionId } = await seedTournament(organizerId, 1);
    const [a, b, c, d] = await Promise.all(
      ['a', 'b', 'c', 'd'].map((label) => seedUser(`con8-${label}`)),
    );
    const results = await Promise.all([
      settle(request(tournamentId, divisionId, [a, b])),
      settle(request(tournamentId, divisionId, [c, d])),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([
      expect.objectContaining({
        status: 409,
        message: 'Nội dung thi đấu đã đầy.',
      }),
    ]);
    expect(await countRows(tournamentId)).toEqual({
      participants: 1,
      rosters: 2,
    });
  });

  test('CON-008 lặp 10 lần: mỗi lần đúng 1 thành công, không overfill', async () => {
    for (let i = 0; i < 10; i += 1) {
      const { tournamentId, divisionId } = await seedTournament(organizerId, 1);
      const [a, b, c, d] = await Promise.all(
        ['a', 'b', 'c', 'd'].map((label) => seedUser(`con8r-${i}-${label}`)),
      );
      const results = await Promise.all([
        settle(request(tournamentId, divisionId, [a, b])),
        settle(request(tournamentId, divisionId, [c, d])),
      ]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(await countRows(tournamentId)).toEqual({
        participants: 1,
        rosters: 2,
      });
    }
  });

  test('CON-008 đối chứng (negative): tắt lockCapacityOwner → overfill xảy ra', async () => {
    const lockSpy = jest
      .spyOn(capacityService, 'lockCapacityOwner')
      .mockResolvedValue(undefined);
    const outcomes: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const { tournamentId, divisionId } = await seedTournament(organizerId, 1);
      const [a, b, c, d] = await Promise.all(
        ['a', 'b', 'c', 'd'].map((label) => seedUser(`con8n-${i}-${label}`)),
      );
      const results = await Promise.all([
        settle(request(tournamentId, divisionId, [a, b])),
        settle(request(tournamentId, divisionId, [c, d])),
      ]);
      outcomes.push(`ok=${results.filter((r) => r.ok).length}`);
    }
    expect(lockSpy).toHaveBeenCalled();
    expect(outcomes.some((o) => o === 'ok=2')).toBe(true);
  });

  test('SEED-001: pair COMPLETE do BTC ghép (organizerWaivedFee=true, isPaid=false) vẫn vào seeding bracket', async () => {
    const { tournamentId, divisionId } = await seedTournament(organizerId, 10);
    const u1 = await seedUser('seed1-a');
    const u2 = await seedUser('seed1-b');
    const result = await repo.addAthletePairs(tournamentId, organizerId, {
      source: 'EMAIL',
      tournamentDivisionId: divisionId,
      userIds: [u1, u2],
    });
    const participantId = result.pairs[0].participantId;
    const [row] = await db
      .select()
      .from(schema.tournamentParticipants)
      .where(eq(schema.tournamentParticipants.id, participantId));
    expect(row).toMatchObject({
      teamStatus: 'COMPLETE',
      isPaid: false,
      organizerWaivedFee: true,
    });

    const seeded = await bracketRepo.findParticipantsForSeeding(
      tournamentId,
      divisionId,
    );
    expect(seeded.map((p) => p.id)).toContain(participantId);
  });
});
