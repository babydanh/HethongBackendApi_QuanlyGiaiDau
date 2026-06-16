import {
  Global,
  Inject,
  Injectable,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { type AppSqlClient } from './db.types';
import { createPostgresClientFromConfig } from './postgres-client';

export const PG_CONNECTION = 'PG_CONNECTION';
export const PG_SQL_CLIENT = 'PG_SQL_CLIENT';

@Injectable()
class DatabaseLifecycleService implements OnApplicationShutdown {
  constructor(@Inject(PG_SQL_CLIENT) private readonly sql: AppSqlClient) {}

  async onApplicationShutdown() {
    await this.sql.end();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PG_SQL_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        createPostgresClientFromConfig(configService),
    },
    {
      provide: PG_CONNECTION,
      inject: [PG_SQL_CLIENT],
      useFactory: (sql: AppSqlClient) => drizzle(sql, { schema }),
    },
    DatabaseLifecycleService,
  ],
  exports: [PG_CONNECTION, PG_SQL_CLIENT],
})
export class DatabaseModule {}
