require('dotenv').config();
const postgres = require('postgres');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function syncMigrations() {
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

    const journalPath = path.join(__dirname, 'src/database/migrations/meta/_journal.json');
    const journalContent = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    const entries = journalContent.entries;

    // We need to sync migrations from index 11 to 21
    for (let i = 11; i <= 21; i++) {
      const entry = entries.find(e => e.idx === i);
      if (!entry) {
        console.warn(`No journal entry found for index ${i}`);
        continue;
      }

      const tag = entry.tag;
      const sqlFileName = `${tag}.sql`;
      const sqlFilePath = path.join(__dirname, 'src/database/migrations', sqlFileName);

      if (!fs.existsSync(sqlFilePath)) {
        console.error(`SQL file not found: ${sqlFilePath}`);
        continue;
      }

      const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
      const hash = crypto.createHash('sha256').update(sqlContent).digest('hex');
      const when = entry.when.toString();

      console.log(`Checking migration ${i} (${tag})...`);

      // Check if it already exists by hash or when
      const checkRes = await sql`
        SELECT id
        FROM drizzle.__drizzle_migrations
        WHERE hash = ${hash} OR created_at = ${when};
      `;

      if (checkRes.length === 0) {
        console.log(`Inserting migration record for index ${i} (${tag})...`);
        await sql`
          INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
          VALUES (${hash}, ${when});
        `;
        console.log(`✅ Inserted migration ${i}`);
      } else {
        console.log(`Migration ${i} already recorded in DB.`);
      }
    }

    console.log('Sync complete!');
  } catch (err) {
    console.error('Error syncing migrations:', err.message);
  } finally {
    await sql.end();
  }
}

syncMigrations();
