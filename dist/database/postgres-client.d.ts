import { type Options, type PostgresType } from 'postgres';
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
export declare function createPostgresClient(config: ConnectionConfig, overrides?: Partial<PostgresOptions>): AppSqlClient;
export declare function createPostgresClientFromConfig(configService: ConfigService, overrides?: Partial<PostgresOptions>): AppSqlClient;
export declare function createPostgresClientFromEnv(overrides?: Partial<PostgresOptions>): AppSqlClient;
export {};
