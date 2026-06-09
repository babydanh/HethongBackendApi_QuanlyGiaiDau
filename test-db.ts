import 'dotenv/config';
import { Client } from 'pg';

async function testConnection() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  try {
    console.log('Đang thử kết nối tới PostgreSQL...');
    console.log(`Host: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
    console.log(`Database: ${process.env.DB_DATABASE}`);
    console.log(`User: ${process.env.DB_USERNAME}`);
    
    await client.connect();
    console.log('✅ KẾT NỐI THÀNH CÔNG!');
    
    const res = await client.query('SELECT NOW()');
    console.log('🕒 Thời gian trên Server DB:', res.rows[0].now);
    
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
    await client.end();
  }
}

testConnection();
