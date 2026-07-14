import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

// Supabase pooler requires the schema to be specified in the URL
// Build connection URL with explicit search_path to avoid "schema undefined" error
const host = process.env.DB_HOST || 'localhost';
const port = process.env.DB_PORT || '5432';
const user = process.env.DB_USERNAME || 'postgres';
const password = process.env.DB_PASSWORD || 'your_password';
const database = process.env.DB_DATABASE || 'tournament_db';
const sslMode = process.env.DB_SSL === 'true' ? 'require' : 'disable';

// Encode password in case it contains special characters like @
const encodedPassword = encodeURIComponent(password);
const connectionString = `postgresql://${user}:${encodedPassword}@${host}:${port}/${database}?sslmode=${sslMode}&options=-c%20search_path=public`;

export default defineConfig({
  schema: './src/database/schema/index.ts',
  out: './src/database/migrations',
  dialect: 'postgresql',
  tablesFilter: [
    '!spatial_ref_sys',
    '!__drizzle_migrations',
    '!geography_columns',
    '!geometry_columns',
    '!raster_columns',
    '!raster_overviews',
  ],
  dbCredentials: {
    url: connectionString,
  },
});
