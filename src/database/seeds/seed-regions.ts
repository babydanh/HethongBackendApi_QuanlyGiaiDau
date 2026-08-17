import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../schema';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { sql as dsql } from 'drizzle-orm';
import { createPostgresClientFromEnv } from '../postgres-client';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const sql = createPostgresClientFromEnv();
const db = drizzle(sql, { schema });

interface ApiProvince {
  code: number | string;
  name: string;
  name_en?: string;
  codename?: string;
}

interface ApiWard {
  code: number | string;
  name: string;
  name_en?: string;
  codename?: string;
}

interface ApiProvinceDetail extends ApiProvince {
  wards?: ApiWard[];
}

type NewProvince = typeof schema.provinces.$inferInsert;
type NewWard = typeof schema.wards.$inferInsert;

async function seed() {
  console.log('🔄 Đang kết nối https://provinces.open-api.vn/api/v2/ để lấy dữ liệu địa giới hành chính chuẩn mới (2 cấp: Tỉnh/Thành -> Phường/Xã)...');

  try {
    const res = await fetch('https://provinces.open-api.vn/api/v2/p/');
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const provincesList = (await res.json()) as ApiProvince[];
    console.log(`✅ Đã tải về danh sách ${provincesList.length} Tỉnh/Thành phố.`);

    const provincesToInsert: NewProvince[] = [];
    const wardsToInsert: NewWard[] = [];

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
          const detailData = (await detailRes.json()) as ApiProvinceDetail;
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
      } catch (err: unknown) {
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
    } catch (cleanErr: unknown) {
      console.warn('⚠️ Ghi chú làm sạch dữ liệu cũ:', cleanErr);
    }

    // 2. Type-safe bulk upsert cho Tỉnh/Thành và Phường/Xã
    async function upsertProvinces(data: NewProvince[], chunkSize = 100) {
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        await db
          .insert(schema.provinces)
          .values(chunk)
          .onConflictDoUpdate({
            target: schema.provinces.code,
            set: {
              name: dsql`EXCLUDED.name`,
              nameEn: dsql`EXCLUDED.name_en`,
              fullName: dsql`EXCLUDED.full_name`,
              fullNameEn: dsql`EXCLUDED.full_name_en`,
              codeName: dsql`EXCLUDED.code_name`,
            },
          });
      }
    }

    async function upsertWards(data: NewWard[], chunkSize = 300) {
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        await db
          .insert(schema.wards)
          .values(chunk)
          .onConflictDoUpdate({
            target: schema.wards.code,
            set: {
              name: dsql`EXCLUDED.name`,
              nameEn: dsql`EXCLUDED.name_en`,
              fullName: dsql`EXCLUDED.full_name`,
              fullNameEn: dsql`EXCLUDED.full_name_en`,
              codeName: dsql`EXCLUDED.code_name`,
              provinceCode: dsql`EXCLUDED.province_code`,
            },
          });
      }
    }

    console.log(`🚀 Đang cập nhật ${provincesToInsert.length} Tỉnh/Thành phố...`);
    await upsertProvinces(provincesToInsert, 100);

    console.log(`🚀 Đang cập nhật ${wardsToInsert.length} Phường/Xã trực thuộc...`);
    await upsertWards(wardsToInsert, 300);

    console.log('🎉 Đồng bộ dữ liệu địa giới hành chính v2 (Tỉnh -> Phường/Xã) thành công 100%!');
  } catch (error: unknown) {
    console.error('❌ Lỗi khi đồng bộ địa giới hành chính v2:', error);
  } finally {
    await sql.end();
  }
}

seed();
