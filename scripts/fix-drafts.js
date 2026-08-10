const { Pool } = require('pg');
require('dotenv').config({ path: '.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      WITH ParentStatus AS (
        SELECT parent_id, MAX(status) as max_status
        FROM tournaments
        WHERE parent_id IS NOT NULL
        GROUP BY parent_id
        HAVING COUNT(DISTINCT status) > 1
      )
      SELECT p.parent_id, p.max_status, t.id as division_id, t.status as old_status
      FROM ParentStatus p
      JOIN tournaments t ON t.parent_id = p.parent_id
      WHERE t.status = 'DRAFT' AND p.max_status != 'DRAFT';
    `);
    
    console.log(`Found ${res.rows.length} divisions stuck in DRAFT.`);
    
    for (const row of res.rows) {
      console.log(`Updating division ${row.division_id} from DRAFT to ${row.max_status}`);
      await client.query(
        'UPDATE tournaments SET status = $1 WHERE id = $2',
        [row.max_status, row.division_id]
      );
    }
    
    console.log('Done!');
  } finally {
    client.release();
    pool.end();
  }
}

main().catch(console.error);
