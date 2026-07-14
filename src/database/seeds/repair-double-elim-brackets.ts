import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import * as schema from '../schema';
import { createPostgresClientFromEnv } from '../postgres-client';

const pg = createPostgresClientFromEnv({ ssl: undefined });
const db = drizzle(pg, { schema });
const BASE = process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1';
const FORCE = process.env.FORCE_REPAIR === 'true';

function parseCsv(value?: string): string[] {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function api(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body };
}

async function loginOrganizer() {
  const login = await api('/auth/mobile/login', {
    method: 'POST',
    body: JSON.stringify({
      email: process.env.REPAIR_EMAIL ?? 'organizer@vndcsport.com',
      password: process.env.REPAIR_PASSWORD ?? 'password123',
    }),
  });

  const loginBody = login.body as any;
  const token = loginBody?.data?.accessToken || loginBody?.accessToken || '';
  if (!token) {
    throw new Error(`Login failed: ${JSON.stringify(login.body).slice(0, 200)}`);
  }
  return token as string;
}

async function deleteBracketData(tournamentId: string, divisionId?: string) {
  const stageConditions = [
    eq(schema.tournamentStages.tournamentId, tournamentId),
    isNull(schema.tournamentStages.deletedAt),
  ];
  if (divisionId) {
    stageConditions.push(eq(schema.tournamentStages.tournamentDivisionId, divisionId));
  }

  const stages = await db
    .select({ id: schema.tournamentStages.id })
    .from(schema.tournamentStages)
    .where(and(...stageConditions));

  if (stages.length === 0) return;

  const stageIds = stages.map((stage) => stage.id);
  const groups = await db
    .select({ id: schema.tournamentGroups.id })
    .from(schema.tournamentGroups)
    .where(inArray(schema.tournamentGroups.stageId, stageIds));

  const groupIds = groups.map((group) => group.id);

  if (groupIds.length > 0) {
    await db.delete(schema.groupStandings).where(inArray(schema.groupStandings.groupId, groupIds));
    await db.delete(schema.matches).where(inArray(schema.matches.groupId, groupIds));
    await db.delete(schema.tournamentGroups).where(inArray(schema.tournamentGroups.stageId, stageIds));
  }

  await db.delete(schema.tournamentStages).where(inArray(schema.tournamentStages.id, stageIds));
}

async function repairDivision(
  token: string,
  tournament: { id: string; name: string; status: string; inviteCode: string | null },
  division: { id: string; name: string; bracketType: string | null },
) {
  const bracketType = (division.bracketType || '').toUpperCase();
  if (bracketType !== 'DOUBLE_ELIMINATION') return { skipped: true, reason: 'not double elimination' };

  if (!FORCE && (tournament.status === 'IN_PROGRESS' || tournament.status === 'COMPLETED')) {
    return { skipped: true, reason: `tournament status is ${tournament.status}` };
  }

  console.log(`- Repairing ${tournament.name} / ${division.name}`);

  const originalStatus = tournament.status;
  try {
    if (originalStatus !== 'DRAFT') {
      await db.update(schema.tournaments)
        .set({ status: 'DRAFT', updatedAt: new Date() })
        .where(eq(schema.tournaments.id, tournament.id));
    }

    await deleteBracketData(tournament.id, division.id);

    const gen = await api(`/tournaments/${tournament.id}/generate-bracket`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ divisionId: division.id }),
    });

    if (!gen.ok) {
      throw new Error(`generate-bracket failed for ${tournament.name} / ${division.name}: ${gen.status} ${JSON.stringify(gen.body).slice(0, 200)}`);
    }

    return { repaired: true };
  } finally {
    if (originalStatus !== 'DRAFT') {
      await db.update(schema.tournaments)
        .set({ status: originalStatus, updatedAt: new Date() })
        .where(eq(schema.tournaments.id, tournament.id));
    }
  }
}

async function main() {
  const targetIds = parseCsv(process.env.TARGET_TOURNAMENT_IDS);
  const invitePrefix = process.env.INVITE_PREFIX ?? 'T';

  const tournaments = await db
    .select({
      id: schema.tournaments.id,
      name: schema.tournaments.name,
      status: schema.tournaments.status,
      inviteCode: schema.tournaments.inviteCode,
    })
    .from(schema.tournaments)
    .where(isNull(schema.tournaments.deletedAt));

  const targetTournaments = targetIds.length > 0
    ? tournaments.filter((t) => targetIds.includes(t.id))
    : tournaments.filter((t) => (t.inviteCode || '').startsWith(invitePrefix));

  if (targetTournaments.length === 0) {
    console.log('No tournaments matched the repair scope.');
    return;
  }

  const token = await loginOrganizer();
  console.log(`Repairing ${targetTournaments.length} tournament(s)...`);

  let repaired = 0;
  let skipped = 0;

  for (const tournament of targetTournaments) {
    const divisions = await db
      .select({
        id: schema.tournamentDivisions.id,
        name: schema.tournamentDivisions.name,
        bracketType: schema.tournamentDivisions.bracketType,
      })
      .from(schema.tournamentDivisions)
      .where(eq(schema.tournamentDivisions.tournamentId, tournament.id));

    const doubleElimDivisions = divisions.filter(
      (division) => (division.bracketType || '').toUpperCase() === 'DOUBLE_ELIMINATION',
    );

    if (doubleElimDivisions.length === 0) {
      skipped++;
      continue;
    }

    for (const division of doubleElimDivisions) {
      try {
        const result = await repairDivision(token, tournament, division);
        if (result.skipped) {
          skipped++;
          console.log(`- Skipped ${tournament.name} / ${division.name}: ${result.reason}`);
        } else {
          repaired++;
        }
      } catch (error: any) {
        skipped++;
        console.log(`- Failed ${tournament.name} / ${division.name}: ${error?.message || error}`);
      }
    }
  }

  await pg.end();
  console.log(`Done. repaired=${repaired}, skipped=${skipped}`);
}

main().catch(async (error) => {
  console.error(error);
  await pg.end().catch(() => undefined);
  process.exit(1);
});
