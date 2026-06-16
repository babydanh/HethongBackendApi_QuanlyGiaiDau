import * as dotenv from 'dotenv';
import { createPostgresClientFromEnv } from './src/database/postgres-client';
dotenv.config();

async function run() {
  const sql = createPostgresClientFromEnv({
    max: 1,
  });
  try {
    const rows = await sql`SELECT * FROM roles`;
    console.log('Roles:', rows);
  } finally {
    await sql.end();
  }
}
run().catch(console.error);
