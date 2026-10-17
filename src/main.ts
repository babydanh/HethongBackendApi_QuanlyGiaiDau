// Import telemetry before Nest and application modules so auto-instrumentation can patch them.
import './instrument';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { apiReference } from '@scalar/nestjs-api-reference';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { configureRosterImportBodyParser } from './config/roster-import-body-parser';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { corsOptions } from './config/cors.config';
import { API_GLOBAL_PREFIX, createOpenApiDocument } from './openapi/openapi-document';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    { bodyParser: false },
  );

  // Enable trust proxy for Nginx / OpenLiteSpeed reverse proxies
  const expressApp = app.getHttpAdapter().getInstance();
  if (typeof expressApp?.set === 'function') {
    expressApp.set('trust proxy', true);
  }

  // Global Prefix
  app.setGlobalPrefix(API_GLOBAL_PREFIX);

  // Global Pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global Middleware
  app.use(cookieParser());

  // Global Interceptors
  app.useGlobalInterceptors(new TransformInterceptor());

  // Global Filters
  app.useGlobalFilters(new HttpExceptionFilter());

  // Swagger Configuration (dùng chung với `pnpm openapi:export`)
  const document = createOpenApiDocument(app);
  app.use(
    '/api/docs',
    apiReference({
      spec: {
        content: document as unknown as Record<string, unknown>,
      },
    }),
  );

  // Security Headers
  app.use(
    helmet({
      hidePoweredBy: true,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // CORS
  app.enableCors(corsOptions);

  configureRosterImportBodyParser(app);

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  Logger.log(`Application is running on: http://localhost:${port}/api/v1`);
  Logger.log(`Scalar API Reference is running on: http://localhost:${port}/api/docs`);
}
void bootstrap();
