// seed-regions-v2.js - Standalone vanilla JS seed for Vietnam Administrative Units (API v2: Province -> Ward)
require('dotenv').config();
const postgres = require('postgres');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ Thiếu biến môi trường DATABASE_URL trong .env');
  process.exit(1);
}

const sql = postgres(databaseUrl, {
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

async function main() {
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
      await sql`UPDATE "communities" SET "district_code" = NULL WHERE "district_code" IS NOT NULL`;
      await sql`DELETE FROM "wards" WHERE "district_code" IS NOT NULL`;
      await sql`DELETE FROM "districts"`;
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
