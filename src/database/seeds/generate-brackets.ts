import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../schema';
import { sql, eq } from 'drizzle-orm';
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

async function main() {
  console.log('=== GENERATE BRACKETS ===\n');

  // 1. Login as organizer (use mobile endpoint which returns tokens in body)
  console.log('1. Login as organizer...');
  const login = await api('/auth/mobile/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'organizer@vndcsport.com', password: 'password123' }),
  });
  const loginBody = login.body as any;
  const token = loginBody?.data?.accessToken || loginBody?.accessToken || '';
  if (!token) {
    console.error('Login failed, no token in response');
    console.error('  Response:', JSON.stringify(login.body).substring(0, 200));
    console.error('  Tip: use POST /auth/mobile/login (web login strips tokens from body)');
    return;
  }
  const authHeaders = { 'Authorization': `Bearer ${token}` };
  console.log('  OK\n');

  // 2. Get test tournaments (those created by seed-test.ts with invite_code LIKE 'T%')
  const tours = await db.select().from(schema.tournaments)
    .where(sql`invite_code LIKE 'T%'`)
    .orderBy(schema.tournaments.createdAt);

  console.log(`2. Found ${tours.length} tournaments\n`);

  let successCount = 0;
  let failCount = 0;
  let totalMatches = 0;

  for (const tour of tours) {
    process.stdout.write(`[${tour.name.substring(0, 30).padEnd(31)}] `);

    try {
      // ─── Get division ───────────────────────────────────────────────────
      const div = await api(`/tournaments/${tour.id}/divisions`, { headers: authHeaders });
      const divisions = Array.isArray(div.body?.data) ? div.body.data
        : Array.isArray(div.body) ? div.body : [];
      const divId = divisions[0]?.id;
      if (!divId) {
        console.log(`No division (data=${JSON.stringify(div.body).substring(0, 80)})`);
        failCount++;
        continue;
      }

      // ─── Step 1: Change tournament to DRAFT (generate-bracket blocks IN_PROGRESS/COMPLETED) ──
      await db.update(schema.tournaments)
        .set({ status: 'DRAFT' })
        .where(eq(schema.tournaments.id, tour.id));
      // Division stays as-is — only tournament status matters for generateBracket check

      // ─── Step 2: Try generate-bracket ──────────────────────────────────
      let gen = await api(`/tournaments/${tour.id}/generate-bracket`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ divisionId: divId }),
      });

      // ─── Step 3: If error, try publish → regenerate ────────────────────
      if (!gen.ok) {
        console.log(`\n    First attempt failed (${gen.status}), trying publish first...`);

        // Publish requires: description, bannerUrl, startDate, endDate,
        // registrationStartDate, registrationEndDate, venueId, entryFee
        // Seed tournaments may be missing description & bannerUrl — fill them.
        await db.update(schema.tournaments)
          .set({
            description: tour.description || `Bracket test for ${tour.name}`,
            bannerUrl: tour.bannerUrl || 'https://placehold.co/1200x400?text=Tournament',
          })
          .where(eq(schema.tournaments.id, tour.id));

        const pub = await api(`/tournaments/${tour.id}/publish`, {
          method: 'POST',
          headers: authHeaders,
        });

        if (pub.ok) {
          console.log(`    Publish OK (status: ${pub.body?.status || 'set'}), retrying bracket generation...`);
          gen = await api(`/tournaments/${tour.id}/generate-bracket`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ divisionId: divId }),
          });
        } else {
          // Publish itself failed — log but don't retry
          console.log(`    Publish failed (${pub.status}): ${JSON.stringify(pub.body).substring(0, 120)}`);
          console.log(`    Skipping tournament.`);
          failCount++;
          continue;
        }
      }

      if (!gen.ok) {
        console.log(`Error ${gen.status}: ${JSON.stringify(gen.body).substring(0, 120)}`);
        failCount++;
        continue;
      }

      // ─── Step 4: Set tournament to IN_PROGRESS so bracket is visible on UI ──
      await db.update(schema.tournaments)
        .set({ status: 'IN_PROGRESS' })
        .where(eq(schema.tournaments.id, tour.id));
      await db.update(schema.tournamentDivisions)
        .set({ status: 'ACTIVE' })
        .where(eq(schema.tournamentDivisions.tournamentId, tour.id));

      // ─── Step 5: Verify matches were created ──────────────────────────
      const matchRes = await api(`/matches?tournamentId=${tour.id}`, { headers: authHeaders });
      const matches = Array.isArray(matchRes.body?.data) ? matchRes.body.data
        : Array.isArray(matchRes.body) ? matchRes.body : [];

      // Verify matches have essential fields
      let validMatches = 0;
      for (const m of matches) {
        if (m.round_number != null && m.match_order != null) {
          validMatches++;
        }
      }

      totalMatches += matches.length;
      successCount++;
      console.log(`Bracket OK → ${matches.length} matches (${validMatches} with round/match_order)`);
    } catch (err: any) {
      console.log(`Error: ${err.message}`);
      failCount++;
    }
  }

  await pg.end();
  console.log(`\n=== DONE ===`);
  console.log(`  Successful: ${successCount}`);
  console.log(`  Failed:     ${failCount}`);
  console.log(`  Total matches: ${totalMatches}`);
}

main().catch(err => { console.error(err); process.exit(1); });
