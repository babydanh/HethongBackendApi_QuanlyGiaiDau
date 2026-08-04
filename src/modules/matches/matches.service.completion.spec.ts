import { ConflictException } from '@nestjs/common';
import { MatchesService } from './matches.service';
import type { MatchesRepository } from './matches.repository';
import type { LiveScoreGateway } from './live-score.gateway';
import type { RankingsService } from '../rankings/rankings.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { RedisService } from '../../providers/redis/redis.service';

describe('MatchesService — completion idempotency & optimistic lock (NOTE-1, D3)', () => {
  let service: MatchesService;
  let mockRepo: jest.Mocked<Partial<MatchesRepository>>;
  let mockGateway: jest.Mocked<Partial<LiveScoreGateway>>;
  let mockRankings: jest.Mocked<Partial<RankingsService>>;
  let mockNotifications: jest.Mocked<Partial<NotificationsService>>;
  let mockRedis: jest.Mocked<Partial<RedisService>>;

  const existingMatch = {
    id: 'match-1',
    tournamentId: 'tournament-1',
    status: 'ONGOING',
    refereeId: 'referee-1',
    participant1Id: 'p1',
    participant2Id: 'p2',
    p1SetsWon: 2,
    p2SetsWon: 0,
    winnerId: null,
    stage: { type: 'SINGLE_ELIMINATION' },
    nextMatchId: null,
    loserNextMatchId: null,
    matchOrder: 1,
    groupId: null,
    scoreDetails: {},
    tournament: { id: 'tournament-1', createdBy: 'creator-1', isRanked: false },
  };

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn().mockResolvedValue(existingMatch),
      completeMatch: jest.fn(),
      updateScore: jest.fn(),
    };
    mockGateway = {
      broadcastScoreUpdate: jest.fn(),
      broadcastMatchStatus: jest.fn(),
    };
    mockRankings = {
      processMatchResult: jest.fn().mockResolvedValue(undefined),
    };
    mockNotifications = {
      sendNotification: jest.fn().mockResolvedValue(undefined),
    };
    mockRedis = {
      del: jest.fn().mockResolvedValue(undefined),
      delByPattern: jest.fn().mockResolvedValue(undefined),
      hset: jest.fn().mockResolvedValue(undefined),
    };

    service = new MatchesService(
      mockRepo as unknown as MatchesRepository,
      mockGateway as unknown as LiveScoreGateway,
      mockRankings as unknown as RankingsService,
      mockNotifications as unknown as NotificationsService,
      mockRedis as unknown as RedisService,
    );
  });

  describe('finalizeCompletedMatch', () => {
    it('surfaces stale-revision completion conflict as 409 with currentRevision', async () => {
      mockRepo.completeMatch = jest
        .fn()
        .mockResolvedValue({ conflict: true, currentMatch: { revision: 9 } });

      await expect(
        service['finalizeCompletedMatch'](existingMatch as never, 'match-1', 'p1', 'referee-1', {
          expectedRevision: 7,
        }),
      ).rejects.toThrow(ConflictException);

      // Conflict must NOT trigger any side effect.
      expect(mockRedis.del).not.toHaveBeenCalled();
      expect(mockGateway.broadcastMatchStatus).not.toHaveBeenCalled();
      expect(mockGateway.broadcastScoreUpdate).not.toHaveBeenCalled();
      expect(mockNotifications.sendNotification).not.toHaveBeenCalled();
    });

    it('repeated completion (repository returns null) is idempotent — zero side effects', async () => {
      mockRepo.completeMatch = jest.fn().mockResolvedValue(null);

      const result = await service['finalizeCompletedMatch'](
        existingMatch as never,
        'match-1',
        'p1',
        'referee-1',
      );

      expect(result).toBe(existingMatch);
      expect(mockRedis.del).not.toHaveBeenCalled();
      expect(mockGateway.broadcastMatchStatus).not.toHaveBeenCalled();
      expect(mockGateway.broadcastScoreUpdate).not.toHaveBeenCalled();
      expect(mockNotifications.sendNotification).not.toHaveBeenCalled();
      expect(mockRankings.processMatchResult).not.toHaveBeenCalled();
    });

    it('passes expectedRevision through to the repository completion call', async () => {
      mockRepo.completeMatch = jest.fn().mockResolvedValue(existingMatch);

      await service['finalizeCompletedMatch'](existingMatch as never, 'match-1', 'p1', 'referee-1', {
        expectedRevision: 7,
      });

      expect(mockRepo.completeMatch).toHaveBeenCalledWith(
        'match-1',
        'p1',
        expect.objectContaining({ expectedRevision: 7 }),
      );
    });

    it('runs side effects only when the transaction wins', async () => {
      mockRepo.completeMatch = jest.fn().mockResolvedValue(existingMatch);
      mockRedis.del = jest.fn().mockResolvedValue(undefined);

      await service['finalizeCompletedMatch'](existingMatch as never, 'match-1', 'p1', 'referee-1');

      expect(mockRedis.del).toHaveBeenCalledWith('match:live:match-1');
      expect(mockGateway.broadcastMatchStatus).toHaveBeenCalled();
      expect(mockGateway.broadcastScoreUpdate).toHaveBeenCalled();
    });
  });

  describe('updateScore — non-winning path (repository.updateScore)', () => {
    it('surfaces stale-revision score conflict as 409 with currentRevision', async () => {
      mockRepo.updateScore = jest
        .fn()
        .mockResolvedValue({ conflict: true, currentMatch: { revision: 9 } });
      mockRepo.findById = jest.fn().mockResolvedValue({
        ...existingMatch,
        refereeId: 'referee-1',
      });

      await expect(
        service.updateScore(
          'match-1',
          { sub: 'referee-1', roles: ['REFEREE'] } as never,
          { p1SetsWon: 1, p2SetsWon: 0, expectedRevision: 7 } as never,
        ),
      ).rejects.toThrow(ConflictException);
      expect(mockGateway.broadcastScoreUpdate).not.toHaveBeenCalled();
      expect(mockRedis.hset).not.toHaveBeenCalled();
    });

    it('passes expectedRevision to repository updateScore', async () => {
      mockRepo.updateScore = jest.fn().mockResolvedValue({
        ...existingMatch,
        status: 'ONGOING',
      });
      mockRepo.findById = jest.fn().mockResolvedValue({
        ...existingMatch,
        refereeId: 'referee-1',
      });

      await service.updateScore(
        'match-1',
        { sub: 'referee-1', roles: ['REFEREE'] } as never,
        { p1SetsWon: 1, p2SetsWon: 0, expectedRevision: 7 } as never,
      );

      expect(mockRepo.updateScore).toHaveBeenCalledWith(
        'match-1',
        'referee-1',
        expect.objectContaining({ expectedRevision: 7 }),
      );
    });
  });
});
