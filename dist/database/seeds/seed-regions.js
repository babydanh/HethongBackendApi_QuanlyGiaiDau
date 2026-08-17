"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const postgres_js_1 = require("drizzle-orm/postgres-js");
const schema = __importStar(require("../schema"));
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
const drizzle_orm_1 = require("drizzle-orm");
const postgres_client_1 = require("../postgres-client");
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
const sql = (0, postgres_client_1.createPostgresClientFromEnv)();
const db = (0, postgres_js_1.drizzle)(sql, { schema });
async function seed() {
    console.log('🔄 Đang kết nối https://provinces.open-api.vn/api/v2/ để lấy dữ liệu địa giới hành chính chuẩn mới (2 cấp: Tỉnh/Thành -> Phường/Xã)...');
    try {
        const res = await fetch('https://provinces.open-api.vn/api/v2/p/');
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        const provincesList = (await res.json());
        console.log(`✅ Đã tải về danh sách ${provincesList.length} Tỉnh/Thành phố.`);
        const provincesToInsert = [];
        const wardsToInsert = [];
        for (const p of provincesList) {
            provincesToInsert.push({
                code: String(p.code),
                name: p.name,
                nameEn: p.name_en || null,
                fullName: p.name,
                fullNameEn: p.name_en || null,
                codeName: p.codename,
            });
            try {
                const detailRes = await fetch(`https://provinces.open-api.vn/api/v2/p/${p.code}?depth=2`);
                if (detailRes.ok) {
                    const detailData = (await detailRes.json());
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
                            });
                        }
                    }
                }
            }
            catch (err) {
                console.warn(`⚠️ Không thể lấy danh sách xã/phường của tỉnh ${p.name}:`, err);
            }
        }
        console.log('🧹 Đang làm sạch dữ liệu đơn vị hành chính cũ v1 (Quận/Huyện)...');
        try {
            await db.execute((0, drizzle_orm_1.sql) `UPDATE "communities" SET "district_code" = NULL WHERE "district_code" IS NOT NULL`);
            await db.execute((0, drizzle_orm_1.sql) `DELETE FROM "wards" WHERE "district_code" IS NOT NULL`);
            await db.execute((0, drizzle_orm_1.sql) `DELETE FROM "districts"`);
            console.log('✅ Đã xóa sạch dữ liệu Quận/Huyện cũ thành công.');
        }
        catch (cleanErr) {
            console.warn('⚠️ Ghi chú làm sạch dữ liệu cũ:', cleanErr);
        }
        async function upsertProvinces(data, chunkSize = 100) {
            for (let i = 0; i < data.length; i += chunkSize) {
                const chunk = data.slice(i, i + chunkSize);
                await db
                    .insert(schema.provinces)
                    .values(chunk)
                    .onConflictDoUpdate({
                    target: schema.provinces.code,
                    set: {
                        name: (0, drizzle_orm_1.sql) `EXCLUDED.name`,
                        nameEn: (0, drizzle_orm_1.sql) `EXCLUDED.name_en`,
                        fullName: (0, drizzle_orm_1.sql) `EXCLUDED.full_name`,
                        fullNameEn: (0, drizzle_orm_1.sql) `EXCLUDED.full_name_en`,
                        codeName: (0, drizzle_orm_1.sql) `EXCLUDED.code_name`,
                    },
                });
            }
        }
        async function upsertWards(data, chunkSize = 300) {
            for (let i = 0; i < data.length; i += chunkSize) {
                const chunk = data.slice(i, i + chunkSize);
                await db
                    .insert(schema.wards)
                    .values(chunk)
                    .onConflictDoUpdate({
                    target: schema.wards.code,
                    set: {
                        name: (0, drizzle_orm_1.sql) `EXCLUDED.name`,
                        nameEn: (0, drizzle_orm_1.sql) `EXCLUDED.name_en`,
                        fullName: (0, drizzle_orm_1.sql) `EXCLUDED.full_name`,
                        fullNameEn: (0, drizzle_orm_1.sql) `EXCLUDED.full_name_en`,
                        codeName: (0, drizzle_orm_1.sql) `EXCLUDED.code_name`,
                        provinceCode: (0, drizzle_orm_1.sql) `EXCLUDED.province_code`,
                    },
                });
            }
        }
        console.log(`🚀 Đang cập nhật ${provincesToInsert.length} Tỉnh/Thành phố...`);
        await upsertProvinces(provincesToInsert, 100);
        console.log(`🚀 Đang cập nhật ${wardsToInsert.length} Phường/Xã trực thuộc...`);
        await upsertWards(wardsToInsert, 300);
        console.log('🎉 Đồng bộ dữ liệu địa giới hành chính v2 (Tỉnh -> Phường/Xã) thành công 100%!');
    }
    catch (error) {
        console.error('❌ Lỗi khi đồng bộ địa giới hành chính v2:', error);
    }
    finally {
        await sql.end();
    }
}
seed();
//# sourceMappingURL=seed-regions.js.map