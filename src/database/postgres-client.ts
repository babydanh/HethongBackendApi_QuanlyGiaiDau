import postgres, { type Options, type PostgresType } from 'postgres';
import { type ConfigService } from '@nestjs/config';
import { type AppSqlClient } from './db.types';

type PostgresOptions = Options<Record<string, PostgresType>>;

type ConnectionConfig = {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  ssl?: PostgresOptions['ssl'];
};

const DEFAULT_SSL: NonNullable<PostgresOptions['ssl']> = {
  rejectUnauthorized: false,
};

export function createPostgresClient(
  config: ConnectionConfig,
  overrides: Partial<PostgresOptions> = {},
): AppSqlClient {
  return postgres({
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    database: config.database,
    ssl: config.ssl ?? DEFAULT_SSL,
    prepare: false,
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
    // Required for Supabase Transaction Pooler — sets search_path so that
    // tables resolve correctly without needing schema prefix in every query.
    connection: {
      search_path: 'public',
    },
    ...overrides,
  });
}

/**
 * Dùng trong NestJS context — nhận ConfigService thay vì truyền từng giá trị.
 * Sử dụng trong database.module.ts useFactory.
 */
export function createPostgresClientFromConfig(
  configService: ConfigService,
  overrides: Partial<PostgresOptions> = {},
): AppSqlClient {
  return createPostgresClient(
    {
      host: configService.get<string>('database.host'),
      port: configService.get<number>('database.port'),
      username: configService.get<string>('database.username'),
      password: configService.get<string>('database.password'),
      database: configService.get<string>('database.database'),
    },
    overrides,
  );
}

/**
 * Dùng trong standalone scripts (migrate.ts, check_roles.ts, test-db.ts)
 * không có NestJS DI context — đọc thẳng từ process.env.
 */
export function createPostgresClientFromEnv(
  overrides: Partial<PostgresOptions> = {},
): AppSqlClient {
  return createPostgresClient(
    {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
    },
    overrides,
  );
}
