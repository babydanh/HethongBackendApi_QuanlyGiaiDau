import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../schema';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { createPostgresClientFromEnv } from '../postgres-client';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const sql = createPostgresClientFromEnv();
const db = drizzle(sql, { schema });

async function seed() {
  console.log('Seeding regions (Optimized Bulk Insert)...');
  
  try {
    const res = await fetch('https://provinces.open-api.vn/api/?depth=3');
    const provincesData: any = await res.json();
    
    const provincesToInsert: any[] = [];
    const districtsToInsert: any[] = [];
    const wardsToInsert: any[] = [];
    
    for (const p of provincesData) {
      provincesToInsert.push({
        code: String(p.code),
        name: p.name,
        nameEn: p.name_en || null,
        fullName: p.name,
        fullNameEn: p.name_en || null,
        codeName: p.codename,
      });
      
      if (p.districts) {
        for (const d of p.districts) {
          districtsToInsert.push({
            code: String(d.code),
            name: d.name,
            nameEn: d.name_en || null,
            fullName: d.name,
            fullNameEn: d.name_en || null,
            codeName: d.codename,
            provinceCode: String(p.code),
          });
          
          if (d.wards) {
            for (const w of d.wards) {
              wardsToInsert.push({
                code: String(w.code),
                name: w.name,
                nameEn: w.name_en || null,
                fullName: w.name,
                fullNameEn: w.name_en || null,
                codeName: w.codename,
                districtCode: String(d.code),
              });
            }
          }
        }
      }
    }

    // Hàm tiện ích thực hiện bulk insert theo chunk
    async function insertInChunks(table: any, data: any[], chunkSize = 300) {
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        await db.insert(table).values(chunk).onConflictDoNothing();
      }
    }

    console.log(`Inserting ${provincesToInsert.length} provinces...`);
    await insertInChunks(schema.provinces, provincesToInsert, 100);

    console.log(`Inserting ${districtsToInsert.length} districts...`);
    await insertInChunks(schema.districts, districtsToInsert, 300);

    console.log(`Inserting ${wardsToInsert.length} wards...`);
    await insertInChunks(schema.wards, wardsToInsert, 500);

    console.log('Regions seeded successfully.');
  } catch (error) {
    console.error('Error seeding regions:', error);
  } finally {
    await sql.end();
  }
}

seed();
