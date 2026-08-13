import { Injectable, Inject, Logger } from '@nestjs/common';
import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import { RedisService } from '../../providers/redis/redis.service';

const ACCESS_BAN_CACHE_PREFIX = 'account:access-ban:';
const NEGATIVE_CACHE_TTL_SECONDS = 15;
const MAX_POSITIVE_CACHE_TTL_SECONDS = 60;

/**
 * Single source of truth for sanctions which deny account access. WARN stays
 * informational; only active, unexpired soft/hard bans deny access.
 */
@Injectable()
export class AccountSanctionService {
  private readonly logger = new Logger(AccountSanctionService.name);

  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
    private readonly redisService: RedisService,
  ) {}

  async hasActiveAccessBan(userId: string): Promise<boolean> {
    const cacheKey = this.cacheKey(userId);
    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached === '1') return true;
      if (cached === '0') return false;
    } catch (error) {
      this.logger.warn(`Unable to read access-ban cache: ${this.errorMessage(error)}`);
    }

    const rows = await this.db
      .select({ id: schema.userBans.id, expiresAt: schema.userBans.expiresAt })
      .from(schema.userBans)
      .where(and(
        eq(schema.userBans.userId, userId),
        eq(schema.userBans.isActive, true),
        inArray(schema.userBans.banType, ['SOFT_BAN', 'HARD_BAN']),
        or(
          isNull(schema.userBans.expiresAt),
          gt(schema.userBans.expiresAt, new Date()),
        ),
      ))
      .limit(1);

    const activeBan = rows[0];
    await this.writeCachedAccessBan(userId, activeBan?.expiresAt ?? null, Boolean(activeBan));
    return Boolean(activeBan);
  }

  async markAccessBanned(userId: string, expiresAt: Date | null): Promise<void> {
    await this.writeCachedAccessBan(userId, expiresAt, true);
  }

  async invalidateAccessBan(userId: string): Promise<void> {
    try {
      await this.redisService.del(this.cacheKey(userId));
    } catch (error) {
      this.logger.warn(`Unable to invalidate access-ban cache: ${this.errorMessage(error)}`);
    }
  }

  private async writeCachedAccessBan(
    userId: string,
    expiresAt: Date | null,
    isBanned: boolean,
  ): Promise<void> {
    const ttlSeconds = isBanned
      ? this.positiveCacheTtl(expiresAt)
      : NEGATIVE_CACHE_TTL_SECONDS;
    if (ttlSeconds <= 0) return;

    try {
      await this.redisService.set(this.cacheKey(userId), isBanned ? '1' : '0', ttlSeconds);
    } catch (error) {
      this.logger.warn(`Unable to write access-ban cache: ${this.errorMessage(error)}`);
    }
  }

  private positiveCacheTtl(expiresAt: Date | null): number {
    if (!expiresAt) return MAX_POSITIVE_CACHE_TTL_SECONDS;
    const remainingSeconds = Math.ceil((expiresAt.getTime() - Date.now()) / 1000);
    return Math.min(MAX_POSITIVE_CACHE_TTL_SECONDS, Math.max(0, remainingSeconds));
  }

  private cacheKey(userId: string): string {
    return `${ACCESS_BAN_CACHE_PREFIX}${userId}`;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'unknown cache error';
  }
}
