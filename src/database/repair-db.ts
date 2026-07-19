import postgres from 'postgres';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const host = process.env.DB_HOST || 'localhost';
const port = parseInt(process.env.DB_PORT || '5433', 10);
const user = process.env.DB_USERNAME || 'postgres';
const password = process.env.DB_PASSWORD || 'your_password';
const database = process.env.DB_DATABASE || 'tournament_db';

async function run() {
  const sql = postgres(`postgres://${user}:${password}@${host}:${port}/${database}`);
  
  try {
    console.log('Connecting to database and running ALTER statements...');
    
    // Add peak_elo if missing
    await sql`
      ALTER TABLE user_ranks 
      ADD COLUMN IF NOT EXISTS peak_elo integer DEFAULT 1000 NOT NULL;
    `;
    console.log('Added peak_elo column successfully.');
    
    // Add peak_elo to community_rankings if missing
    await sql`
      ALTER TABLE community_rankings 
      ADD COLUMN IF NOT EXISTS peak_elo integer DEFAULT 1000 NOT NULL;
    `;
    console.log('Added peak_elo column to community_rankings successfully.');
    
    // Add last_active_at if missing
    await sql`
      ALTER TABLE user_ranks 
      ADD COLUMN IF NOT EXISTS last_active_at timestamp with time zone DEFAULT now() NOT NULL;
    `;
    console.log('Added last_active_at column successfully.');
    
    // Ensure unique constraints on auth_providers is also created
    await sql`
      ALTER TABLE auth_providers 
      ADD CONSTRAINT auth_providers_provider_provider_user_id_unique UNIQUE (provider, provider_user_id);
    `.catch(err => {
      if (err.code === '42P07') {
        console.log('Unique constraint on auth_providers already exists.');
      } else {
        throw err;
      }
    });
    
    console.log('Database repair completed successfully!');
  } catch (error) {
    console.error('Failed to repair database columns:', error);
  } finally {
    await sql.end();
  }
}

run();
