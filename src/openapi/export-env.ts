/**
 * Điền giá trị giả cho env bắt buộc (env.validation.ts) khi xuất OpenAPI ở chế độ preview.
 * Phải được import TRƯỚC AppModule: ConfigModule kiểm env ngay lúc nạp module.
 * Chỉ điền khi biến chưa có; preview không kết nối DB/Redis nên giá trị không được dùng.
 */
const PLACEHOLDER_ENV: Record<string, string> = {
  DB_HOST: 'openapi-export.invalid',
  DB_USERNAME: 'openapi-export',
  DB_PASSWORD: 'openapi-export',
  DB_DATABASE: 'openapi-export',
  JWT_ACCESS_SECRET: 'openapi-export',
  JWT_REFRESH_SECRET: 'openapi-export',
  REDIS_HOST: 'openapi-export.invalid',
};

for (const [key, value] of Object.entries(PLACEHOLDER_ENV)) {
  process.env[key] ??= value;
}
