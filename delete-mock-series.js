import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL is not defined in environment variables');
  process.exit(1);
}

const sql = postgres(databaseUrl);
const db = drizzle(sql);

async function main() {
  console.log('=== ĐANG XÓA MOCK DATA CHUỖI GIẢI ĐẤU (SERIES) TRONG DATABASE ===\n');

  try {
    // Xóa theo thứ tự ràng buộc khóa ngoại (foreign key)
    console.log('1. Xóa dữ liệu bảng psr_point_logs...');
    await sql`DELETE FROM psr_point_logs`;

    console.log('2. Xóa dữ liệu bảng series_standings...');
    await sql`DELETE FROM series_standings`;

    console.log('3. Xóa dữ liệu bảng series_events...');
    await sql`DELETE FROM series_events`;

    console.log('4. Xóa dữ liệu bảng series_legs...');
    await sql`DELETE FROM series_legs`;

    console.log('5. Xóa dữ liệu bảng series_managers...');
    await sql`DELETE FROM series_managers`;

    console.log('6. Xóa dữ liệu bảng series_invitations...');
    await sql`DELETE FROM series_invitations`;

    console.log('7. Xóa dữ liệu bảng tournament_series...');
    await sql`DELETE FROM tournament_series`;

    console.log('\n=== ĐÃ XÓA SẠCH DỮ LIỆU MOCK SERIES THÀNH CÔNG ===');
  } catch (error) {
    console.error('❌ Lỗi khi xóa dữ liệu:', error);
  } finally {
    await sql.end();
  }
}

main();
