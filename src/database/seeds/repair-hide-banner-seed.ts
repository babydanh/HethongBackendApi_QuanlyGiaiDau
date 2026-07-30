import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import * as schema from '../schema';
import { createPostgresClientFromEnv } from '../postgres-client';

const sqlClient = createPostgresClientFromEnv({ ssl: undefined });
const db = drizzle(sqlClient, { schema });

async function main() {
  const rows = await db.select().from(schema.tournaments);
  let repaired = 0;

  for (const tournament of rows) {
    const config = (tournament.tournamentConfig as Record<string, unknown>) || {};
    if (config.hideFeaturedCardText !== true) continue;

    await db
      .update(schema.tournaments)
      .set({ tournamentConfig: { ...config, hideFeaturedCardText: false } })
      .where(eq(schema.tournaments.id, tournament.id));
    repaired += 1;
  }

  console.log(`Reset hideFeaturedCardText=false for ${repaired} tournaments.`);
  await sqlClient.end();
}

main().catch(async (error) => {
  console.error('Failed to repair hide banner seed:', error);
  await sqlClient.end();
  process.exit(1);
});
