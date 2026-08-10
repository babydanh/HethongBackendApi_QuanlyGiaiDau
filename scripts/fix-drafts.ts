import { db } from '../src/database/db';
import { tournaments } from '../src/database/schema';
import { eq, ne } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('Fixing stuck divisions...');
  
  // Find all parent tournaments that have mixed statuses (e.g. one is REGISTRATION_OPEN, another is DRAFT)
  const result = await db.execute(sql`
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
  
  const rows = result.rows || result; // depending on pg driver vs postgres.js
  const divisionsToFix = Array.isArray(rows) ? rows : [];
  
  console.log(`Found ${divisionsToFix.length} divisions stuck in DRAFT.`);
  
  for (const row of divisionsToFix) {
    const divId = row.division_id;
    const maxStatus = row.max_status;
    
    console.log(`Updating division ${divId} from DRAFT to ${maxStatus}`);
    await db.update(tournaments)
      .set({ status: maxStatus as any })
      .where(eq(tournaments.id, divId as string));
  }
  
  console.log('Done!');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
