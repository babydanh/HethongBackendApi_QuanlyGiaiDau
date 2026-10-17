import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

/** Global prefix của mọi route; dùng chung cho main.ts và lệnh xuất để bản mô tả khớp đường dẫn thật. */
export const API_GLOBAL_PREFIX = 'api/v1';

/**
 * Bản mô tả OpenAPI của toàn bộ API. Dùng chung cho trang `/api/docs` (main.ts)
 * và lệnh `pnpm openapi:export` (export-openapi.ts) để hai nơi luôn giống nhau.
 */
export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Tournament Management API')
    .setDescription('The API description for the Tournament Management Platform')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config);
}
