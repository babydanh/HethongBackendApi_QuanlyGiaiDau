import { Inject, Injectable } from '@nestjs/common';
import { PG_CONNECTION } from '../../../database/database.module';
import type { AppDb } from '../../../database/db.types';
import * as schema from '../../../database/schema';
import { and, eq, sql } from 'drizzle-orm';
import type { Transaction } from '../../audit/audit.service';

@Injectable()
export class TournamentRatingRepository {
  constructor(@Inject(PG_CONNECTION) private readonly db: AppDb) {}
  async getUserElo(
    userId: string,
    categoryId: string,
    matchType: string,
  ): Promise<number> {
    const result = await this.db
      .select({ eloPoints: schema.userRanks.eloPoints })
      .from(schema.userRanks)
      .where(
        and(
          eq(schema.userRanks.userId, userId),
          eq(schema.userRanks.categoryId, categoryId),
          eq(schema.userRanks.matchType, matchType),
          sql`${schema.userRanks.communityId} IS NULL`,
        ),
      )
      .limit(1);
    return result[0]?.eloPoints ?? 1000;
  }
  async getUserEloInTx(
    tx: Transaction,
    userId: string,
    categoryId: string,
    matchType: string,
  ): Promise<number> {
    const result = await tx
      .select({ eloPoints: schema.userRanks.eloPoints })
      .from(schema.userRanks)
      .where(
        and(
          eq(schema.userRanks.userId, userId),
          eq(schema.userRanks.categoryId, categoryId),
          eq(schema.userRanks.matchType, matchType),
          sql`${schema.userRanks.communityId} IS NULL`,
        ),
      )
      .limit(1);
    return result[0]?.eloPoints ?? 1000;
  }
}
