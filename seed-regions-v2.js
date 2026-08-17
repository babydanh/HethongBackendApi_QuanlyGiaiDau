// seed-regions-v2.js - Standalone seed for 2-Level Administrative Units (Province -> Ward)
require('dotenv').config();
const postgres = require('postgres');

// Match EXACT environment variables used by NestJS database.config.ts
const host = process.env.DB_HOST || 'postgres';
const port = parseInt(process.env.DB_PORT || '5432', 10);
const username = process.env.DB_USERNAME || process.env.DB_USER || process.env.POSTGRES_USER || 'postgres';
const password = process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'postgres';
const database = process.env.DB_DATABASE || process.env.DB_NAME || process.env.POSTGRES_DB || 'tournament_db';

const isSSLEnabled = process.env.DB_SSL === 'true';

console.log(`🔌 Kết nối Database: ${host}:${port}/${database} (User: ${username})`);

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
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`;
    
    // 1. Tạo hoặc bổ sung đầy đủ tất cả các cột cho bảng provinces
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
      ALTER TABLE "provinces" 
      ADD COLUMN IF NOT EXISTS "name_en" varchar(255),
      ADD COLUMN IF NOT EXISTS "full_name" varchar(255),
      ADD COLUMN IF NOT EXISTS "full_name_en" varchar(255),
      ADD COLUMN IF NOT EXISTS "code_name" varchar(255);
    `;

    // 2. Tạo hoặc bổ sung đầy đủ tất cả các cột cho bảng wards
    await sql`
      CREATE TABLE IF NOT EXISTS "wards" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code" varchar(20) NOT NULL UNIQUE,
        "name" varchar(255) NOT NULL,
        "name_en" varchar(255),
        "full_name" varchar(255),
        "full_name_en" varchar(255),
        "code_name" varchar(255),
        "province_code" varchar(20),
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `;

    await sql`
      ALTER TABLE "wards" 
      ADD COLUMN IF NOT EXISTS "name_en" varchar(255),
      ADD COLUMN IF NOT EXISTS "full_name" varchar(255),
      ADD COLUMN IF NOT EXISTS "full_name_en" varchar(255),
      ADD COLUMN IF NOT EXISTS "code_name" varchar(255),
      ADD COLUMN IF NOT EXISTS "province_code" varchar(20);
    `;

    // 3. Bổ sung cột allow_stranger_messages cho profiles nếu thiếu
    await sql`
      ALTER TABLE "profiles" 
      ADD COLUMN IF NOT EXISTS "allow_stranger_messages" boolean DEFAULT true;
    `;

    console.log('✅ Đã kiểm tra và đồng bộ 100% tất cả các cột của bảng provinces, wards, profiles thành công.');
  } catch (tableErr) {
    console.warn('⚠️ Lỗi kiểm tra bảng:', tableErr.message);
  }

  console.log('🔄 Đang tải toàn bộ dữ liệu địa giới từ https://provinces.open-api.vn/api/?depth=3 ...');

  try {
    const res = await fetch('https://provinces.open-api.vn/api/?depth=3');
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const allData = await res.json();
    console.log(`✅ Đã tải về ${allData.length} Tỉnh/Thành phố.`);

    const provincesToInsert = [];
    const wardsToInsert = [];

    for (const p of allData) {
      provincesToInsert.push({
        code: String(p.code),
        name: p.name,
        name_en: p.name_en || null,
        full_name: p.name,
        full_name_en: p.name_en || null,
        code_name: p.codename,
      });

      if (p.districts && Array.isArray(p.districts)) {
        for (const d of p.districts) {
          if (d.wards && Array.isArray(d.wards)) {
            for (const w of d.wards) {
              wardsToInsert.push({
                code: String(w.code),
                name: w.name,
                name_en: w.name_en || null,
                full_name: w.name,
                full_name_en: w.name_en || null,
                code_name: w.codename,
                province_code: String(p.code),
              });
            }
          }
        }
      }
    }

    console.log(`📊 Chuẩn bị nạp: ${provincesToInsert.length} Tỉnh/Thành, ${wardsToInsert.length} Phường/Xã...`);

    // Nạp provinces theo batch với ON CONFLICT DO UPDATE (không xóa để tránh xung đột Foreign Key)
    const BATCH_SIZE = 500;
    for (let i = 0; i < provincesToInsert.length; i += BATCH_SIZE) {
      const chunk = provincesToInsert.slice(i, i + BATCH_SIZE);
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
    console.log(`✅ Đã nạp thành công ${provincesToInsert.length} Tỉnh/Thành phố.`);

    // Nạp wards theo batch với ON CONFLICT DO UPDATE
    for (let i = 0; i < wardsToInsert.length; i += BATCH_SIZE) {
      const chunk = wardsToInsert.slice(i, i + BATCH_SIZE);
      await sql`
        INSERT INTO "wards" ${sql(chunk, 'code', 'name', 'name_en', 'full_name', 'full_name_en', 'code_name', 'province_code')}
        ON CONFLICT ("code") DO UPDATE SET
          "name" = EXCLUDED.name,
          "name_en" = EXCLUDED.name_en,
          "full_name" = EXCLUDED.full_name,
          "full_name_en" = EXCLUDED.full_name_en,
          "code_name" = EXCLUDED.code_name,
          "province_code" = EXCLUDED.province_code
      `;
    }
    console.log(`✅ Đã nạp thành công ${wardsToInsert.length} Phường/Xã trực thuộc Tỉnh/Thành vào database chính!`);

  } catch (seedErr) {
    console.error('❌ Lỗi nạp dữ liệu:', seedErr.message);
  } finally {
    await sql.end();
    console.log('🎉 Hoàn tất quá trình seed địa giới hành chính!');
  }
}

main().catch(console.error);
