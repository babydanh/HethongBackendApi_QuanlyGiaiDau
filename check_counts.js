require('dotenv').config();
const postgres = require('postgres');

const sql = postgres({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false },
  prepare: false,
});

async function check() {
  try {
    // Check with AND condition
    const count1 = await sql`
      SELECT COUNT(*) FROM "tournaments" 
      WHERE "parent_id" IS NOT NULL
    `;
    console.log('Tournaments with parent_id IS NOT NULL:', count1[0].count);

    // Check with AND deleted_at IS NULL
    const count2 = await sql`
      SELECT COUNT(*) FROM "tournaments" 
      WHERE "parent_id" IS NOT NULL AND "deleted_at" IS NULL
    `;
    console.log('Tournaments with parent_id IS NOT NULL AND deleted_at IS NULL:', count2[0].count);

    // Check what's with deleted_at
    const count3 = await sql`
      SELECT COUNT(*) FROM "tournaments" 
      WHERE "parent_id" IS NOT NULL AND "deleted_at" IS NOT NULL
    `;
    console.log('Tournaments with parent_id NOT NULL but deleted_at NOT NULL:', count3[0].count);

    // List them
    const list = await sql`
      SELECT id, name, parent_id, deleted_at FROM "tournaments" 
      WHERE "parent_id" IS NOT NULL 
      ORDER BY deleted_at DESC
      LIMIT 10
    `;
    console.log('\nFirst 10 tournaments with parent_id:');
    list.forEach((row, idx) => {
      console.log(`${idx + 1}. ID: ${row.id.substring(0, 8)}... Name: ${row.name} | Deleted: ${row.deleted_at ? 'YES' : 'NO'}`);
    });

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await sql.end();
  }
}

check();
