const { join } = require('path');
const { existsSync } = require('fs');

// Cấu hình môi trường SSL giống như run-prod-migration.js
process.env.DB_SSL = 'false';

// Đường dẫn tới file seed-prod đã được compile trong dist
const compiledSeedPath = join(__dirname, 'dist', 'database', 'seeds', 'seed-prod.js');

if (!existsSync(compiledSeedPath)) {
  console.error(`❌ Không tìm thấy file seed đã build tại: ${compiledSeedPath}`);
  console.error('Vui lòng đảm bảo bạn đã build project (npm run build) trước khi chạy seed.');
  process.exit(1);
}

console.log('🔗 Đang khởi chạy Seed Production...');
try {
  // Require file JS đã compile để thực thi hàm main của nó
  require(compiledSeedPath);
} catch (error) {
  console.error('❌ Lỗi khi khởi chạy Seed:', error);
  process.exit(1);
}
