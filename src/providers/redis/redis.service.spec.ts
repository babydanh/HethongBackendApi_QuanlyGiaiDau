import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisService } from './redis.service';

type RedisStore = Map<string, string>;

function createRedisStub(store: RedisStore): Redis {
  return {
    get: jest.fn((key: string) => store.get(key) ?? null),
    set: jest.fn(
      (
        key: string,
        value: string,
        ...options: Array<string | number>
      ) => {
        const isNx = options.includes('NX');
        if (isNx && store.has(key)) return null;
        store.set(key, value);
        return 'OK';
      },
    ),
    eval: jest.fn(
      (
        _script: string,
        _numberOfKeys: number,
        lockKey: string,
        token: string,
      ) => {
        if (store.get(lockKey) === token) {
          store.delete(lockKey);
          return 1;
        }
        return 0;
      },
    ),
  } as unknown as Redis;
}

describe('RedisService JSON cache-aside', () => {
  it('coalesces concurrent misses within one API process', async () => {
    const store = new Map<string, string>();
    const service = new RedisService({} as ConfigService);
    (service as unknown as { client: Redis }).client = createRedisStub(store);
    const loader = jest.fn(() =>
      Promise.resolve({ data: ['public-tournament'] }),
    );

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        service.getOrSetJson('tournaments:list:public:v1:test', 60, loader),
      ),
    );

    expect(loader).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(10);
    expect(results.every((result) => result.data[0] === 'public-tournament')).toBe(
      true,
    );
  });

  it('falls back to the loader when Redis is unavailable', async () => {
    const service = new RedisService({} as ConfigService);
    const unavailable = {
      get: jest.fn().mockRejectedValue(new Error('redis unavailable')),
      set: jest.fn().mockRejectedValue(new Error('redis unavailable')),
      eval: jest.fn().mockRejectedValue(new Error('redis unavailable')),
    } as unknown as Redis;
    (service as unknown as { client: Redis }).client = unavailable;

    await expect(
      service.getOrSetJson(
        'tournaments:list:public:v1:fallback',
        60,
        () => Promise.resolve({ data: ['database-result'] }),
      ),
    ).resolves.toEqual({ data: ['database-result'] });
  });

  it('does not release a lock owned by another token', async () => {
    const store = new Map<string, string>();
    const service = new RedisService({} as ConfigService);
    const redis = createRedisStub(store);
    (service as unknown as { client: Redis }).client = redis;
    store.set('cache-key:lock', 'other-token');

    await (
      service as unknown as {
        releaseCacheLock: (key: string, token: string) => Promise<void>;
      }
    ).releaseCacheLock('cache-key', 'this-token');

    expect(store.get('cache-key:lock')).toBe('other-token');
  });
});
