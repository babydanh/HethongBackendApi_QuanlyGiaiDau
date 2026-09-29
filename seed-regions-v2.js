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

// 3. Nạp dữ liệu địa giới trong MỘT transaction, theo kiểu UPSERT theo `code`.
//
//    Cố ý KHÔNG DELETE rồi INSERT như các bản trước. `communities.ward_code`
//    và `communities.province_code` trỏ vào `wards(code)` / `provinces(code)`
//    bằng FK ON DELETE NO ACTION, nên DELETE sẽ bị Postgres từ chối khi
//    production còn community nào đang gắn địa chỉ — và nếu né FK bằng cách
//    UPDATE cột đó cho NULL thì xoá sạch liên kết thật của production, chỉ lộ
//    ra sau này. Upsert theo `code` không xoá dòng nào nên FK không bao giờ
//    bị đụng tới: `code` của cùng một bộ dữ liệu v2 là ỔN ĐỊNH giữa các lần
//    chạy, chỉ uuid sinh tự động là đổi. Đơn vị nào biến mất khỏi bộ dữ liệu
//    mới thì báo ở cuối, KHÔNG tự xoá — xoá là quyết định mất dữ liệu, không
//    phải việc máy làm hộ.
//
//    Vẫn là MỘT transaction: hỏng giữa chừng thì rollback, database giữ nguyên.
async function replaceRegions(provincesToInsert, wardsToInsert) {
  const BATCH_SIZE = 500;

  console.log(`📊 Chuẩn bị nạp: ${provincesToInsert.length} Tỉnh/Thành, ${wardsToInsert.length} Phường/Xã...`);

  // Số community còn gắn địa chỉ, để chứng minh sau khi nạp là KHÔNG mất liên kết.
  const [{ count: linkedBefore }] = await sql`
    SELECT count(*)::int AS count FROM communities WHERE ward_code IS NOT NULL
  `;
  console.log(`🔗 Trước khi nạp: ${linkedBefore} community đang gắn phường (sẽ giữ nguyên liên kết).`);

  await sql.begin(async (tx) => {

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

    // Phường có trong DB nhưng KHÔNG có trong bộ dữ liệu v2 vừa tải về: báo
    // tên để người vận hành quyết định, KHÔNG tự xoá. Xoá là việc chạm vào
    // `communities.ward_code` qua FK, tức là quyết định mất dữ liệu.
    const incomingWardCodes = wardsToInsert.map((w) => w.code);
    const staleWards = await tx`
      SELECT code, name FROM "wards"
      WHERE NOT (code = ANY(${incomingWardCodes}::varchar[]))
      ORDER BY code
    `;
    if (staleWards.length === 0) {
      console.log('✅ Không có phường nào trong DB mà bộ dữ liệu v2 đã bỏ — không cần dọn gì.');
    } else {
      console.warn(
        `\n⚠️  ${staleWards.length} phường có trong DB nhưng KHÔNG có trong bộ dữ liệu v2 vừa tải về.`,
      );
      console.warn('   Script KHÔNG tự xoá chúng (xoá sẽ đụng FK communities.ward_code).');
      console.warn('   Nếu cần dọn, hãy xem lại từng mã rồi xoá thủ công:');
      for (const w of staleWards) console.warn(`     [ward] ${w.code} — ${w.name}`);
    }

    // Liên kết community -> phường phải y nguyên sau khi nạp.
    const [{ count: linkedAfter }] = await tx`
      SELECT count(*)::int AS count FROM communities WHERE ward_code IS NOT NULL
    `;
    if (linkedAfter !== linkedBefore) {
      throw new Error(
        `Số community gắn phường đổi từ ${linkedBefore} xuống ${linkedAfter} — nạp đã làm mất liên kết, rollback.`,
      );
    }
    console.log(`🔗 Sau khi nạp: ${linkedAfter} community vẫn gắn phường — không mất liên kết nào.`);
  });
}

async function main() {
  console.log('🧹 Sẽ nạp provinces/wards bằng UPSERT theo `code` trong một transaction (không xoá dòng nào, hoặc rollback trắng).');
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
