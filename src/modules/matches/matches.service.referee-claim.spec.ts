import { ConflictException, ForbiddenException } from '@nestjs/common';
import { MatchesService } from './matches.service';
import type { MatchesRepository } from './matches.repository';
import type { LiveScoreGateway } from './live-score.gateway';
import type { RankingsService } from '../rankings/rankings.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { RedisService } from '../../providers/redis/redis.service';

describe('MatchesService — referee claim via roles array (NOTE-6)', () => {
  let service: MatchesService;
  let mockRepo: jest.Mocked<Partial<MatchesRepository>>;
  let mockGateway: jest.Mocked<Partial<LiveScoreGateway>>;
  let mockRankings: jest.Mocked<Partial<RankingsService>>;
  let mockNotifications: jest.Mocked<Partial<NotificationsService>>;
  let mockRedis: jest.Mocked<Partial<RedisService>>;

  const scheduledMatch = {
    id: 'match-1',
    tournamentId: 'tournament-1',
    status: 'SCHEDULED',
    refereeId: null,
    participant1Id: 'p1',
    participant2Id: 'p2',
    p1SetsWon: 0,
    p2SetsWon: 0,
    tournament: { id: 'tournament-1', createdBy: 'creator-1' },
  };

  // JWT payload from JwtStrategy only carries `roles` (plural), never `role`.
  const refereeWithRolesArray = {
    sub: 'referee-1',
    email: 'ref@example.com',
    roles: ['REFEREE'],
  };

  beforeEach(() => {
    mockRepo = {
      // Fresh copy per call so one test cannot mutate state seen by another.
      findById: jest.fn().mockImplementation(() =>
        Promise.resolve({ ...scheduledMatch, refereeId: null }),
      ),
      isRefereeAccepted: jest.fn().mockResolvedValue(true),
      updateRefereeId: jest.fn().mockResolvedValue({ refereeId: 'referee-1' }),
      updateStatus: jest.fn().mockImplementation((id: string) =>
        Promise.resolve({ ...scheduledMatch, refereeId: 'referee-1', id }),
      ),
    };
    mockGateway = {
      broadcastScoreUpdate: jest.fn(),
      broadcastMatchStatus: jest.fn(),
    };
    mockRankings = {};
    mockNotifications = {};
    mockRedis = {
      delByPattern: jest.fn().mockResolvedValue(undefined),
    };

    service = new MatchesService(
      mockRepo as unknown as MatchesRepository,
      mockGateway as unknown as LiveScoreGateway,
      mockRankings as unknown as RankingsService,
      mockNotifications as unknown as NotificationsService,
      mockRedis as unknown as RedisService,
    );
  });

  it('accepted referee with roles array can claim an unassigned match (start ONGOING)', async () => {
    const result = await service.updateStatus('match-1', refereeWithRolesArray as never, {
      status: 'ONGOING',
    } as never);
    expect(result).toBeDefined();
    expect(mockRepo.updateRefereeId).toHaveBeenCalledWith('match-1', 'referee-1', 'referee-1');
  });

  it('referee not accepted by tournament cannot claim', async () => {
    mockRepo.isRefereeAccepted = jest.fn().mockResolvedValue(false);
    await expect(
      service.updateStatus('match-1', refereeWithRolesArray as never, { status: 'ONGOING' } as never),
    ).rejects.toThrow(ForbiddenException);
    expect(mockRepo.updateRefereeId).not.toHaveBeenCalled();
  });

  it('cannot claim match already assigned to another referee', async () => {
    mockRepo.findById = jest.fn().mockResolvedValue({
      ...scheduledMatch,
      refereeId: 'referee-other',
    });
    await expect(
      service.updateStatus('match-1', refereeWithRolesArray as never, { status: 'ONGOING' } as never),
    ).rejects.toThrow(ForbiddenException);
    expect(mockRepo.updateRefereeId).not.toHaveBeenCalled();
  });

  it('concurrent claim conflict surfaces when conditional update returns null', async () => {
    mockRepo.updateRefereeId = jest.fn().mockResolvedValue(null);
    await expect(
      service.updateStatus('match-1', refereeWithRolesArray as never, { status: 'ONGOING' } as never),
    ).rejects.toThrow(ConflictException);
  });

  it('non-referee without admin cannot start match', async () => {
    const viewer = { sub: 'viewer-1', email: 'v@example.com', roles: ['PLAYER'] };
    await expect(
      service.updateStatus('match-1', viewer as never, { status: 'ONGOING' } as never),
    ).rejects.toThrow(ForbiddenException);
  });
});
