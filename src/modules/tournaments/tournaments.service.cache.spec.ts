import { TournamentsService } from './tournaments.service';
import type { TournamentsRepository } from './tournaments.repository';
import type { RedisService } from '../../providers/redis/redis.service';

describe('TournamentsService public list cache', () => {
  it('uses one normalized cache entry for the public tournament endpoint', async () => {
    const service = Object.create(
      TournamentsService.prototype,
    ) as TournamentsService;
    const repositoryFindAll = jest
      .fn()
      .mockResolvedValue({ data: [], meta: { hasMore: false } });
    const repository = { findAll: repositoryFindAll } as unknown as TournamentsRepository;
    const cache = new Map<string, unknown>();
    const getOrSetJson = jest.fn(
      async (key: string, _ttlSeconds: number, loader: () => Promise<unknown>) => {
        const cached = cache.get(key);
        if (cached !== undefined) return cached;
        const loaded = await loader();
        cache.set(key, loaded);
        return loaded;
      },
    );
    const redis = { getOrSetJson } as unknown as RedisService;
    (
      service as unknown as {
        tournamentsRepository: TournamentsRepository;
        redisService: RedisService;
      }
    ).tournamentsRepository = repository;
    (
      service as unknown as {
        tournamentsRepository: TournamentsRepository;
        redisService: RedisService;
      }
    ).redisService = redis;

    await service.findPublic({ limit: 10 });
    await service.findPublic({
      limit: 10,
      visibility: 'PRIVATE',
      tournamentType: 'CLUB',
      createdBy: 'ignored-by-public-route',
    });

    expect(repositoryFindAll).toHaveBeenCalledTimes(1);
    expect(getOrSetJson).toHaveBeenCalledTimes(2);
    expect(getOrSetJson.mock.calls[0][0]).toBe(getOrSetJson.mock.calls[1][0]);
  });
});
