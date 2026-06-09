import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export const PG_CONNECTION = 'PG_CONNECTION';

@Global()
@Module({
  providers: [
    {
      provide: PG_CONNECTION,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const pool = new Pool({
          host: configService.get<string>('database.host'),
          port: configService.get<number>('database.port'),
          user: configService.get<string>('database.username'),
          password: configService.get<string>('database.password'),
          database: configService.get<string>('database.database'),
        });
        return drizzle(pool, { schema });
      },
    },
  ],
  exports: [PG_CONNECTION],
})
export class DatabaseModule {}
