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
      isTournamentManager: jest.fn().mockResolvedValue(false),
      isRefereeAccepted: jest.fn().mockResolvedValue(false),
      completeMatch: jest.fn(),
      updateScore: jest.fn(),
      checkAllMatchesCompleted: jest.fn().mockResolvedValue(false),
      getRostersForParticipants: jest.fn().mockResolvedValue([]),
      getFollowerUserIds: jest.fn().mockResolvedValue([]),
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
      getClient: jest.fn(() => ({ expire: jest.fn().mockResolvedValue(undefined) })),
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

    it('rejects a football score update without the canonical football payload', async () => {
      mockRepo.findById = jest.fn().mockResolvedValue({
        ...existingMatch,
        tournament: {
          ...existingMatch.tournament,
          sportRules: { kind: 'FOOTBALL' },
        },
      });

      await expect(
        service.updateScore(
          'match-1',
          { sub: 'referee-1', roles: ['REFEREE'] } as never,
          { p1SetsWon: 1, p2SetsWon: 0 } as never,
        ),
      ).rejects.toThrow('bắt buộc phải gửi scoreDetails.football');
      expect(mockRepo.updateScore).not.toHaveBeenCalled();
    });

    it('does not finalize a two-leg tie from a current-leg win when aggregate is level', async () => {
      const secondLeg = {
        ...existingMatch,
        tieId: 'tie-1',
        leg: 2,
        tournament: {
          ...existingMatch.tournament,
          sportRules: { kind: 'FOOTBALL' },
        },
      };
      const firstLeg = {
        ...secondLeg,
        id: 'match-leg-1',
        leg: 1,
        scoreDetails: {
          football: { team1Goals: 0, team2Goals: 1, phase: 'FULL_TIME' },
        },
      };
      mockRepo.findById = jest.fn().mockResolvedValue(secondLeg);
      mockRepo.findCompletedTieLeg = jest.fn().mockResolvedValue(firstLeg);
      mockRepo.updateScore = jest.fn().mockResolvedValue({ ...secondLeg, status: 'ONGOING' });

      await service.updateScore(
        'match-1',
        { sub: 'referee-1', roles: ['REFEREE'] } as never,
        {
          p1SetsWon: 1,
          p2SetsWon: 0,
          scoreDetails: {
            football: { team1Goals: 1, team2Goals: 0, phase: 'FULL_TIME' },
          },
        } as never,
      );

      expect(mockRepo.completeMatch).not.toHaveBeenCalled();
      expect(mockRepo.updateScore).toHaveBeenCalled();
    });

    it('finalizes a two-leg aggregate tie only with a valid shootout winner', async () => {
      const secondLeg = {
        ...existingMatch,
        tieId: 'tie-1',
        leg: 2,
        tournament: {
          ...existingMatch.tournament,
          sportRules: { kind: 'FOOTBALL' },
          tournamentConfig: { penaltyShootout: true },
        },
      };
      const firstLeg = {
        ...secondLeg,
        id: 'match-leg-1',
        leg: 1,
        scoreDetails: {
          football: { team1Goals: 0, team2Goals: 1, phase: 'FULL_TIME' },
        },
      };
      mockRepo.findById = jest.fn().mockResolvedValue(secondLeg);
      mockRepo.findCompletedTieLeg = jest.fn().mockResolvedValue(firstLeg);
      mockRepo.completeMatch = jest.fn().mockResolvedValue({ ...secondLeg, status: 'COMPLETED' });

      await service.updateScore(
        'match-1',
        { sub: 'referee-1', roles: ['REFEREE'] } as never,
        {
          p1SetsWon: 1,
          p2SetsWon: 0,
          scoreDetails: {
            football: {
              team1Goals: 1,
              team2Goals: 0,
              phase: 'PENALTY_SHOOTOUT',
              shootout: { team1Goals: 4, team2Goals: 3, winnerId: 'p1' },
            },
          },
        } as never,
      );

      expect(mockRepo.completeMatch).toHaveBeenCalledWith('match-1', 'p1', expect.any(Object));
    });
  });

  describe('updateStatus — football completion derives from goals', () => {
    const footballMatch = {
      ...existingMatch,
      tournament: {
        ...existingMatch.tournament,
        sportRules: { kind: 'FOOTBALL' },
      },
      p1SetsWon: 0,
      p2SetsWon: 0,
      scoreDetails: {
        football: {
          team1Goals: 2,
          team2Goals: 1,
          phase: 'FULL_TIME',
        },
      },
    };

    it('uses football goals instead of generic set counters', async () => {
      mockRepo.findById = jest.fn().mockResolvedValue(footballMatch);
      mockRepo.completeMatch = jest.fn().mockResolvedValue({ ...footballMatch, status: 'COMPLETED' });

      await service.updateStatus(
        'match-1',
        { sub: 'referee-1', roles: ['REFEREE'] } as never,
        { status: 'COMPLETED' } as never,
      );

      expect(mockRepo.completeMatch).toHaveBeenCalledWith(
        'match-1',
        'p1',
        expect.objectContaining({ p1SetsWon: 0, p2SetsWon: 0 }),
      );
    });

    it('does not complete a football match while its phase is still live', async () => {
      mockRepo.findById = jest.fn().mockResolvedValue({
        ...footballMatch,
        scoreDetails: {
          football: {
            team1Goals: 2,
            team2Goals: 1,
            phase: 'SECOND_HALF',
          },
        },
      });

      await expect(
        service.updateStatus(
          'match-1',
          { sub: 'referee-1', roles: ['REFEREE'] } as never,
          { status: 'COMPLETED' } as never,
        ),
      ).rejects.toThrow('toàn thời gian');
      expect(mockRepo.completeMatch).not.toHaveBeenCalled();
    });

    it('allows a drawn first leg without forcing an early shootout', async () => {
      const firstLeg = {
        ...footballMatch,
        tieId: 'tie-1',
        leg: 1,
        scoreDetails: {
          football: { team1Goals: 0, team2Goals: 0, phase: 'FULL_TIME' },
        },
      };
      mockRepo.findById = jest.fn().mockResolvedValue(firstLeg);
      mockRepo.findCompletedTieLeg = jest.fn().mockResolvedValue(null);
      mockRepo.completeMatch = jest.fn().mockResolvedValue({ ...firstLeg, status: 'COMPLETED' });

      await service.updateStatus(
        'match-1',
        { sub: 'referee-1', roles: ['REFEREE'] } as never,
        { status: 'COMPLETED' } as never,
      );

      expect(mockRepo.completeMatch).toHaveBeenCalledWith(
        'match-1',
        null,
        expect.objectContaining({ scoreDetails: firstLeg.scoreDetails }),
      );
    });

    it('uses aggregate goals to advance a second leg when the leg itself is drawn', async () => {
      const secondLeg = {
        ...footballMatch,
        tieId: 'tie-1',
        leg: 2,
        scoreDetails: {
          football: { team1Goals: 1, team2Goals: 1, phase: 'FULL_TIME' },
        },
      };
      const firstLeg = {
        ...secondLeg,
        id: 'match-leg-1',
        leg: 1,
        scoreDetails: {
          football: { team1Goals: 2, team2Goals: 0, phase: 'FULL_TIME' },
        },
      };
      mockRepo.findById = jest.fn().mockResolvedValue(secondLeg);
      mockRepo.findCompletedTieLeg = jest.fn().mockResolvedValue(firstLeg);
      mockRepo.completeMatch = jest.fn().mockResolvedValue({ ...secondLeg, status: 'COMPLETED' });

      await service.updateStatus(
        'match-1',
        { sub: 'referee-1', roles: ['REFEREE'] } as never,
        { status: 'COMPLETED' } as never,
      );

      // The current leg is a draw, while the aggregate winner is participant 1;
      // repository completion receives null for the leg result and resolves
      // advancement from both completed legs.
      expect(mockRepo.completeMatch).toHaveBeenCalledWith('match-1', null, expect.any(Object));
    });

    it('requires aggregate shootout only when both legs are tied', async () => {
      const secondLeg = {
        ...footballMatch,
        tieId: 'tie-1',
        leg: 2,
        tournament: {
          ...footballMatch.tournament,
          tournamentConfig: { penaltyShootout: true },
        },
        scoreDetails: {
          football: {
            team1Goals: 1,
            team2Goals: 0,
            phase: 'PENALTY_SHOOTOUT',
            shootout: { team1Goals: 4, team2Goals: 3, winnerId: 'p1' },
          },
        },
      };
      const firstLeg = {
        ...secondLeg,
        id: 'match-leg-1',
        leg: 1,
        scoreDetails: {
          football: { team1Goals: 0, team2Goals: 1, phase: 'FULL_TIME' },
        },
      };
      mockRepo.findById = jest.fn().mockResolvedValue(secondLeg);
      mockRepo.findCompletedTieLeg = jest.fn().mockResolvedValue(firstLeg);
      mockRepo.completeMatch = jest.fn().mockResolvedValue({ ...secondLeg, status: 'COMPLETED' });

      await service.updateStatus(
        'match-1',
        { sub: 'referee-1', roles: ['REFEREE'] } as never,
        { status: 'COMPLETED' } as never,
      );

      expect(mockRepo.completeMatch).toHaveBeenCalledWith('match-1', 'p1', expect.any(Object));
    });
  });

  describe('operateMatch — football operational results', () => {
    it('persists a standard 3-0 football score for a no-show decision', async () => {
      const footballMatch = {
        ...existingMatch,
        tournament: {
          ...existingMatch.tournament,
          sportRules: { kind: 'FOOTBALL' },
        },
        scoreDetails: {},
      };
      mockRepo.findById = jest.fn().mockResolvedValue(footballMatch);
      mockRepo.isTournamentManager = jest.fn().mockResolvedValue(true);
      mockRepo.completeMatch = jest.fn().mockResolvedValue(footballMatch);

      await service.operateMatch(
        'match-1',
        { sub: 'creator-1', roles: ['ORGANIZER'] } as never,
        { action: 'NO_SHOW', reason: 'Đội không đến sân', winnerId: 'p1' } as never,
      );

      expect(mockRepo.completeMatch).toHaveBeenCalledWith(
        'match-1',
        'p1',
        expect.objectContaining({
          p1SetsWon: expect.any(Number),
          scoreDetails: expect.objectContaining({
            football: expect.objectContaining({
              team1Goals: 3,
              team2Goals: 0,
              phase: 'COMPLETED',
            }),
            specialResult: expect.objectContaining({ action: 'NO_SHOW' }),
          }),
        }),
      );
    });

    it('uses the configured forfeit goal count when the tournament overrides it', async () => {
      const footballMatch = {
        ...existingMatch,
        tournament: {
          ...existingMatch.tournament,
          sportRules: { kind: 'FOOTBALL', scoring: { forfeitGoals: 5 } },
        },
        scoreDetails: {},
      };
      mockRepo.findById = jest.fn().mockResolvedValue(footballMatch);
      mockRepo.isTournamentManager = jest.fn().mockResolvedValue(true);
      mockRepo.completeMatch = jest.fn().mockResolvedValue(footballMatch);

      await service.operateMatch(
        'match-1',
        { sub: 'creator-1', roles: ['ORGANIZER'] } as never,
        { action: 'WALKOVER', reason: 'Không đủ đội hình', winnerId: 'p2' } as never,
      );

      expect(mockRepo.completeMatch).toHaveBeenCalledWith(
        'match-1',
        'p2',
        expect.objectContaining({
          scoreDetails: expect.objectContaining({
            football: expect.objectContaining({ team1Goals: 0, team2Goals: 5 }),
          }),
        }),
      );
    });

    it('does not finalize retirement without a canonical football score', async () => {
      const footballMatch = {
        ...existingMatch,
        tournament: {
          ...existingMatch.tournament,
          sportRules: { kind: 'FOOTBALL' },
        },
        scoreDetails: {},
      };
      mockRepo.findById = jest.fn().mockResolvedValue(footballMatch);
      mockRepo.isTournamentManager = jest.fn().mockResolvedValue(true);

      await expect(
        service.operateMatch(
          'match-1',
          { sub: 'creator-1', roles: ['ORGANIZER'] } as never,
          { action: 'RETIREMENT', reason: 'Đội xin dừng trận', winnerId: 'p1' } as never,
        ),
      ).rejects.toThrow('cần scoreDetails.football hợp lệ');
      expect(mockRepo.completeMatch).not.toHaveBeenCalled();
    });

    it('retirement finalizes the recorded football score as a terminal snapshot', async () => {
      const footballMatch = {
        ...existingMatch,
        tournament: {
          ...existingMatch.tournament,
          sportRules: { kind: 'FOOTBALL' },
        },
        scoreDetails: {
          football: { team1Goals: 1, team2Goals: 0, phase: 'SECOND_HALF' },
        },
      };
      mockRepo.findById = jest.fn().mockResolvedValue(footballMatch);
      mockRepo.isTournamentManager = jest.fn().mockResolvedValue(true);
      mockRepo.completeMatch = jest.fn().mockResolvedValue(footballMatch);

      await service.operateMatch(
        'match-1',
        { sub: 'creator-1', roles: ['ORGANIZER'] } as never,
        { action: 'RETIREMENT', reason: 'Đội xin dừng trận', winnerId: 'p1' } as never,
      );

      expect(mockRepo.completeMatch).toHaveBeenCalledWith(
        'match-1',
        'p1',
        expect.objectContaining({
          p1SetsWon: 1,
          p2SetsWon: 0,
          scoreDetails: expect.objectContaining({
            football: expect.objectContaining({
              team1Goals: 1,
              team2Goals: 0,
              phase: 'COMPLETED',
            }),
          }),
        }),
      );
    });

    it('postpones an unstarted fixture without completing or ranking it', async () => {
      const scheduledMatch = {
        ...existingMatch,
        status: 'SCHEDULED',
        scoreDetails: {},
      };
      mockRepo.findById = jest.fn().mockResolvedValue(scheduledMatch);
      mockRepo.isTournamentManager = jest.fn().mockResolvedValue(true);
      mockRepo.recordNonFinalOperation = jest
        .fn()
        .mockResolvedValue({ ...scheduledMatch, status: 'SCHEDULED' });

      await service.operateMatch(
        'match-1',
        { sub: 'creator-1', roles: ['ORGANIZER'] } as never,
        { action: 'POSTPONE', reason: 'Sân chưa sẵn sàng' } as never,
      );

      expect(mockRepo.recordNonFinalOperation).toHaveBeenCalledWith(
        'match-1',
        'creator-1',
        expect.objectContaining({
          status: 'SCHEDULED',
          p1SetsWon: 0,
          p2SetsWon: 0,
          scheduledAt: null,
          winnerId: null,
          scoreDetails: expect.objectContaining({
            specialResult: expect.objectContaining({
              action: 'POSTPONE',
              requiresReschedule: true,
            }),
          }),
        }),
      );
      expect(mockRepo.completeMatch).not.toHaveBeenCalled();
      expect(mockRankings.processMatchResult).not.toHaveBeenCalled();
    });

    it('marks an abandoned fixture disputed without awarding a winner', async () => {
      const ongoingMatch = {
        ...existingMatch,
        status: 'ONGOING',
        scoreDetails: {},
      };
      mockRepo.findById = jest.fn().mockResolvedValue(ongoingMatch);
      mockRepo.isTournamentManager = jest.fn().mockResolvedValue(true);
      mockRepo.recordNonFinalOperation = jest
        .fn()
        .mockResolvedValue({ ...ongoingMatch, status: 'DISPUTED' });

      await service.operateMatch(
        'match-1',
        { sub: 'creator-1', roles: ['ORGANIZER'] } as never,
        { action: 'ABANDON', reason: 'Mưa lớn không thể tiếp tục' } as never,
      );

      expect(mockRepo.recordNonFinalOperation).toHaveBeenCalledWith(
        'match-1',
        'creator-1',
        expect.objectContaining({
          status: 'DISPUTED',
          scheduledAt: null,
          winnerId: null,
          scoreDetails: expect.objectContaining({
            specialResult: expect.objectContaining({
              action: 'ABANDON',
              requiresResolution: true,
            }),
          }),
        }),
      );
      expect(mockRepo.completeMatch).not.toHaveBeenCalled();
      expect(mockRankings.processMatchResult).not.toHaveBeenCalled();
    });
  });
});
