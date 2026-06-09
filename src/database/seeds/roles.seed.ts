import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { roles } from '../schema/users.schema';

dotenv.config();

async function run() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: { rejectUnauthorized: false },
  });
  const db = drizzle(pool);

  console.log('Seeding roles...');
  await db
    .insert(roles)
    .values([
      { name: 'ADMIN', slug: 'admin', description: 'Administrator' },
      {
        name: 'ORGANIZER',
        slug: 'organizer',
        description: 'Tournament Organizer',
      },
      { name: 'PLAYER', slug: 'player', description: 'Player' },
    ])
    .onConflictDoNothing();

  console.log('Roles seeded!');
  pool.end();
}

run().catch(console.error);
