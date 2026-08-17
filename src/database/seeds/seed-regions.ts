import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../schema';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { sql as dsql } from 'drizzle-orm';
import { createPostgresClientFromEnv } from '../postgres-client';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const sql = createPostgresClientFromEnv();
const db = drizzle(sql, { schema });

async function seed() {
  console.log('🔄 Đang kết nối https://provinces.open-api.vn/api/?depth=3 để lấy dữ liệu địa giới hành chính mới nhất...');

  try {
    const res = await fetch('https://provinces.open-api.vn/api/?depth=3');
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const provincesData: any = await res.json();
    console.log(`✅ Đã tải về thành công dữ liệu ${provincesData.length} Tỉnh/Thành phố.`);

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

      if (p.districts && Array.isArray(p.districts)) {
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

          if (d.wards && Array.isArray(d.wards)) {
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

    // Bulk upsert theo chunk
    async function upsertInChunks(table: any, data: any[], targetCol: any, updateSet: any, chunkSize = 200) {
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        await db
          .insert(table)
          .values(chunk)
          .onConflictDoUpdate({
            target: targetCol,
            set: updateSet,
          });
      }
    }

    console.log(`🚀 Đang cập nhật ${provincesToInsert.length} Tỉnh/Thành phố...`);
    await upsertInChunks(
      schema.provinces,
      provincesToInsert,
      schema.provinces.code,
      {
        name: dsql`EXCLUDED.name`,
        nameEn: dsql`EXCLUDED.name_en`,
        fullName: dsql`EXCLUDED.full_name`,
        fullNameEn: dsql`EXCLUDED.full_name_en`,
        codeName: dsql`EXCLUDED.code_name`,
      },
      100,
    );

    console.log(`🚀 Đang cập nhật ${districtsToInsert.length} Quận/Huyện...`);
    await upsertInChunks(
      schema.districts,
      districtsToInsert,
      schema.districts.code,
      {
        name: dsql`EXCLUDED.name`,
        nameEn: dsql`EXCLUDED.name_en`,
        fullName: dsql`EXCLUDED.full_name`,
        fullNameEn: dsql`EXCLUDED.full_name_en`,
        codeName: dsql`EXCLUDED.code_name`,
        provinceCode: dsql`EXCLUDED.province_code`,
      },
      200,
    );

    console.log(`🚀 Đang cập nhật ${wardsToInsert.length} Phường/Xã...`);
    await upsertInChunks(
      schema.wards,
      wardsToInsert,
      schema.wards.code,
      {
        name: dsql`EXCLUDED.name`,
        nameEn: dsql`EXCLUDED.name_en`,
        fullName: dsql`EXCLUDED.full_name`,
        fullNameEn: dsql`EXCLUDED.full_name_en`,
        codeName: dsql`EXCLUDED.code_name`,
        districtCode: dsql`EXCLUDED.district_code`,
      },
      300,
    );

    console.log('🎉 Đồng bộ dữ liệu địa giới hành chính thành công 100%!');
  } catch (error) {
    console.error('❌ Lỗi khi đồng bộ địa giới hành chính:', error);
  } finally {
    await sql.end();
  }
}

seed();

