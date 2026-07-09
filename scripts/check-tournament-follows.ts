import * as dotenv from 'dotenv';
import { createPostgresClientFromEnv } from '../src/database/postgres-client';

dotenv.config();

async function run() {
  const sql = createPostgresClientFromEnv({ max: 1 });
  try {
    const tableCheck = await sql`
      select
        exists (
          select 1
          from information_schema.tables
          where table_schema = 'public' and table_name = 'tournament_follows'
        ) as table_exists
    `;

    const columns = await sql`
      select column_name, data_type
      from information_schema.columns
      where table_schema = 'public' and table_name = 'tournament_follows'
      order by ordinal_position
    `;

    const indexes = await sql`
      select indexname, indexdef
      from pg_indexes
      where schemaname = 'public' and tablename = 'tournament_follows'
      order by indexname
    `;

    const migrationsTable = await sql`
      select
        exists (
          select 1
          from information_schema.tables
          where table_schema = 'drizzle' and table_name = '__drizzle_migrations'
        ) as exists_in_drizzle_schema,
        exists (
          select 1
          from information_schema.tables
          where table_schema = 'public' and table_name = '__drizzle_migrations'
        ) as exists_in_public_schema
    `;

    let migrations: unknown = [];
    if (migrationsTable[0]?.exists_in_drizzle_schema) {
      migrations = await sql`select * from drizzle.__drizzle_migrations order by created_at`;
    } else if (migrationsTable[0]?.exists_in_public_schema) {
      migrations = await sql`select * from public.__drizzle_migrations order by created_at`;
    }

    console.log(JSON.stringify({
      tableCheck,
      columns,
      indexes,
      migrationsTable,
      migrations,
    }, null, 2));
  } finally {
    await sql.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
