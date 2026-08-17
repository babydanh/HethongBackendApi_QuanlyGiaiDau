// seed-regions-v2.js - Standalone vanilla JS seed for Vietnam Administrative Units (API v2: Province -> Ward)
require('dotenv').config();
const postgres = require('postgres');

const host = process.env.DB_HOST || 'postgres';
const port = parseInt(process.env.DB_PORT || '5432', 10);
const username = process.env.DB_USER || process.env.DB_USERNAME || process.env.POSTGRES_USER || 'postgres';
const password = process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'postgres';
const database = process.env.DB_NAME || process.env.POSTGRES_DB || 'tournament_db';

const isSSLEnabled = process.env.DB_SSL === 'true';

const sql = process.env.DATABASE_URL 
  ? postgres(process.env.DATABASE_URL, {
      ssl: isSSLEnabled ? { rejectUnauthorized: false } : false,
      prepare: false,
      max: 10,
    })
  : postgres({
      host,
      port,
      username,
      password,
      database,
      ssl: isSSLEnabled ? { rejectUnauthorized: false } : false,
      prepare: false,
      max: 10,
      connection: {
        search_path: 'public',
      },
    });

async function main() {
  console.log(`🔌 Đang kết nối Database (${host}:${port}/${database})...`);

  // Đảm bảo bảng provinces và wards tồn tại
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`;
    await sql`
      CREATE TABLE IF NOT EXISTS "provinces" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code" varchar(20) NOT NULL UNIQUE,
        "name" varchar(255) NOT NULL,
        "name_en" varchar(255),
        "full_name" varchar(255),
        "full_name_en" varchar(255),
        "code_name" varchar(255),
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS "wards" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code" varchar(20) NOT NULL UNIQUE,
        "name" varchar(255) NOT NULL,
        "name_en" varchar(255),
        "full_name" varchar(255),
        "full_name_en" varchar(255),
        "code_name" varchar(255),
        "province_code" varchar(20) REFERENCES "provinces"("code") ON DELETE CASCADE,
        "district_code" varchar(20),
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `;
    // Thêm cột province_code vào wards nếu bảng cũ chưa có
    await sql`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name='wards' AND column_name='province_code'
        ) THEN 
          ALTER TABLE "wards" ADD COLUMN "province_code" varchar(20) REFERENCES "provinces"("code") ON DELETE CASCADE; 
        END IF; 
      END $$;
    `;
  } catch (tableErr) {
    console.warn('⚠️ Ghi chú tạo bảng:', tableErr.message);
  }

  console.log('🔄 Đang kết nối https://provinces.open-api.vn/api/v2/ để lấy dữ liệu địa giới hành chính chuẩn mới (2 cấp: Tỉnh/Thành -> Phường/Xã)...');

  try {
    const res = await fetch('https://provinces.open-api.vn/api/v2/p/');
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const provincesList = await res.json();
    console.log(`✅ Đã tải về danh sách ${provincesList.length} Tỉnh/Thành phố.`);

    const provincesToInsert = [];
    const wardsToInsert = [];

    for (const p of provincesList) {
      provincesToInsert.push({
        code: String(p.code),
        name: p.name,
        name_en: p.name_en || null,
        full_name: p.name,
        full_name_en: p.name_en || null,
        code_name: p.codename,
      });

      // Tải danh sách phường/xã trực thuộc từng tỉnh/thành phố theo chuẩn v2
      try {
        const detailRes = await fetch(`https://provinces.open-api.vn/api/v2/p/${p.code}?depth=2`);
        if (detailRes.ok) {
          const detailData = await detailRes.json();
          if (detailData.wards && Array.isArray(detailData.wards)) {
            for (const w of detailData.wards) {
              wardsToInsert.push({
                code: String(w.code),
                name: w.name,
                name_en: w.name_en || null,
                full_name: w.name,
                full_name_en: w.name_en || null,
                code_name: w.codename,
                province_code: String(p.code),
                district_code: null,
              });
            }
          }
        }
      } catch (err) {
        console.warn(`⚠️ Không thể lấy danh sách xã/phường của tỉnh ${p.name}:`, err.message);
      }
    }

    // 1. Dọn dẹp dữ liệu v1 cũ (xóa quận/huyện và phường thuộc huyện cũ)
    console.log('🧹 Đang làm sạch dữ liệu đơn vị hành chính cũ v1 (Quận/Huyện)...');
    try {
      await sql`
        DO $$ 
        BEGIN 
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='communities') THEN 
            UPDATE "communities" SET "district_code" = NULL WHERE "district_code" IS NOT NULL; 
          END IF; 
        END $$;
      `;
      await sql`DELETE FROM "wards" WHERE "district_code" IS NOT NULL`;
      await sql`DROP TABLE IF EXISTS "districts" CASCADE`;
      console.log('✅ Đã xóa sạch dữ liệu Quận/Huyện cũ thành công.');
    } catch (cleanErr) {
      console.warn('⚠️ Ghi chú làm sạch dữ liệu cũ:', cleanErr.message);
    }

    // 2. Bulk upsert Tỉnh/Thành phố
    console.log(`🚀 Đang cập nhật ${provincesToInsert.length} Tỉnh/Thành phố...`);
    const chunkSize = 100;
    for (let i = 0; i < provincesToInsert.length; i += chunkSize) {
      const chunk = provincesToInsert.slice(i, i + chunkSize);
      await sql`
        INSERT INTO "provinces" ${sql(chunk, 'code', 'name', 'name_en', 'full_name', 'full_name_en', 'code_name')}
        ON CONFLICT ("code") DO UPDATE SET
          "name" = EXCLUDED.name,
          "name_en" = EXCLUDED.name_en,
          "full_name" = EXCLUDED.full_name,
          "full_name_en" = EXCLUDED.full_name_en,
          "code_name" = EXCLUDED.code_name
      `;
    }

    // 3. Bulk upsert Phường/Xã
    console.log(`🚀 Đang cập nhật ${wardsToInsert.length} Phường/Xã trực thuộc...`);
    const wardChunkSize = 300;
    for (let i = 0; i < wardsToInsert.length; i += wardChunkSize) {
      const chunk = wardsToInsert.slice(i, i + wardChunkSize);
      await sql`
        INSERT INTO "wards" ${sql(chunk, 'code', 'name', 'name_en', 'full_name', 'full_name_en', 'code_name', 'province_code', 'district_code')}
        ON CONFLICT ("code") DO UPDATE SET
          "name" = EXCLUDED.name,
          "name_en" = EXCLUDED.name_en,
          "full_name" = EXCLUDED.full_name,
          "full_name_en" = EXCLUDED.full_name_en,
          "code_name" = EXCLUDED.code_name,
          "province_code" = EXCLUDED.province_code
      `;
    }

    console.log('🎉 Đồng bộ dữ liệu địa giới hành chính v2 (Tỉnh -> Phường/Xã) thành công 100%!');
  } catch (error) {
    console.error('❌ Lỗi khi đồng bộ địa giới hành chính v2:', error);
  } finally {
    await sql.end();
  }
}

main();
