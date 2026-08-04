import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MatchesService } from './matches.service';
import type { MatchesRepository } from './matches.repository';
import type { LiveScoreGateway } from './live-score.gateway';
import type { RankingsService } from '../rankings/rankings.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { RedisService } from '../../providers/redis/redis.service';

describe('MatchesService — object-level authorization (NOTE-4, NOTE-5)', () => {
  let service: MatchesService;
  let mockRepo: jest.Mocked<Partial<MatchesRepository>>;
  let mockGateway: jest.Mocked<Partial<LiveScoreGateway>>;
  let mockRankings: jest.Mocked<Partial<RankingsService>>;
  let mockNotifications: jest.Mocked<Partial<NotificationsService>>;
  let mockRedis: jest.Mocked<Partial<RedisService>>;

  const baseMatch = {
    id: 'match-1',
    tournamentId: 'tournament-1',
    status: 'SCHEDULED',
    refereeId: null,
    participant1Id: 'p1',
    participant2Id: 'p2',
    tournament: {
      id: 'tournament-1',
      createdBy: 'creator-1',
    },
  };

  const organizerOther = {
    sub: 'organizer-2',
    email: 'org2@example.com',
    roles: ['ORGANIZER'],
  };

  const creator = {
    sub: 'creator-1',
    email: 'creator@example.com',
    roles: ['ORGANIZER'],
  };

  const admin = {
    sub: 'admin-1',
    email: 'admin@example.com',
    roles: ['ADMIN'],
  };

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn().mockResolvedValue(baseMatch),
      isRefereeAccepted: jest.fn().mockResolvedValue(true),
      updateSchedule: jest.fn().mockResolvedValue(baseMatch),
      unmuteUser: jest.fn().mockResolvedValue({}),
      updateStatus: jest.fn().mockResolvedValue(baseMatch),
    };
    mockGateway = {
      broadcastScoreUpdate: jest.fn(),
      broadcastMatchStatus: jest.fn(),
      broadcastComment: jest.fn(),
    };
    mockRankings = {};
    mockNotifications = {
      sendNotification: jest.fn().mockResolvedValue(undefined),
    };
    mockRedis = {
      del: jest.fn().mockResolvedValue(undefined),
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

  describe('updateSchedule', () => {
    it('allows tournament creator to update schedule', async () => {
      const result = await service.updateSchedule('match-1', creator as never, { courtName: 'Sân 1' });
      expect(result).toBeDefined();
      expect(mockRepo.updateSchedule).toHaveBeenCalled();
    });

    it('allows admin to update schedule', async () => {
      const result = await service.updateSchedule('match-1', admin as never, { courtName: 'Sân 1' });
      expect(result).toBeDefined();
      expect(mockRepo.updateSchedule).toHaveBeenCalled();
    });

    it('rejects organizer from another tournament with ForbiddenException', async () => {
      await expect(
        service.updateSchedule('match-1', organizerOther as never, { courtName: 'Sân 1' }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockRepo.updateSchedule).not.toHaveBeenCalled();
      expect(mockGateway.broadcastScoreUpdate).not.toHaveBeenCalled();
      expect(mockNotifications.sendNotification).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when match is missing', async () => {
      mockRepo.findById = jest.fn().mockResolvedValue(null);
      await expect(
        service.updateSchedule('match-1', creator as never, { courtName: 'Sân 1' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('unmuteUser', () => {
    it('rejects organizer from another tournament and does NOT delete or broadcast', async () => {
      await expect(
        service.unmuteUser('match-1', 'user-target', organizerOther as never),
      ).rejects.toThrow(ForbiddenException);
      expect(mockRepo.unmuteUser).not.toHaveBeenCalled();
      expect(mockGateway.broadcastComment).not.toHaveBeenCalled();
    });

    it('allows tournament creator to unmute', async () => {
      const result = await service.unmuteUser('match-1', 'user-target', creator as never);
      expect(result).toBeDefined();
      expect(mockRepo.unmuteUser).toHaveBeenCalledWith('match-1', 'user-target');
      expect(mockGateway.broadcastComment).toHaveBeenCalled();
    });

    it('allows admin to unmute', async () => {
      const result = await service.unmuteUser('match-1', 'user-target', admin as never);
      expect(result).toBeDefined();
      expect(mockRepo.unmuteUser).toHaveBeenCalledWith('match-1', 'user-target');
    });
  });

  describe('getMutedUsers', () => {
    beforeEach(() => {
      mockRepo.getMutedUsers = jest.fn().mockResolvedValue([{ userId: 'u1' }]);
    });

    it('rejects organizer from another tournament', async () => {
      await expect(
        service.getMutedUsers('match-1', organizerOther as never),
      ).rejects.toThrow(ForbiddenException);
      expect(mockRepo.getMutedUsers).not.toHaveBeenCalled();
    });

    it('allows tournament creator to list muted users', async () => {
      const result = await service.getMutedUsers('match-1', creator as never);
      expect(result).toHaveLength(1);
      expect(mockRepo.getMutedUsers).toHaveBeenCalledWith('match-1');
    });

    it('throws NotFoundException when match is missing', async () => {
      mockRepo.findById = jest.fn().mockResolvedValue(null);
      await expect(
        service.getMutedUsers('match-1', creator as never),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
