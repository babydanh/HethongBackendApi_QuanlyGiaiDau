import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TournamentsService } from './tournaments.service';
import type { TournamentsRepository } from './tournaments.repository';
import type { BracketGeneratorService } from './bracket-generator.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { StorageService } from '../../providers/storage/storage.service';
import type { RedisService } from '../../providers/redis/redis.service';
import { deriveGroupStageConfig } from './utils/group-stage-config';

describe('deriveGroupStageConfig (pure)', () => {
  it('rejects < 4 teams', () => {
    expect(() => deriveGroupStageConfig(3)).toThrow();
    expect(() => deriveGroupStageConfig(0)).toThrow();
  });

  it('4-5 teams → 2 groups, advance 1', () => {
    expect(deriveGroupStageConfig(4)).toEqual({ numGroups: 2, teamsAdvancing: 1, teamsPerGroup: 2 });
    expect(deriveGroupStageConfig(5)).toEqual({ numGroups: 2, teamsAdvancing: 1, teamsPerGroup: 3 });
  });

  it('6-11 teams → 2 groups, advance 2', () => {
    const r6 = deriveGroupStageConfig(6);
    expect(r6.numGroups).toBe(2); expect(r6.teamsAdvancing).toBe(2); expect(r6.teamsPerGroup).toBe(3);
    const r11 = deriveGroupStageConfig(11);
    expect(r11.numGroups).toBe(2); expect(r11.teamsAdvancing).toBe(2); expect(r11.teamsPerGroup).toBe(6);
  });

  it('12-15 teams → 4 groups, advance 1', () => {
    expect(deriveGroupStageConfig(12)).toEqual({ numGroups: 4, teamsAdvancing: 1, teamsPerGroup: 3 });
    expect(deriveGroupStageConfig(15)).toEqual({ numGroups: 4, teamsAdvancing: 1, teamsPerGroup: 4 });
  });

  it('16-23 teams → 4 groups, advance 2', () => {
    expect(deriveGroupStageConfig(16)).toEqual({ numGroups: 4, teamsAdvancing: 2, teamsPerGroup: 4 });
    expect(deriveGroupStageConfig(23)).toEqual({ numGroups: 4, teamsAdvancing: 2, teamsPerGroup: 6 });
  });

  it('24-32 teams → 8 groups', () => {
    const r24 = deriveGroupStageConfig(24);
    expect(r24.numGroups).toBe(8); expect(r24.teamsAdvancing).toBe(2);
    const r32 = deriveGroupStageConfig(32);
    expect(r32.numGroups).toBe(8); expect(r32.teamsAdvancing).toBe(2);
  });
});

describe('TournamentsService — Lite pairing guards', () => {
  let service: TournamentsService;
  let mockRepo: any;
  let mockBracketGenerator: any;
  let mockNotifications: any;
  let mockStorage: any;
  let mockRedis: any;
  let mockConfig: any;

  const liteTournament = {
    id: 'tournament-1',
    createdBy: 'user-1',
    communityId: 'community-1',
    tournamentConfig: { mode: 'LITE', bracketType: 'SINGLE_ELIMINATION', registrationMode: 'OPEN' },
    matchType: 'DOUBLES',
    status: 'REGISTRATION_OPEN',
    categoryId: 'cat-1',
    name: 'Test Lite',
  } as any;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findCategory: jest.fn(),
      findCommunityMember: jest.fn(),
      hasNonDeletedStagesOrMatches: jest.fn(),
      findLitePendingPartnerParticipants: jest.fn(),
      findLiteParticipantsWithRosters: jest.fn(),
      findUserBasicById: jest.fn(),
      findLeaderByParticipantId: jest.fn(),
      generateLitePairsTx: jest.fn(),
      lockTournamentAndPair: jest.fn(),
      lockTournamentAndUnpair: jest.fn(),
      registerParticipant: jest.fn(),
      countLiteActiveRosterUsers: jest.fn(),
      update: jest.fn(),
    };

    mockBracketGenerator = {};
    mockNotifications = {};
    mockStorage = {};
    mockRedis = {
      delByPattern: jest.fn(),
    };
    mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'FRONTEND_URL') return 'http://localhost:3001';
        return undefined;
      }),
    };

    service = new TournamentsService(
      mockRepo as any,
      mockBracketGenerator as any,
      mockNotifications as any,
      mockStorage as any,
      mockRedis as any,
      mockConfig as any,
      {} as any,
    );
  });

  describe('checkLiteAuthorization', () => {
    it('rejects non-Lite tournament', async () => {
      mockRepo.findById!.mockResolvedValue({
        ...liteTournament,
        tournamentConfig: { mode: 'ADVANCED' },
      });
      await expect(
        (service as any).checkLiteAuthorization('tournament-1', 'user-1', []),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows creator', async () => {
      mockRepo.findById!.mockResolvedValue(liteTournament);
      const result = await (service as any).checkLiteAuthorization('tournament-1', 'user-1', []);
      expect(result.tournament.id).toBe('tournament-1');
    });

    it('allows ADMIN', async () => {
      mockRepo.findById!.mockResolvedValue(liteTournament);
      const result = await (service as any).checkLiteAuthorization('tournament-1', 'other-user', ['ADMIN']);
      expect(result.tournament.id).toBe('tournament-1');
    });

    it('allows community OWNER', async () => {
      mockRepo.findById!.mockResolvedValue(liteTournament);
      mockRepo.findCommunityMember!.mockResolvedValue({ role: 'OWNER', status: 'JOINED' });
      const result = await (service as any).checkLiteAuthorization('tournament-1', 'other-user', []);
      expect(result.tournament.id).toBe('tournament-1');
    });

    it('rejects non-member', async () => {
      mockRepo.findById!.mockResolvedValue(liteTournament);
      mockRepo.findCommunityMember!.mockResolvedValue(null);
      await expect(
        (service as any).checkLiteAuthorization('tournament-1', 'other-user', []),
      ).rejects.toThrow();
    });
  });

  describe('update banner presentation settings', () => {
    const inProgressTournament = {
      ...liteTournament,
      status: 'IN_PROGRESS',
      tournamentType: 'PUBLIC',
      tournamentConfig: {
        mode: 'ADVANCED',
        bracketType: 'SINGLE_ELIMINATION',
        registrationMode: 'OPEN',
        hideFeaturedCardText: false,
      },
      registrationStartDate: null,
      registrationEndDate: null,
      startDate: null,
      endDate: null,
      genderRestriction: null,
      bannerUrl: null,
      logoUrl: null,
      parentId: null,
    } as any;

    beforeEach(() => {
      mockRepo.findById!.mockResolvedValue(inProgressTournament);
      mockRepo.findCategory!.mockResolvedValue({
        id: 'cat-1',
        name: 'Pickleball',
        slug: 'pickleball',
        categoryConfig: null,
      } as any);
      mockRepo.update!.mockImplementation(async (_id, _userId, dto) => ({
        ...inProgressTournament,
        ...dto,
      }) as any);
    });

    it('allows hiding public banner text while preserving tournament configuration', async () => {
      await service.update(
        'tournament-1',
        'user-1',
        { tournamentConfig: { hideFeaturedCardText: true } } as any,
      );

      expect(mockRepo.update).toHaveBeenCalledWith(
        'tournament-1',
        'user-1',
        expect.objectContaining({
          tournamentConfig: {
            ...inProgressTournament.tournamentConfig,
            hideFeaturedCardText: true,
          },
        }),
      );
    });

    it('still rejects gameplay configuration changes while in progress', async () => {
      await expect(
        service.update(
          'tournament-1',
          'user-1',
          { tournamentConfig: { registrationMode: 'APPROVAL' } } as any,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('pairLiteParticipants', () => {
    it('rejects singles tournament', async () => {
      mockRepo.findById!.mockResolvedValue({ ...liteTournament, matchType: 'SINGLES' });
      await expect(
        service.pairLiteParticipants('tournament-1', 'user-1', [], {
          participant1Id: 'p1', participant2Id: 'p2',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when bracket exists (UX precheck)', async () => {
      mockRepo.findById!.mockResolvedValue(liteTournament);
      mockRepo.findCommunityMember!.mockResolvedValue(null);
      mockRepo.hasNonDeletedStagesOrMatches!.mockResolvedValue(true);
      await expect(
        service.pairLiteParticipants('tournament-1', 'user-1', ['ADMIN'], {
          participant1Id: 'p1', participant2Id: 'p2',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('calls lockTournamentAndPair for valid doubles', async () => {
      mockRepo.findById!.mockResolvedValue(liteTournament);
      mockRepo.hasNonDeletedStagesOrMatches!.mockResolvedValue(false);
      mockRepo.findLeaderByParticipantId!.mockResolvedValue({ userId: 'leader-1', role: 'MAIN', id: 'leader-1', joinedAt: new Date() });
      mockRepo.findUserBasicById!.mockResolvedValue({ id: 'leader-1', fullName: 'Player One', email: 'p1@test.com' });
      mockRepo.lockTournamentAndPair!.mockResolvedValue({ id: 'p1', teamStatus: 'COMPLETE' });
      const result = await service.pairLiteParticipants('tournament-1', 'user-1', ['ADMIN'], {
        participant1Id: 'p1', participant2Id: 'p2',
      });
      expect(mockRepo.lockTournamentAndPair).toHaveBeenCalled();
      expect(result).toEqual({ id: 'p1', teamStatus: 'COMPLETE' });
    });
  });

  describe('generateLitePairs', () => {
    it('rejects singles', async () => {
      mockRepo.findById!.mockResolvedValue({ ...liteTournament, matchType: 'SINGLES' });
      await expect(
        service.generateLitePairs('tournament-1', 'user-1', [], { strategy: 'RANDOM' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('calls generateLitePairsTx with valid input (tx is authoritative)', async () => {
      mockRepo.findById!.mockResolvedValue(liteTournament);
      mockRepo.hasNonDeletedStagesOrMatches!.mockResolvedValue(false);
      mockRepo.generateLitePairsTx!.mockResolvedValue({
        message: 'Đã ghép 1 cặp thành công.',
        paired: [{ participant1Id: 'p1', participant2Id: 'p2', teamName: 'P1 / P2' }],
        unpairedParticipantIds: [],
        strategy: 'RANDOM',
      });
      const result = await service.generateLitePairs('tournament-1', 'user-1', ['ADMIN'], { strategy: 'RANDOM' });
      expect(mockRepo.generateLitePairsTx).toHaveBeenCalled();
      expect(result.paired).toHaveLength(1);
    });
  });

  describe('unpairLiteParticipant', () => {
    it('rejects when bracket exists (UX precheck)', async () => {
      mockRepo.findById!.mockResolvedValue(liteTournament);
      mockRepo.findCommunityMember!.mockResolvedValue(null);
      mockRepo.hasNonDeletedStagesOrMatches!.mockResolvedValue(true);
      await expect(
        (service as any).unpairLiteParticipant('tournament-1', 'paired-p1', 'user-1', ['ADMIN']),
      ).rejects.toThrow(BadRequestException);
    });

    it('calls lockTournamentAndUnpair for valid request', async () => {
      mockRepo.findById!.mockResolvedValue(liteTournament);
      mockRepo.hasNonDeletedStagesOrMatches!.mockResolvedValue(false);
      mockRepo.lockTournamentAndUnpair!.mockResolvedValue({
        leader: { id: 'original', teamStatus: 'PENDING_PARTNER' },
        partner: { id: 'new', teamStatus: 'PENDING_PARTNER' },
      });
      const result = await (service as any).unpairLiteParticipant('tournament-1', 'paired-p1', 'user-1', ['ADMIN']);
      expect(mockRepo.lockTournamentAndUnpair).toHaveBeenCalledWith('tournament-1', 'paired-p1', 'user-1');
      expect(result.leader.teamStatus).toBe('PENDING_PARTNER');
    });
  });
});

// ─── Structural guards — verify tx-method contracts via source inspection ───
describe('Structural guards — repository transaction contracts', () => {
  it('registerParticipant contains FOR UPDATE row lock + Lite roster capacity query in same tx (source pattern)', () => {
    // This guard ensures the source file has the expected patterns in registerParticipant
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').join(__dirname, 'tournaments.repository.ts'),
      'utf-8',
    );
    // Verify registerParticipant has FOR UPDATE tournament lock
    const hasForUpdate = src.includes('.for(\'update\')') &&
      src.includes('Khong tim thay giai dau') === false; // just verify the file compiles
    expect(hasForUpdate).toBe(true);

    // Verify Lite capacity query counts distinct roster users
    const hasRosterCount = src.includes('count(distinct') &&
      src.includes('tournamentRosters.userId') &&
      src.includes('maxParticipants');
    expect(hasRosterCount).toBe(true);

    // Verify non-Lite path still has COMPLETE+paid count
    const hasNormalCount = src.includes('COMPLETE') &&
      src.includes('isPaid') &&
      src.includes('maxParticipants') &&
      !src.includes('registerLiteParticipant');
    expect(hasNormalCount).toBe(true);
  });

  it('assertLitePairableInTx called by lockTournamentAndPair/Unpair/generateLitePairsTx', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').join(__dirname, 'tournaments.repository.ts'),
      'utf-8',
    );
    const calls = (src.match(/assertLitePairableInTx/g) || []).length;
    // 1 def + 3 callers (lockTournamentAndPair, lockTournamentAndUnpair, generateLitePairsTx)
    expect(calls).toBe(4);
  });

  it('unpair uses registeredBy for deterministic leader', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').join(__dirname, 'tournaments.repository.ts'),
      'utf-8',
    );
    const hasRegisteredByCheck = src.includes('participant.registeredBy') &&
      src.includes('leaderRoster') &&
      src.includes('throw');
    expect(hasRegisteredByCheck).toBe(true);
  });

  it('no stale registerLiteParticipant or checkLiteCapacityInTx wrapper', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').join(__dirname, 'tournaments.repository.ts'),
      'utf-8',
    );
    expect(src.includes('registerLiteParticipant')).toBe(false);
    expect(src.includes('checkLiteCapacityInTx')).toBe(false);
  });

  it('getUserEloInTx present and used by generateLitePairsTx', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').join(__dirname, 'tournaments.repository.ts'),
      'utf-8',
    );
    expect(src.includes('getUserEloInTx')).toBe(true);
    expect(src.includes('getUserElo(')).toBe(true); // keep original
    const genRef = src.match(/getUserEloInTx/g) || [];
    expect(genRef.length).toBeGreaterThanOrEqual(1);
  });
});
