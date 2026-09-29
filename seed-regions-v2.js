// seed-regions-v2.js - Standalone seed for 2-Level Administrative Units (Province -> Ward)
//
// Thứ tự cố ý: (1) đảm bảo schema, (2) tải hết dữ liệu qua mạng,
// (3) DELETE + INSERT trong MỘT transaction. Toàn bộ I/O mạng nằm ngoài
// transaction để transaction chỉ giữ vài giây thay vì vài chục giây chờ
// 34 request; tải hỏng thì database còn nguyên và phục vụ bình thường.
//
// Cột allow_stranger_messages của bảng profiles KHÔNG thuộc script này:
// nó đã có migration riêng chạy cùng pipeline —
// src/database/migrations/2026-08-17_add_allow_stranger_messages.sql
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

const REGION_API_BASE = 'https://provinces.open-api.vn/api/v2';
const FETCH_ATTEMPTS = 3;

// 1. Schema. DDL nằm NGOÀI transaction thay dữ liệu bên dưới: Postgres tự
//    commit CREATE/ALTER nên bọc vào transaction chỉ là giả, và chỉ làm kéo
//    dài thời gian giữ khoá. Hỏng ở đây thì phần seed hỏng theo, nên để lỗi
//    nổi lên thay vì nuốt.
async function ensureSchema() {
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
    ALTER TABLE "provinces" 
    ADD COLUMN IF NOT EXISTS "name_en" varchar(255),
    ADD COLUMN IF NOT EXISTS "full_name" varchar(255),
    ADD COLUMN IF NOT EXISTS "full_name_en" varchar(255),
    ADD COLUMN IF NOT EXISTS "code_name" varchar(255);
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

  // Gỡ bỏ hoàn toàn ràng buộc NOT NULL của district_code cũ
  await sql`
    DO $$ 
    BEGIN 
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='wards' AND column_name='district_code'
      ) THEN 
        ALTER TABLE "wards" ALTER COLUMN "district_code" DROP NOT NULL;
      END IF; 
    END $$;
  `;

  console.log('✅ Schema provinces/wards đã sẵn sàng.');
}

/**
 * 2. Tải toàn bộ dữ liệu địa giới TRƯỚC khi đụng vào database.
 *
 * Trước đây lỗi tải của một tỉnh chỉ bị in ra cảnh báo rồi bỏ qua. Sau khi
 * bước 3 xoá sạch bảng, bỏ qua nghĩa là xoá luôn hàng trăm phường của tỉnh
 * đó khỏi production. Vì vậy giờ bất kỳ lỗi nào cũng phải ném ra và dừng cả
 * lần chạy — chạy lại từ đầu thì an toàn, chạy nửa vời thì không.
 */
async function fetchJson(url, what) {
  let lastError;
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      lastError = error;
      if (attempt < FETCH_ATTEMPTS) {
        console.warn(`   ⚠️ ${what}: ${error.message} (lần ${attempt}/${FETCH_ATTEMPTS}) — thử lại...`);
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  throw new Error(`${what} thất bại sau ${FETCH_ATTEMPTS} lần thử: ${lastError.message}`);
}

async function fetchRegions() {
  console.log(`🔄 Đang tải toàn bộ dữ liệu địa giới 2 cấp (v2) từ ${REGION_API_BASE} ...`);

  const provincesList = await fetchJson(`${REGION_API_BASE}/p/`, 'Tải danh sách tỉnh');
  if (!Array.isArray(provincesList) || provincesList.length === 0) {
    throw new Error('API trả về danh sách tỉnh rỗng hoặc sai định dạng.');
  }
  console.log(`✅ Đã tải về ${provincesList.length} Tỉnh/Thành phố.`);

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

    const detailData = await fetchJson(
      `${REGION_API_BASE}/p/${p.code}?depth=2`,
      `Tải xã phường của tỉnh "${p.name}"`,
    );
    if (!Array.isArray(detailData.wards)) {
      throw new Error(`API không trả về danh sách xã phường cho tỉnh "${p.name}".`);
    }
    for (const w of detailData.wards) {
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

  // Sắp xếp danh sách theo thứ tự bảng chữ cái tiếng Việt (A-Z)
  provincesToInsert.sort((a, b) => a.name.localeCompare(b.name, 'vi-VN'));
  wardsToInsert.sort((a, b) => a.name.localeCompare(b.name, 'vi-VN'));

  return { provinces: provincesToInsert, wards: wardsToInsert };
}

// 3. Thay toàn bộ dữ liệu địa giới trong MỘT transaction: DELETE và INSERT
//    cùng commit hoặc cùng rollback. Trước đây DELETE chạy rời ở connection
//    riêng, nên giữa lúc xoá và lúc nạp production phục vụ bảng RỖNG, và
//    một lần chạy hỏng giữa chừng để lại bảng rỗng vĩnh viễn.
async function replaceRegions(provincesToInsert, wardsToInsert) {
  const BATCH_SIZE = 500;

  console.log(`📊 Chuẩn bị nạp: ${provincesToInsert.length} Tỉnh/Thành, ${wardsToInsert.length} Phường/Xã...`);

  await sql.begin(async (tx) => {
    await tx`DELETE FROM "wards"`;
    await tx`DELETE FROM "provinces"`;

    for (let i = 0; i < provincesToInsert.length; i += BATCH_SIZE) {
      const chunk = provincesToInsert.slice(i, i + BATCH_SIZE);
      await tx`
        INSERT INTO "provinces" ${tx(chunk, 'code', 'name', 'name_en', 'full_name', 'full_name_en', 'code_name')}
        ON CONFLICT ("code") DO UPDATE SET
          "name" = EXCLUDED.name,
          "name_en" = EXCLUDED.name_en,
          "full_name" = EXCLUDED.full_name,
          "full_name_en" = EXCLUDED.full_name_en,
          "code_name" = EXCLUDED.code_name
      `;
    }
    console.log(`✅ Đã nạp ${provincesToInsert.length} Tỉnh/Thành phố.`);

    for (let i = 0; i < wardsToInsert.length; i += BATCH_SIZE) {
      const chunk = wardsToInsert.slice(i, i + BATCH_SIZE);
      await tx`
        INSERT INTO "wards" ${tx(chunk, 'code', 'name', 'name_en', 'full_name', 'full_name_en', 'code_name', 'province_code')}
        ON CONFLICT ("code") DO UPDATE SET
          "name" = EXCLUDED.name,
          "name_en" = EXCLUDED.name_en,
          "full_name" = EXCLUDED.full_name,
          "full_name_en" = EXCLUDED.full_name_en,
          "code_name" = EXCLUDED.code_name,
          "province_code" = EXCLUDED.province_code
      `;
    }
    console.log(`✅ Đã nạp ${wardsToInsert.length} Phường/Xã trực thuộc Tỉnh/Thành vào database chính!`);
  });
}

async function main() {
  console.log('🧹 Sẽ thay toàn bộ dữ liệu provinces/wards trong một transaction (hoặc không đổi gì cả).');
  await ensureSchema();
  const { provinces, wards } = await fetchRegions();
  await replaceRegions(provinces, wards);
}

main()
  .then(() => {
    console.log('🎉 Hoàn tất quá trình seed địa giới hành chính!');
  })
  .catch((error) => {
    console.error('❌ Seed địa giới thất bại — dữ liệu địa giới cũ được giữ nguyên:', error.message);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
