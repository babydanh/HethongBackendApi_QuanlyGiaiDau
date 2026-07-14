import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../schema';
import { eq } from 'drizzle-orm';
import { createPostgresClientFromEnv } from '../postgres-client';

const pg = createPostgresClientFromEnv({ ssl: undefined });
const db = drizzle(pg, { schema });

async function main() {
  const tourId = '7cacbc00-4fa1-48ae-9bb9-aa8c3699491d';
  const matches = await db.select({
    id: schema.matches.id,
    matchOrder: schema.matches.matchOrder,
    roundNumber: schema.matches.roundNumber,
    bracketBranch: schema.matches.bracketBranch,
    isBye: schema.matches.isBye,
    status: schema.matches.status,
    p1Id: schema.matches.participant1Id,
    p2Id: schema.matches.participant2Id,
    winnerId: schema.matches.winnerId,
    nextMatchId: schema.matches.nextMatchId,
    loserNextMatchId: schema.matches.loserNextMatchId,
  })
  .from(schema.matches)
  .where(eq(schema.matches.tournamentId, tourId))
  .orderBy(schema.matches.bracketBranch, schema.matches.roundNumber, schema.matches.matchOrder);

  const teamMap = new Map<string, string>();
  const participants = await db.select().from(schema.tournamentParticipants).where(eq(schema.tournamentParticipants.tournamentId, tourId));
  for (const p of participants) {
    teamMap.set(p.id, p.teamName);
  }

  console.log(`=== Matches for DE-13 (${tourId}) ===`);
  for (const m of matches) {
    const p1Name = m.p1Id ? teamMap.get(m.p1Id) || m.p1Id : 'TBD';
    const p2Name = m.p2Id ? teamMap.get(m.p2Id) || m.p2Id : (m.isBye ? 'BYE' : 'TBD');
    console.log(`[${m.bracketBranch} R${m.roundNumber} M${m.matchOrder}] status=${m.status} | p1=${p1Name} vs p2=${p2Name} | winner=${m.winnerId ? teamMap.get(m.winnerId) : 'None'} | next=${m.nextMatchId} | loserNext=${m.loserNextMatchId}`);
  }

  await pg.end();
}

main().catch(console.error);
