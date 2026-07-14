import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../schema';
import { sql, eq, and, inArray } from 'drizzle-orm';
import { createPostgresClientFromEnv } from '../postgres-client';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

const uuidv4 = () => crypto.randomUUID();
const sqlClient = createPostgresClientFromEnv({ ssl: undefined });
const db = drizzle(sqlClient, { schema });
const BASE_URL = 'http://localhost:3000/api/v1';

async function api(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body, headers: res.headers };
}

function generateBadmintonScore(winner: 1 | 2) {
  const isThreeSets = Math.random() > 0.5;
  const sets: any[] = [];
  if (winner === 1) {
    if (isThreeSets) {
      sets.push({ team1Score: 21, team2Score: 15, isFinished: true });
      sets.push({ team1Score: 18, team2Score: 21, isFinished: true });
      sets.push({ team1Score: 21, team2Score: 16, isFinished: true });
      return { p1SetsWon: 2, p2SetsWon: 1, scoreDetails: { sets } };
    } else {
      sets.push({ team1Score: 21, team2Score: 15, isFinished: true });
      sets.push({ team1Score: 21, team2Score: 17, isFinished: true });
      return { p1SetsWon: 2, p2SetsWon: 0, scoreDetails: { sets } };
    }
  } else {
    if (isThreeSets) {
      sets.push({ team1Score: 15, team2Score: 21, isFinished: true });
      sets.push({ team1Score: 21, team2Score: 18, isFinished: true });
      sets.push({ team1Score: 16, team2Score: 21, isFinished: true });
      return { p1SetsWon: 1, p2SetsWon: 2, scoreDetails: { sets } };
    } else {
      sets.push({ team1Score: 15, team2Score: 21, isFinished: true });
      sets.push({ team1Score: 17, team2Score: 21, isFinished: true });
      return { p1SetsWon: 0, p2SetsWon: 2, scoreDetails: { sets } };
    }
  }
}

async function playAllMatches(tournamentId: string, authHeaders: any) {
  console.log(`[Matches] Playing matches for tournament ${tournamentId}...`);
  let hasPlayableMatches = true;
  let iteration = 0;

  while (hasPlayableMatches && iteration < 15) {
    iteration++;
    const res = await api(`/matches?tournamentId=${tournamentId}&limit=200`, { headers: authHeaders });
    const matches = Array.isArray(res.body?.data) ? res.body.data
      : Array.isArray(res.body) ? res.body : [];

    if (matches.length === 0) break;

    const playable = matches.filter((m: any) =>
      m.participant1?.id &&
      m.participant2?.id &&
      m.status !== 'COMPLETED' &&
      !m.isBye
    );

    console.log(`  -> Iteration ${iteration}: Total ${matches.length} matches, playable in this round: ${playable.length}`);
    if (playable.length === 0) {
      hasPlayableMatches = false;
      break;
    }

    for (const match of playable) {
      const winnerSide = (parseInt(match.id.substring(0, 2), 16) % 2 === 0) ? 1 : 2;
      const winnerId = winnerSide === 1 ? match.participant1.id : match.participant2.id;
      const score = generateBadmintonScore(winnerSide);

      await api(`/matches/${match.id}/score`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({
          p1SetsWon: score.p1SetsWon,
          p2SetsWon: score.p2SetsWon,
          winnerId,
          scoreDetails: score.scoreDetails,
        }),
      });
    }
  }
}

async function createTournament(params: {
  name: string;
  bracketType: string;
  numTeams: number;
  venueId: string;
  categoryId: string;
  organizerId: string;
  groupConfig?: any;
}) {
  const { name, bracketType, numTeams, venueId, categoryId, organizerId, groupConfig } = params;
  const tourId = uuidv4();
  const inviteCode = `TC-${bracketType.substring(0,2).toUpperCase()}-${numTeams}-${Date.now().toString().slice(-4)}`;

  await db.insert(schema.tournaments).values({
    id: tourId,
    name,
    categoryId,
    createdBy: organizerId,
    status: 'IN_PROGRESS',
    matchType: 'SINGLES',
    sportRules: { kind: 'BADMINTON', setsToWin: 2, pointsPerSet: 21, winByTwo: true },
    tournamentConfig: {
      bracketType,
      maxTeams: numTeams,
      roundRobinLegs: 1,
      groupConfig,
    },
    venueId,
    entryFee: '0',
    tournamentType: 'PUBLIC',
    visibility: 'PUBLIC',
    maxParticipants: numTeams,
    registrationStartDate: new Date(),
    registrationEndDate: new Date(Date.now() + 30 * 86400000),
    startDate: new Date(),
    endDate: new Date(Date.now() + 10 * 86400000),
    inviteCode,
    isRanked: true,
  });

  const divisionId = uuidv4();
  await db.insert(schema.tournamentDivisions).values({
    id: divisionId,
    tournamentId: tourId,
    name,
    matchType: 'SINGLES',
    bracketType,
    status: 'ACTIVE',
    entryFee: '0',
  });

  // Create teams
  for (let i = 1; i <= numTeams; i++) {
    await db.insert(schema.tournamentParticipants).values({
      id: uuidv4(),
      tournamentId: tourId,
      tournamentDivisionId: divisionId,
      registeredBy: organizerId,
      teamName: `Đội ${String.fromCharCode(64 + i)}`,
      teamStatus: 'COMPLETE',
      isMock: true,
      isPaid: true,
    });
  }

  console.log(`Created ${name}: ${numTeams} teams.`);
  return { tourId, divisionId };
}

async function main() {
  console.log('=== SEED CUSTOM PLAYED BRACKETS START ===\n');

  // 1. Clean old custom seed tournaments
  const oldTours = await db.select().from(schema.tournaments).where(sql`invite_code LIKE 'TC-%'`);
  const oldTourIds = oldTours.map(t => t.id);
  if (oldTourIds.length > 0) {
    console.log('Cleaning old custom seeds...');
    const stages = await db.select().from(schema.tournamentStages).where(inArray(schema.tournamentStages.tournamentId, oldTourIds));
    const stageIds = stages.map(s => s.id);
    if (stageIds.length > 0) {
      const groups = await db.select().from(schema.tournamentGroups).where(inArray(schema.tournamentGroups.stageId, stageIds));
      const groupIds = groups.map(g => g.id);
      if (groupIds.length > 0) {
        await db.delete(schema.groupStandings).where(inArray(schema.groupStandings.groupId, groupIds));
        await db.delete(schema.matches).where(inArray(schema.matches.groupId, groupIds));
        await db.delete(schema.tournamentGroups).where(inArray(schema.tournamentGroups.stageId, stageIds));
      }
      await db.delete(schema.tournamentStages).where(inArray(schema.tournamentStages.tournamentId, oldTourIds));
    }
    await db.delete(schema.tournamentParticipants).where(inArray(schema.tournamentParticipants.tournamentId, oldTourIds));
    await db.delete(schema.tournamentDivisions).where(inArray(schema.tournamentDivisions.tournamentId, oldTourIds));
    await db.delete(schema.tournaments).where(inArray(schema.tournaments.id, oldTourIds));
  }

  // 2. Fetch dependencies
  const badmintonCat = await db.select().from(schema.categories).where(eq(schema.categories.slug, 'badminton')).limit(1).then(r => r[0]);
  if (!badmintonCat) {
    console.error('Badminton category not found. Run category seeds first.');
    return;
  }
  const orgUser = await db.select().from(schema.users).where(eq(schema.users.email, 'organizer@vndcsport.com')).limit(1).then(r => r[0]);
  if (!orgUser) {
    console.error('Organizer user not found. Run user seeds first.');
    return;
  }

  let venue = await db.select().from(schema.tournamentVenues).limit(1).then(r => r[0]);
  if (!venue) {
    const venueId = uuidv4();
    [venue] = await db.insert(schema.tournamentVenues).values({
      id: venueId, name: 'Nhà thi đấu Trung tâm', locationAddress: 'Hà Nội',
    }).returning();
  }

  // 3. Login
  const login = await api('/auth/mobile/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'organizer@vndcsport.com', password: 'password123' }),
  });
  const loginBody = login.body as any;
  const token = loginBody?.data?.accessToken || loginBody?.accessToken || '';
  if (!token) {
    console.error('Login failed.');
    return;
  }
  const authHeaders = { 'Authorization': `Bearer ${token}` };

  // ───────────────────────────────────────────────────────────────────────────
  // A. TOURNAMENT 1: Round Robin 8 Teams (Full played)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- Seeding Round Robin 8 Teams (Full Played) ---');
  const rr = await createTournament({
    name: 'Giải Vòng Tròn 8 Đội (Đã đấu có điểm)',
    bracketType: 'round_robin',
    numTeams: 8,
    venueId: venue.id,
    categoryId: badmintonCat.id,
    organizerId: orgUser.id,
  });

  // Set to DRAFT for bracket generation
  await db.update(schema.tournaments).set({ status: 'DRAFT' }).where(eq(schema.tournaments.id, rr.tourId));
  const genRr = await api(`/tournaments/${rr.tourId}/generate-bracket`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ divisionId: rr.divisionId }),
  });
  if (!genRr.ok) console.error('Failed to generate bracket for RR', genRr.body);
  await db.update(schema.tournaments).set({ status: 'IN_PROGRESS' }).where(eq(schema.tournaments.id, rr.tourId));

  // Play matches
  await playAllMatches(rr.tourId, authHeaders);

  // ───────────────────────────────────────────────────────────────────────────
  // B. TOURNAMENT 2: Group Stage + Playoffs 6 Teams (Even chẵn)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- Seeding Group Stage + Playoffs 6 Teams (Even Chẵn) ---');
  const gpEven = await createTournament({
    name: 'Vòng Bảng + Playoffs 6 Đội (Chẵn)',
    bracketType: 'group_stage_knockout',
    numTeams: 6,
    venueId: venue.id,
    categoryId: badmintonCat.id,
    organizerId: orgUser.id,
    groupConfig: {
      stages: [
        {
          stageName: 'Vòng Bảng',
          groups: [
            { groupName: 'Bảng A', teams: 3 },
            { groupName: 'Bảng B', teams: 3 }
          ],
          advanceConfig: {
            teamsPerGroupToAdvance: 2, // Lấy nhất nhì bảng vào Bán kết
            playoffFormat: 'SINGLE_ELIMINATION'
          }
        }
      ]
    }
  });

  await db.update(schema.tournaments).set({ status: 'DRAFT' }).where(eq(schema.tournaments.id, gpEven.tourId));
  const genEven = await api(`/tournaments/${gpEven.tourId}/generate-bracket`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ divisionId: gpEven.divisionId }),
  });
  if (!genEven.ok) console.error('Failed to generate bracket for GP Even', genEven.body);
  await db.update(schema.tournaments).set({ status: 'IN_PROGRESS' }).where(eq(schema.tournaments.id, gpEven.tourId));

  // Play group stage matches
  await playAllMatches(gpEven.tourId, authHeaders);

  // Advance to Playoffs (Stage 2)
  console.log('  Advancing GP Even to Playoffs...');
  const stageEven = await db.select().from(schema.tournamentStages).where(and(eq(schema.tournamentStages.tournamentId, gpEven.tourId), eq(schema.tournamentStages.order, 1))).limit(1).then(r => r[0]);
  if (stageEven) {
    const adv = await api(`/tournaments/${gpEven.tourId}/advance-standings`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ divisionId: gpEven.divisionId, stageId: stageEven.id }),
    });
    if (!adv.ok) console.error('Failed to advance standings for GP Even', adv.body);
    
    // Play playoff matches
    await playAllMatches(gpEven.tourId, authHeaders);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // C. TOURNAMENT 3: Group Stage + Playoffs 5 Teams (Odd lẻ)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- Seeding Group Stage + Playoffs 5 Teams (Odd Lẻ) ---');
  const gpOdd = await createTournament({
    name: 'Vòng Bảng + Playoffs 5 Đội (Lẻ)',
    bracketType: 'group_stage_knockout',
    numTeams: 5,
    venueId: venue.id,
    categoryId: badmintonCat.id,
    organizerId: orgUser.id,
    groupConfig: {
      stages: [
        {
          stageName: 'Vòng Bảng',
          groups: [
            { groupName: 'Bảng A', teams: 3 },
            { groupName: 'Bảng B', teams: 2 }
          ],
          advanceConfig: {
            teamsPerGroupToAdvance: 2,
            playoffFormat: 'SINGLE_ELIMINATION'
          }
        }
      ]
    }
  });

  await db.update(schema.tournaments).set({ status: 'DRAFT' }).where(eq(schema.tournaments.id, gpOdd.tourId));
  const genOdd = await api(`/tournaments/${gpOdd.tourId}/generate-bracket`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ divisionId: gpOdd.divisionId }),
  });
  if (!genOdd.ok) console.error('Failed to generate bracket for GP Odd', genOdd.body);
  await db.update(schema.tournaments).set({ status: 'IN_PROGRESS' }).where(eq(schema.tournaments.id, gpOdd.tourId));

  // Play group stage matches
  await playAllMatches(gpOdd.tourId, authHeaders);

  // Advance to Playoffs (Stage 2)
  console.log('  Advancing GP Odd to Playoffs...');
  const stageOdd = await db.select().from(schema.tournamentStages).where(and(eq(schema.tournamentStages.tournamentId, gpOdd.tourId), eq(schema.tournamentStages.order, 1))).limit(1).then(r => r[0]);
  if (stageOdd) {
    const adv = await api(`/tournaments/${gpOdd.tourId}/advance-standings`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ divisionId: gpOdd.divisionId, stageId: stageOdd.id }),
    });
    if (!adv.ok) console.error('Failed to advance standings for GP Odd', adv.body);

    // Play playoff matches
    await playAllMatches(gpOdd.tourId, authHeaders);
  }

  await sqlClient.end();
  console.log('\n=== SEED CUSTOM PLAYED BRACKETS COMPLETE ===');
}

main().catch(async (err) => {
  console.error('Error:', err);
  await sqlClient.end();
  process.exit(1);
});
