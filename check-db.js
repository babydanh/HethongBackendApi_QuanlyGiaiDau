require('dotenv').config();
const postgres = require('postgres');

async function checkDb() {
  const sql = postgres({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: { rejectUnauthorized: false },
    prepare: false,
  });

  try {
    console.log('Connected to DB.');
    
    // Check drizzle migration table
    const migTable = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'
      );
    `;
    console.log('__drizzle_migrations exists:', migTable[0].exists);

    if (migTable[0].exists) {
      const migs = await sql`
        SELECT id, hash, created_at
        FROM drizzle.__drizzle_migrations
        ORDER BY created_at;
      `;
      console.log('Migrations in DB:', migs);
    }

    // List all tables in public schema
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `;
    console.log('Tables in public schema:', tables.map((row) => row.table_name));

  } catch (err) {
    console.error('Error checking DB:', err.message);
  } finally {
    await sql.end();
  }
}

checkDb();
