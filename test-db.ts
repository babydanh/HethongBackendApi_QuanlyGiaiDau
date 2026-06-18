import 'dotenv/config';
import { createPostgresClientFromEnv } from './src/database/postgres-client';

async function testConnection() {
  const sql = createPostgresClientFromEnv({
    max: 1,
    ssl: undefined,
  });

  try {
    console.log('Đang thử kết nối tới PostgreSQL...');
    console.log(`Host: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
    console.log(`Database: ${process.env.DB_DATABASE}`);
    console.log(`User: ${process.env.DB_USERNAME}`);
    
    await sql`SELECT 1`;
    console.log('✅ KẾT NỐI THÀNH CÔNG!');
    
    const res = await sql`SELECT NOW() as now`;
    console.log('🕒 Thời gian trên Server DB:', res[0]?.now);
    
  } catch (err: any) {
    console.error('❌ KẾT NỐI THẤT BẠI!');
    if (err.code === 'ECONNREFUSED') {
      console.error('Lý do: Máy chủ từ chối kết nối (Có thể PostgreSQL chưa bật hoặc sai DB_HOST/DB_PORT).');
    } else if (err.code === '28P01') {
      console.error('Lý do: Sai mật khẩu (DB_PASSWORD).');
    } else if (err.code === '3D000') {
      console.error(`Lý do: Database "${process.env.DB_DATABASE}" không tồn tại. Hãy dùng pgAdmin để tạo database này trước.`);
    } else {
      console.error('Lỗi chi tiết:', err.message);
    }
  } finally {
    await sql.end();
  }
}

testConnection();
