import { drizzle } from 'drizzle-orm/postgres-js';
import * as dotenv from 'dotenv';
import { roles } from '../schema/users.schema';
import { createPostgresClientFromEnv } from '../postgres-client';

import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function run() {
  console.log('DB Connection Debug:', {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_DATABASE
  });
  const sql = createPostgresClientFromEnv();
  const db = drizzle(sql);

  try {
    console.log('Seeding roles...');
    await db
      .insert(roles)
      .values([
        { name: 'ADMIN', slug: 'admin', description: 'Administrator' },
        {
          name: 'MODERATOR',
          slug: 'moderator',
          description: 'System Moderator',
        },
        {
          name: 'ORGANIZER',
          slug: 'organizer',
          description: 'Tournament Organizer',
        },
        {
          name: 'REFEREE',
          slug: 'referee',
          description: 'Match Referee',
        },
        { name: 'PLAYER', slug: 'player', description: 'Player' },
      ])
      .onConflictDoNothing();

    console.log('Roles seeded!');
  } finally {
    await sql.end();
  }
}

run().catch(console.error);
