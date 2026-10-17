/**
 * Xuất bản mô tả OpenAPI ra `openapi.json` ở gốc repo, không kết nối DB/Redis.
 * Chạy sau `pnpm build` (plugin @nestjs/swagger chỉ áp lúc build): `pnpm openapi:export`.
 * Chế độ preview của Nest dựng cây module/controller nhưng không khởi tạo provider.
 */
// Phải đứng đầu: điền env giả trước khi AppModule được nạp.
import './export-env';

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { API_GLOBAL_PREFIX, createOpenApiDocument } from './openapi-document';

/** Sắp xếp khoá đệ quy để file sinh ra ổn định giữa các lần chạy (diff chỉ hiện thay đổi thật). */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, sortKeys(record[key])]),
  );
}

async function exportOpenApi(): Promise<void> {
  const app = await NestFactory.create(AppModule, { preview: true, logger: ['error'], abortOnError: false });
  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  const document = createOpenApiDocument(app);
  await app.close();

  const outFile = resolve(process.cwd(), process.argv[2] ?? 'openapi.json');
  writeFileSync(outFile, `${JSON.stringify(sortKeys(document), null, 2)}\n`, 'utf8');
  console.log(`Đã ghi ${outFile}: ${Object.keys(document.paths ?? {}).length} path.`);
}

exportOpenApi().catch((error: unknown) => {
  console.error('Xuất OpenAPI thất bại:', error);
  process.exit(1);
});
