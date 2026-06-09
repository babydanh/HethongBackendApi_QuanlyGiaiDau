import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../schema';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'your_password',
  database: process.env.DB_DATABASE || 'tournament_db',
  ssl: { rejectUnauthorized: false },
});

const db = drizzle(pool, { schema });

async function seed() {
  console.log('Seeding regions...');
  
  try {
    const res = await fetch('https://provinces.open-api.vn/api/?depth=3');
    const provincesData = await res.json();
    
    for (const p of provincesData) {
      await db.insert(schema.provinces).values({
        code: String(p.code),
        name: p.name,
        nameEn: p.name_en || null,
        fullName: p.name,
        fullNameEn: p.name_en || null,
        codeName: p.codename,
      }).onConflictDoNothing();
      
      if (p.districts) {
        for (const d of p.districts) {
          await db.insert(schema.districts).values({
            code: String(d.code),
            name: d.name,
            nameEn: d.name_en || null,
            fullName: d.name,
            fullNameEn: d.name_en || null,
            codeName: d.codename,
            provinceCode: String(p.code),
          }).onConflictDoNothing();
          
          if (d.wards) {
            for (const w of d.wards) {
              await db.insert(schema.wards).values({
                code: String(w.code),
                name: w.name,
                nameEn: w.name_en || null,
                fullName: w.name,
                fullNameEn: w.name_en || null,
                codeName: w.codename,
                districtCode: String(d.code),
              }).onConflictDoNothing();
            }
          }
        }
      }
    }
    console.log('Regions seeded successfully.');
  } catch (error) {
    console.error('Error seeding regions:', error);
  } finally {
    await pool.end();
  }
}

seed();
