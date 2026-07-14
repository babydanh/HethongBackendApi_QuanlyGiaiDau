import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../schema';
import { sql } from 'drizzle-orm';
import { createPostgresClientFromEnv } from '../postgres-client';

const pg = createPostgresClientFromEnv({ ssl: undefined });
const db = drizzle(pg, { schema });
const BASE = 'http://localhost:3000/api/v1';

async function api(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body, headers: res.headers };
}

// Helper to generate a valid badminton score without validation failures
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

async function main() {
  console.log('=== SEED SCORES & PLAY MATCHES ===\n');

  // 1. Login as organizer to get auth headers
  console.log('1. Login as organizer...');
  const login = await api('/auth/mobile/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'organizer@vndcsport.com', password: 'password123' }),
  });
  const loginBody = login.body as any;
  const token = loginBody?.data?.accessToken || loginBody?.accessToken || '';
  if (!token) {
    console.error('Login failed, no token in response');
    return;
  }
  const authHeaders = { 'Authorization': `Bearer ${token}` };
  console.log('  OK\n');

  // 2. Get all test tournaments (invite code starting with 'T')
  const tours = await db.select().from(schema.tournaments)
    .where(sql`invite_code LIKE 'T%'`)
    .orderBy(schema.tournaments.createdAt);

  console.log(`2. Found ${tours.length} tournaments to play\n`);

  for (const tour of tours) {
    if (tour.name.includes('Round Robin') || tour.name.startsWith('RR-')) {
      console.log(`Skipping match playing simulation for Round Robin tournament: ${tour.name}`);
      continue;
    }
    console.log(`\n--------------------------------------------`);
    console.log(`Playing tournament: ${tour.name} (${tour.id})`);
    console.log(`--------------------------------------------`);

    let loop = true;
    let iteration = 0;
    const maxIterations = 15; // Safe guard

    while (loop && iteration < maxIterations) {
      iteration++;
      console.log(`\n[Iteration ${iteration}] Fetching matches...`);
      
      // Get all matches for this tournament (with high limit to bypass pagination)
      const matchRes = await api(`/matches?tournamentId=${tour.id}&limit=200`, { headers: authHeaders });
      const matches = Array.isArray(matchRes.body?.data) ? matchRes.body.data
        : Array.isArray(matchRes.body) ? matchRes.body : [];

      if (matches.length === 0) {
        console.log('  No matches found for this tournament.');
        break;
      }

      // Filter matches that are ready to be played:
      // - Must have both participant1 and participant2
      // - Status must not be COMPLETED
      // - Must not be a BYE
      const playableMatches = matches.filter((m: any) => 
        m.participant1?.id && 
        m.participant2?.id && 
        m.status !== 'COMPLETED' && 
        !m.isBye
      );

      console.log(`  Total matches: ${matches.length}, Playable matches in this round: ${playableMatches.length}`);

      if (playableMatches.length === 0) {
        console.log('  No more playable matches. Tournament is fully played or waiting.');
        loop = false;
        break;
      }

      for (const match of playableMatches) {
        // Deterministically pick a winner to ensure a predictable seeding flow (e.g. alternate or use odd/even id)
        const winnerSide = (parseInt(match.id.substring(0, 2), 16) % 2 === 0) ? 1 : 2;
        const winnerId = winnerSide === 1 ? match.participant1.id : match.participant2.id;
        
        console.log(`  -> Playing Match #${match.matchOrder} (Round ${match.roundNumber}): ${match.participant1.teamName} vs ${match.participant2.teamName}`);
        
        const score = generateBadmintonScore(winnerSide);
        
        // Call PATCH /matches/:id/score
        const scoreUpdate = await api(`/matches/${match.id}/score`, {
          method: 'PATCH',
          headers: authHeaders,
          body: JSON.stringify({
            p1SetsWon: score.p1SetsWon,
            p2SetsWon: score.p2SetsWon,
            winnerId: winnerId,
            scoreDetails: score.scoreDetails,
          }),
        });

        if (scoreUpdate.ok) {
          const winnerName = winnerSide === 1 ? match.participant1.teamName : match.participant2.teamName;
          console.log(`     OK: ${winnerName} won (${score.p1SetsWon}-${score.p2SetsWon})`);
        } else {
          console.error(`     FAILED to update score: Status ${scoreUpdate.status}`, JSON.stringify(scoreUpdate.body));
        }
      }
    }
  }

  await pg.end();
  console.log(`\n=== ALL MATCHES SEEDED & PLAYED SUCCESSFULLY ===`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
