import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private static readonly CACHE_LOCK_TTL_MS = 10_000;
  private static readonly CACHE_WAIT_TIMEOUT_MS = 3_000;
  private static readonly CACHE_POLL_INTERVAL_MS = 50;

  private readonly logger = new Logger(RedisService.name);
  private client: Redis;
  private readonly localInFlight = new Map<string, Promise<unknown>>();

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const host = this.configService.get<string>('REDIS_HOST') || 'localhost';
    const port = Number(this.configService.get<number>('REDIS_PORT')) || 6379;
    const password = this.configService.get<string>('REDIS_PASSWORD');

    this.logger.log(`Connecting to Redis at ${host}:${port}...`);

    this.client = new Redis({
      host,
      port,
      password: password || undefined,
      maxRetriesPerRequest: null, // Required by BullMQ
    });

    this.client.on('connect', () => {
      this.logger.log('Successfully connected to Redis');
    });

    this.client.on('error', (err) => {
      this.logger.error('Redis connection error:', err);
    });
  }

  onModuleDestroy() {
    if (this.client) {
      this.client.disconnect();
    }
  }

  getClient(): Redis {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<'OK'> {
    if (ttlSeconds) {
      return await this.client.set(key, value, 'EX', ttlSeconds);
    }
    return await this.client.set(key, value);
  }

  /**
   * Cache-aside helper for JSON responses.
   *
   * The local promise map coalesces concurrent misses in one API process. A
   * short Redis lease covers concurrent misses across API processes. Both
   * controls are best-effort: PostgreSQL remains the source of truth and a
   * Redis failure falls back to the loader without waiting for the cache.
   */
  async getOrSetJson<T>(
    key: string,
    ttlSeconds: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const existing = this.localInFlight.get(key);
    if (existing) return existing as Promise<T>;

    const execution = this.populateJsonCache(key, ttlSeconds, loader);
    this.localInFlight.set(key, execution);
    try {
      return await execution;
    } finally {
      if (this.localInFlight.get(key) === execution) {
        this.localInFlight.delete(key);
      }
    }
  }

  private async populateJsonCache<T>(
    key: string,
    ttlSeconds: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const initial = await this.readJsonCache<T>(key);
    if (initial.hit) return initial.value as T;
    if (!initial.available) return loader();

    const lockToken = randomUUID();
    const lockState = await this.tryAcquireCacheLock(
      key,
      lockToken,
      RedisService.CACHE_LOCK_TTL_MS,
    );

    if (lockState === undefined) return loader();

    if (lockState) {
      try {
        // Another process may have filled the value between the first read and
        // lock acquisition, so always re-check while holding the lease.
        const raced = await this.readJsonCache<T>(key);
        if (raced.hit) return raced.value as T;

        const value = await loader();
        await this.writeJsonCache(key, value, ttlSeconds);
        return value;
      } finally {
        await this.releaseCacheLock(key, lockToken);
      }
    }

    const waited = await this.waitForJsonCache<T>(key);
    if (waited.hit) return waited.value as T;
    return loader();
  }

  private async readJsonCache<T>(
    key: string,
  ): Promise<{ hit: boolean; value?: T; available: boolean }> {
    try {
      const raw = await this.get(key);
      if (raw === null) return { hit: false, available: true };

      try {
        return { hit: true, value: JSON.parse(raw) as T, available: true };
      } catch {
        // A malformed cache entry is disposable; reload from the source of
        // truth instead of returning corrupted data.
        return { hit: false, available: true };
      }
    } catch {
      return { hit: false, available: false };
    }
  }

  private async writeJsonCache<T>(
    key: string,
    value: T,
    ttlSeconds: number,
  ): Promise<void> {
    try {
      await this.set(key, JSON.stringify(value), ttlSeconds);
    } catch (error) {
      this.logger.debug(`Redis cache write skipped: ${String(error)}`);
    }
  }

  private async tryAcquireCacheLock(
    key: string,
    token: string,
    ttlMs: number,
  ): Promise<boolean | undefined> {
    try {
      const result = await this.client.set(
        `${key}:lock`,
        token,
        'PX',
        ttlMs,
        'NX',
      );
      return result === 'OK';
    } catch {
      return undefined;
    }
  }

  private async releaseCacheLock(key: string, token: string): Promise<void> {
    try {
      await this.client.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        `${key}:lock`,
        token,
      );
    } catch (error) {
      // The lease expiry is the safety net if Redis is unavailable while
      // releasing. Never fail the response because lock cleanup failed.
      this.logger.debug(`Redis cache lock release skipped: ${String(error)}`);
    }
  }

  private async waitForJsonCache<T>(
    key: string,
  ): Promise<{ hit: boolean; value?: T; available: boolean }> {
    const deadline = Date.now() + RedisService.CACHE_WAIT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) =>
        setTimeout(resolve, RedisService.CACHE_POLL_INTERVAL_MS),
      );
      const result = await this.readJsonCache<T>(key);
      if (result.hit || !result.available) return result;
    }
    return { hit: false, available: true };
  }

  async del(key: string): Promise<number> {
    return await this.client.del(key);
  }

  async delByPattern(pattern: string): Promise<number> {
    let deletedCount = 0;
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        deletedCount += await this.client.del(...keys);
      }
    } while (cursor !== '0');
    return deletedCount;
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    return await this.client.hset(key, field, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return await this.client.hget(key, field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return await this.client.hgetall(key);
  }

  async hdel(key: string, field: string): Promise<number> {
    return await this.client.hdel(key, field);
  }
}
