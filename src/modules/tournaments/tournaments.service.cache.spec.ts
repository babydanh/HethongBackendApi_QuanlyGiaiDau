import { TournamentAccessService } from './services/tournament-access.service';
import { TournamentDiscoveryService } from './services/tournament-discovery.service';
import type { TournamentsRepository } from './tournaments.repository';
import type { RedisService } from '../../providers/redis/redis.service';

describe('TournamentDiscoveryService public list cache', () => {
  it('uses one normalized cache entry for the public tournament endpoint', async () => {
    const repositoryFindAll = jest
      .fn()
      .mockResolvedValue({ data: [], meta: { hasMore: false } });
    const repository = {
      findAll: repositoryFindAll,
    } as unknown as TournamentsRepository;
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
    const access = {} as TournamentAccessService;
    const discovery = new TournamentDiscoveryService(repository, redis, access);

    await discovery.findPublic({ limit: 10 });
    await discovery.findPublic({
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
