import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../schema';
import { eq } from 'drizzle-orm';
import { createPostgresClientFromEnv } from '../postgres-client';

const pg = createPostgresClientFromEnv({ ssl: undefined });
const db = drizzle(pg, { schema });

async function main() {
  const matchId = '9c553280-89a3-4741-af8c-a4f24dfe9cec';
  const [match] = await db.select().from(schema.matches).where(eq(schema.matches.id, matchId)).limit(1);
  console.log('=== Match Details for 9c553280-89a3-4741-af8c-a4f24dfe9cec ===');
  console.log(JSON.stringify(match, null, 2));
  await pg.end();
}

main().catch(console.error);
