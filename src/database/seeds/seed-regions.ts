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
  console.log('🔄 Đang kết nối https://provinces.open-api.vn/api/v2/ để lấy dữ liệu địa giới hành chính chuẩn mới (2 cấp: Tỉnh/Thành -> Phường/Xã)...');

  try {
    const res = await fetch('https://provinces.open-api.vn/api/v2/p/');
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const provincesList: any = await res.json();
    console.log(`✅ Đã tải về danh sách ${provincesList.length} Tỉnh/Thành phố.`);

    const provincesToInsert: any[] = [];
    const wardsToInsert: any[] = [];

    for (const p of provincesList) {
      provincesToInsert.push({
        code: String(p.code),
        name: p.name,
        nameEn: p.name_en || null,
        fullName: p.name,
        fullNameEn: p.name_en || null,
        codeName: p.codename,
      });

      // Tải danh sách phường/xã trực thuộc từng tỉnh/thành phố theo chuẩn v2
      try {
        const detailRes = await fetch(`https://provinces.open-api.vn/api/v2/p/${p.code}?depth=2`);
        if (detailRes.ok) {
          const detailData: any = await detailRes.json();
          if (detailData.wards && Array.isArray(detailData.wards)) {
            for (const w of detailData.wards) {
              wardsToInsert.push({
                code: String(w.code),
                name: w.name,
                nameEn: w.name_en || null,
                fullName: w.name,
                fullNameEn: w.name_en || null,
                codeName: w.codename,
                provinceCode: String(p.code),
                districtCode: null,
              });
            }
          }
        }
      } catch (err) {
        console.warn(`⚠️ Không thể lấy danh sách xã/phường của tỉnh ${p.name}:`, err);
      }
    }

    // 1. Dọn dẹp dữ liệu v1 cũ (xóa quận/huyện và phường thuộc huyện cũ)
    console.log('🧹 Đang làm sạch dữ liệu đơn vị hành chính cũ v1 (Quận/Huyện)...');
    try {
      await db.execute(dsql`UPDATE "communities" SET "district_code" = NULL WHERE "district_code" IS NOT NULL`);
      await db.execute(dsql`DELETE FROM "wards" WHERE "district_code" IS NOT NULL`);
      await db.execute(dsql`DELETE FROM "districts"`);
      console.log('✅ Đã xóa sạch dữ liệu Quận/Huyện cũ thành công.');
    } catch (cleanErr) {
      console.warn('⚠️ Ghi chú làm sạch dữ liệu cũ:', cleanErr);
    }

    // 2. Bulk upsert theo chunk
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

    console.log(`🚀 Đang cập nhật ${wardsToInsert.length} Phường/Xã trực thuộc...`);
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
        provinceCode: dsql`EXCLUDED.province_code`,
      },
      300,
    );

    console.log('🎉 Đồng bộ dữ liệu địa giới hành chính v2 (Tỉnh -> Phường/Xã) thành công 100%!');
  } catch (error) {
    console.error('❌ Lỗi khi đồng bộ địa giới hành chính v2:', error);
  } finally {
    await sql.end();
  }
}

seed();
