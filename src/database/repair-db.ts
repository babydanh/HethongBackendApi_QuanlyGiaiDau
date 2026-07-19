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
    
    // 1. Add peak_elo to community_rankings if missing
    await sql`
      ALTER TABLE community_rankings 
      ADD COLUMN IF NOT EXISTS peak_elo integer DEFAULT 1000 NOT NULL;
    `.catch(err => {
      console.error('Error altering community_rankings:', err.message);
    });
    
    // Add last_active_at to community_rankings if missing
    await sql`
      ALTER TABLE community_rankings 
      ADD COLUMN IF NOT EXISTS last_active_at timestamp with time zone DEFAULT now() NOT NULL;
    `.catch(err => {
      console.error('Error altering community_rankings last_active_at:', err.message);
    });
    console.log('Processed community_rankings peak_elo and last_active_at.');

    // 2. Add division_id to payments if missing (Fix payment queries crash)
    await sql`
      ALTER TABLE payments 
      ADD COLUMN IF NOT EXISTS division_id uuid;
    `.catch(err => {
      console.error('Error altering payments:', err.message);
    });
    console.log('Processed payments division_id.');
    
    // 3. Add peak_elo and last_active_at to user_ranks if missing
    await sql`
      ALTER TABLE user_ranks 
      ADD COLUMN IF NOT EXISTS peak_elo integer DEFAULT 1000 NOT NULL;
    `.catch(err => {
      console.error('Error altering user_ranks peak_elo:', err.message);
    });
    await sql`
      ALTER TABLE user_ranks 
      ADD COLUMN IF NOT EXISTS last_active_at timestamp with time zone DEFAULT now() NOT NULL;
    `.catch(err => {
      console.error('Error altering user_ranks last_active_at:', err.message);
    });
    console.log('Processed user_ranks columns.');
    
    // 4. Ensure unique constraints on auth_providers is created
    await sql`
      ALTER TABLE auth_providers 
      ADD CONSTRAINT auth_providers_provider_provider_user_id_unique UNIQUE (provider, provider_user_id);
    `.catch(err => {
      if (err.code === '42P07') {
        console.log('Unique constraint on auth_providers already exists.');
      } else {
        console.error('Error altering auth_providers:', err.message);
      }
    });
    
    console.log('Database repair completed!');
  } catch (error) {
    console.error('Failed to repair database columns:', error);
  } finally {
    await sql.end();
  }
}

run();
