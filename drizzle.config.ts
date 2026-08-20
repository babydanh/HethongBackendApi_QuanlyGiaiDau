import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const host = process.env.DB_HOST || 'localhost';
const port = process.env.DB_PORT || '5433';
const user = process.env.DB_USERNAME || 'postgres';
const password = encodeURIComponent(process.env.DB_PASSWORD || 'your_password');
const database = process.env.DB_DATABASE || 'tournament_db';
const sslMode = process.env.DB_SSL === 'true' ? 'require' : 'disable';

const connectionString = `postgresql://${user}:${password}@${host}:${port}/${database}?sslmode=${sslMode}`;

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
