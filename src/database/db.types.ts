import { type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { type PostgresType, type Sql } from 'postgres';
import * as schema from './schema';

export type AppDb = PostgresJsDatabase<typeof schema>;
export type AppTx = Parameters<Parameters<AppDb['transaction']>[0]>[0];
export type AppDbOrTx = AppDb | AppTx;
export type AppSqlClient = Sql<Record<string, PostgresType>>;
