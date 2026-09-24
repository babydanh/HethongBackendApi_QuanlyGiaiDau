import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TournamentsService } from './tournaments.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { TournamentAccessService } from './services/tournament-access.service';
import { TournamentVenueService } from './services/tournament-venue.service';
import { TournamentMediaService } from './services/tournament-media.service';
import { TournamentDiscoveryService } from './services/tournament-discovery.service';
import { TournamentLifecycleService } from './services/tournament-lifecycle.service';
import { TournamentFeePolicyService } from './services/tournament-fee-policy.service';
import { TournamentStaffService } from './services/tournament-staff.service';
import { TournamentRefereeService } from './services/tournament-referee.service';
import { TournamentFollowService } from './services/tournament-follow.service';
import { TournamentResultsService } from './services/tournament-results.service';
import { TournamentDivisionService } from './services/tournament-division.service';
import { TournamentParticipantAdminService } from './services/tournament-participant-admin.service';
import { TournamentImportService } from './services/tournament-import.service';
import { TournamentBracketService } from './services/tournament-bracket.service';
import type { TournamentsRepository } from './tournaments.repository';
import type { BracketGeneratorService } from './bracket-generator.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { StorageService } from '../../providers/storage/storage.service';
import type { VenuesService } from '../venues/venues.service';
import type { RedisService } from '../../providers/redis/redis.service';
import type { CommunitySocialRepository } from '../communities/community-social.repository';
import type { LiveScoreGateway } from '../matches/live-score.gateway';
import { TournamentRealtimeService } from './services/tournament-realtime.service';
import { TournamentRegistrationService } from './services/tournament-registration.service';
import { TournamentLiteService } from './services/tournament-lite.service';
import { TournamentFootballRosterService } from './services/tournament-football-roster.service';
import { deriveGroupStageConfig } from './utils/group-stage-config';

describe('deriveGroupStageConfig (pure)', () => {
  it('rejects < 4 teams', () => {
    expect(() => deriveGroupStageConfig(3)).toThrow();
    expect(() => deriveGroupStageConfig(0)).toThrow();
  });

  it('4-5 teams → 2 groups, advance 1', () => {
    expect(deriveGroupStageConfig(4)).toEqual({
      numGroups: 2,
      teamsAdvancing: 1,
      teamsPerGroup: 2,
    });
    expect(deriveGroupStageConfig(5)).toEqual({
      numGroups: 2,
      teamsAdvancing: 1,
      teamsPerGroup: 3,
    });
  });

  it('6-11 teams → 2 groups, advance 2', () => {
    const r6 = deriveGroupStageConfig(6);
    expect(r6.numGroups).toBe(2);
    expect(r6.teamsAdvancing).toBe(2);
    expect(r6.teamsPerGroup).toBe(3);
    const r11 = deriveGroupStageConfig(11);
    expect(r11.numGroups).toBe(2);
    expect(r11.teamsAdvancing).toBe(2);
    expect(r11.teamsPerGroup).toBe(6);
  });

  it('12-15 teams → 4 groups, advance 1', () => {
    expect(deriveGroupStageConfig(12)).toEqual({
      numGroups: 4,
      teamsAdvancing: 1,
      teamsPerGroup: 3,
    });
    expect(deriveGroupStageConfig(15)).toEqual({
      numGroups: 4,
      teamsAdvancing: 1,
      teamsPerGroup: 4,
    });
  });

  it('16-23 teams → 4 groups, advance 2', () => {
    expect(deriveGroupStageConfig(16)).toEqual({
      numGroups: 4,
      teamsAdvancing: 2,
      teamsPerGroup: 4,
    });
    expect(deriveGroupStageConfig(23)).toEqual({
      numGroups: 4,
      teamsAdvancing: 2,
      teamsPerGroup: 6,
    });
  });

  it('24-32 teams → 8 groups', () => {
    const r24 = deriveGroupStageConfig(24);
    expect(r24.numGroups).toBe(8);
    expect(r24.teamsAdvancing).toBe(2);
    const r32 = deriveGroupStageConfig(32);
    expect(r32.numGroups).toBe(8);
    expect(r32.teamsAdvancing).toBe(2);
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
  let mockCommunitySocial: any;
  let mockVenues: any;

  const liteTournament = {
    id: 'tournament-1',
    createdBy: 'user-1',
    communityId: 'community-1',
    tournamentConfig: {
      mode: 'LITE',
      bracketType: 'SINGLE_ELIMINATION',
      registrationMode: 'OPEN',
    },
    matchType: 'DOUBLES',
    status: 'REGISTRATION_OPEN',
    categoryId: 'cat-1',
    name: 'Test Lite',
  } as any;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findCategory: jest.fn(),
      create: jest.fn(),
      findCommunityMember: jest.fn(),
      findUserProfile: jest.fn(),
      isCoOrganizer: jest.fn(),
      hasNonDeletedStagesOrMatches: jest.fn(),
      findBracket: jest.fn(),
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
      findParticipantById: jest.fn(),
      lockParticipantRoster: jest.fn(),
      unlockParticipantRoster: jest.fn(),
      findFootballEntryForParticipant: jest.fn(),
      getFootballEntryRoster: jest.fn(),
      findFootballTeamForRegistration: jest.fn(),
      updateFootballRoster: jest.fn(),
      getDivisionsByTournament: jest
        .fn()
        .mockResolvedValue([{ id: 'division-1', name: 'Division 1' }]),
    };

    mockBracketGenerator = {
      generateSingleElimination: jest.fn(),
      generateDoubleElimination: jest.fn(),
      generateRoundRobin: jest.fn(),
      generateGroupStageKnockout: jest.fn(),
    };
    mockNotifications = {
      sendNotification: jest.fn().mockResolvedValue(undefined),
    };
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
    mockCommunitySocial = {
      createTournamentBracketPost: jest
        .fn()
        .mockResolvedValue({ id: 'post-1' }),
    };
    const liveScoreGateway = {
      broadcastRegistrationUpdate: jest.fn(),
    };
    const tournamentRealtimeService = new TournamentRealtimeService(
      liveScoreGateway as unknown as LiveScoreGateway,
    );
    mockVenues = {
      findOne: jest.fn(),
      addCourt: jest.fn(),
      removeCourt: jest.fn(),
    };

    service = new TournamentsService(
      mockRepo as any,
      mockBracketGenerator as any,
      mockNotifications as any,
      mockStorage as any,
      mockRedis as any,
      mockConfig as any,
      mockCommunitySocial as any,
      new TournamentAccessService(
        mockRepo as unknown as TournamentsRepository,
      ),
      new TournamentVenueService(
        mockRepo as unknown as TournamentsRepository,
        mockVenues as unknown as VenuesService,
        new TournamentAccessService(
          mockRepo as unknown as TournamentsRepository,
        ),
      ),
      new TournamentMediaService(
        mockRepo as unknown as TournamentsRepository,
        mockStorage as unknown as StorageService,
        new TournamentAccessService(
          mockRepo as unknown as TournamentsRepository,
        ),
      ),
      new TournamentDiscoveryService(
        mockRepo as unknown as TournamentsRepository,
        mockRedis as unknown as RedisService,
        new TournamentAccessService(
          mockRepo as unknown as TournamentsRepository,
        ),
      ),
      new TournamentLifecycleService(
        mockRepo as unknown as TournamentsRepository,
        new TournamentAccessService(
          mockRepo as unknown as TournamentsRepository,
        ),
        mockNotifications as unknown as NotificationsService,
        mockCommunitySocial as unknown as CommunitySocialRepository,
        mockRedis as unknown as RedisService,
        new TournamentMediaService(
          mockRepo as unknown as TournamentsRepository,
          mockStorage as unknown as StorageService,
          new TournamentAccessService(
            mockRepo as unknown as TournamentsRepository,
          ),
        ),
        new TournamentFeePolicyService(
          mockRepo as unknown as TournamentsRepository,
        ),
      ),
      new TournamentFeePolicyService(
        mockRepo as unknown as TournamentsRepository,
      ),
      new TournamentStaffService(
        mockRepo as unknown as TournamentsRepository,
        new TournamentAccessService(
          mockRepo as unknown as TournamentsRepository,
        ),
        mockNotifications as unknown as NotificationsService,
      ),
      new TournamentRefereeService(
        mockRepo as unknown as TournamentsRepository,
        new TournamentAccessService(
          mockRepo as unknown as TournamentsRepository,
        ),
        mockNotifications as unknown as NotificationsService,
      ),
      new TournamentFollowService(
        mockRepo as unknown as TournamentsRepository,
      ),
      new TournamentResultsService(
        mockRepo as unknown as TournamentsRepository,
      ),
      new TournamentDivisionService(
        mockRepo as unknown as TournamentsRepository,
        new TournamentAccessService(
          mockRepo as unknown as TournamentsRepository,
        ),
        new TournamentFeePolicyService(
          mockRepo as unknown as TournamentsRepository,
        ),
      ),
      new TournamentParticipantAdminService(
        mockRepo as unknown as TournamentsRepository,
        new TournamentAccessService(
          mockRepo as unknown as TournamentsRepository,
        ),
        mockNotifications as unknown as NotificationsService,
      ),
      new TournamentImportService(
        mockRepo as unknown as TournamentsRepository,
        new TournamentAccessService(
          mockRepo as unknown as TournamentsRepository,
        ),
        mockNotifications as unknown as NotificationsService,
      ),
      new TournamentBracketService(
        mockRepo as unknown as TournamentsRepository,
        mockBracketGenerator as unknown as BracketGeneratorService,
        new TournamentAccessService(
          mockRepo as unknown as TournamentsRepository,
        ),
        mockRedis as unknown as RedisService,
        mockCommunitySocial as unknown as CommunitySocialRepository,
      ),
      tournamentRealtimeService,
      new TournamentRegistrationService(
        mockRepo as unknown as TournamentsRepository,
        new TournamentAccessService(
          mockRepo as unknown as TournamentsRepository,
        ),
        mockNotifications as unknown as NotificationsService,
        tournamentRealtimeService,
      ),
      new TournamentLiteService(
        mockRepo as unknown as TournamentsRepository,
        new TournamentAccessService(
          mockRepo as unknown as TournamentsRepository,
        ),
        new TournamentLifecycleService(
          mockRepo as unknown as TournamentsRepository,
          new TournamentAccessService(
            mockRepo as unknown as TournamentsRepository,
          ),
          mockNotifications as unknown as NotificationsService,
          mockCommunitySocial as unknown as CommunitySocialRepository,
          mockRedis as unknown as RedisService,
          new TournamentMediaService(
            mockRepo as unknown as TournamentsRepository,
            mockStorage as unknown as StorageService,
            new TournamentAccessService(
              mockRepo as unknown as TournamentsRepository,
            ),
          ),
          new TournamentFeePolicyService(
            mockRepo as unknown as TournamentsRepository,
          ),
        ),
        new TournamentBracketService(
          mockRepo as unknown as TournamentsRepository,
          mockBracketGenerator as unknown as BracketGeneratorService,
          new TournamentAccessService(
            mockRepo as unknown as TournamentsRepository,
          ),
          mockRedis as unknown as RedisService,
          mockCommunitySocial as unknown as CommunitySocialRepository,
        ),
        mockRedis as unknown as RedisService,
        mockCommunitySocial as unknown as CommunitySocialRepository,
        mockConfig as unknown as ConfigService,
      ),
      new TournamentFootballRosterService(
        mockRepo as unknown as TournamentsRepository,
        new TournamentAccessService(
          mockRepo as unknown as TournamentsRepository,
        ),
        mockNotifications as unknown as NotificationsService,
        tournamentRealtimeService,
      ),
    );
  });

  describe('tournament-scoped court setup', () => {
    const managedTournament = {
      ...liteTournament,
      venueId: 'venue-1',
    };
    const venue = {
      id: 'venue-1',
      name: 'Nhà thi đấu',
      locationAddress: 'Địa chỉ',
      courts: [
        {
          id: 'court-1',
          venueId: 'venue-1',
          courtName: 'Sân 1',
          status: 'AVAILABLE',
        },
      ],
    };

    it('allows a tournament co-organizer with PLAYER system role to manage its courts', async () => {
      mockRepo.findById.mockResolvedValue(managedTournament);
      mockRepo.isCoOrganizer.mockResolvedValue(true);
      mockVenues.findOne.mockResolvedValue(venue);
      mockVenues.addCourt.mockResolvedValue(venue.courts[0]);

      await expect(
        service.addTournamentCourt(
          'tournament-1',
          { courtName: 'Sân 2' } as never,
          { sub: 'co-organizer-1', roles: ['PLAYER'] } as never,
          ['PLAYER'],
        ),
      ).resolves.toEqual(venue.courts[0]);
      expect(mockVenues.addCourt).toHaveBeenCalledWith('venue-1', { courtName: 'Sân 2' });
    });

    it('rejects an unrelated player before court mutation', async () => {
      mockRepo.findById.mockResolvedValue(managedTournament);
      mockRepo.isCoOrganizer.mockResolvedValue(false);
      mockRepo.findCommunityMember.mockResolvedValue(null);

      await expect(
        service.addTournamentCourt(
          'tournament-1',
          { courtName: 'Sân lạ' } as never,
          { sub: 'player-2', roles: ['PLAYER'] } as never,
          ['PLAYER'],
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockVenues.addCourt).not.toHaveBeenCalled();
    });

    it('rejects removing a court not contained in the tournament venue', async () => {
      mockRepo.findById.mockResolvedValue(managedTournament);
      mockRepo.isCoOrganizer.mockResolvedValue(true);
      mockVenues.findOne.mockResolvedValue(venue);

      await expect(
        service.removeTournamentCourt(
          'tournament-1',
          'court-from-another-venue',
          { sub: 'co-organizer-1', roles: ['PLAYER'] } as never,
          ['PLAYER'],
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockVenues.removeCourt).not.toHaveBeenCalled();
    });
  });

  describe('Lite participant access contract', () => {
    const visibleParticipants = ['participant-1'];

    it('rejects a non-Lite singles tournament', async () => {
      mockRepo.findById.mockResolvedValue({
        ...liteTournament,
        tournamentConfig: { mode: 'ADVANCED' },
        matchType: 'SINGLES',
      });

      await expect(
        service.getLiteParticipants('tournament-1', 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepo.findLiteParticipantsWithRosters).not.toHaveBeenCalled();
    });

    it('returns participant data for an authorized standard doubles manager', async () => {
      mockRepo.findById.mockResolvedValue({
        ...liteTournament,
        tournamentConfig: { mode: 'ADVANCED' },
        matchType: 'DOUBLES',
      });
      mockRepo.findLiteParticipantsWithRosters.mockResolvedValue(
        visibleParticipants,
      );

      await expect(
        service.getLiteParticipants('tournament-1', 'user-1'),
      ).resolves.toEqual(visibleParticipants);
    });

    it('returns participant data to the tournament creator', async () => {
      mockRepo.findById.mockResolvedValue(liteTournament);
      mockRepo.findLiteParticipantsWithRosters.mockResolvedValue(
        visibleParticipants,
      );

      await expect(
        service.getLiteParticipants('tournament-1', 'user-1'),
      ).resolves.toEqual(visibleParticipants);
    });

    it('returns participant data to an ADMIN', async () => {
      mockRepo.findById.mockResolvedValue(liteTournament);
      mockRepo.findLiteParticipantsWithRosters.mockResolvedValue(
        visibleParticipants,
      );

      await expect(
        service.getLiteParticipants('tournament-1', 'other-user', ['ADMIN']),
      ).resolves.toEqual(visibleParticipants);
    });

    it('returns participant data to a joined community owner', async () => {
      mockRepo.findById.mockResolvedValue(liteTournament);
      mockRepo.findCommunityMember.mockResolvedValue({
        role: 'OWNER',
        status: 'JOINED',
      });
      mockRepo.findLiteParticipantsWithRosters.mockResolvedValue(
        visibleParticipants,
      );

      await expect(
        service.getLiteParticipants('tournament-1', 'other-user'),
      ).resolves.toEqual(visibleParticipants);
    });

    it('does not reveal participants to a non-member', async () => {
      mockRepo.findById.mockResolvedValue(liteTournament);
      mockRepo.findCommunityMember.mockResolvedValue(null);

      await expect(
        service.getLiteParticipants('tournament-1', 'other-user'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockRepo.findLiteParticipantsWithRosters).not.toHaveBeenCalled();
    });
  });

  describe('doubles pairing policy', () => {
    const createTournament = (
      tournamentConfig: Record<string, unknown>,
    ): CreateTournamentDto => ({
      tournamentType: 'PUBLIC',
      name: 'Doubles event',
      categoryId: '00000000-0000-4000-8000-000000000001',
      matchType: 'DOUBLES',
      genderRestriction: 'MALE',
      tournamentConfig,
    });

    beforeEach(() => {
      mockRepo.findCategory.mockResolvedValue({
        name: 'Tennis',
        slug: 'tennis',
        categoryConfig: { supportedMatchTypes: ['DOUBLES'] },
      });
      mockRepo.create.mockImplementation(
        async (_userId: string, dto: CreateTournamentDto) => ({
          id: 'created-tournament',
          ...dto,
        }),
      );
    });

    it('persists the organizer pairing default for doubles', async () => {
      await service.create('admin-1', createTournament({}), ['ADMIN']);

      expect(mockRepo.create).toHaveBeenCalledWith(
        'admin-1',
        expect.objectContaining({
          tournamentConfig: { doublesPairingMode: 'ORGANIZER' },
        }),
      );
    });

    it('preserves explicit self pairing for doubles', async () => {
      await service.create(
        'admin-1',
        createTournament({ doublesPairingMode: 'SELF' }),
        ['ADMIN'],
      );

      expect(mockRepo.create).toHaveBeenCalledWith(
        'admin-1',
        expect.objectContaining({
          tournamentConfig: { doublesPairingMode: 'SELF' },
        }),
      );
    });
  });

  describe('addLiteClubMember', () => {
    it('keeps the selected JOINED member as the roster leader', async () => {
      mockRepo.findById!.mockResolvedValue(liteTournament);
      mockRepo.findCommunityMember!
        .mockResolvedValueOnce({ role: 'MODERATOR', status: 'JOINED' })
        .mockResolvedValueOnce({ role: 'MEMBER', status: 'JOINED' });
      mockRepo.findUserProfile!.mockResolvedValue({
        fullName: 'Thành viên CLB',
      });
      const registerSpy = jest
        .spyOn(service, 'register')
        .mockResolvedValue({ participant: { id: 'participant-1' } } as any);

      await service.addLiteClubMember(
        'tournament-1',
        'member-1',
        'moderator-1',
      );

      expect(registerSpy).toHaveBeenCalledWith(
        'tournament-1',
        'member-1',
        {
          teamName: 'Thành viên CLB',
          rankingConsent: false,
        },
        undefined,
        'moderator-1',
      );
    });

    it('rejects a member who left the club before registration', async () => {
      mockRepo.findById!.mockResolvedValue(liteTournament);
      mockRepo.findCommunityMember!
        .mockResolvedValueOnce({ role: 'MODERATOR', status: 'JOINED' })
        .mockResolvedValueOnce({ role: 'MEMBER', status: 'LEFT' });
      const registerSpy = jest.spyOn(service, 'register');

      await expect(
        service.addLiteClubMember(
          'tournament-1',
          'former-member-1',
          'moderator-1',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(registerSpy).not.toHaveBeenCalled();
    });
  });

  describe('football registration manager matrix', () => {
    const tournament = {
      id: 'tournament-1',
      createdBy: 'creator-1',
      communityId: 'community-1',
    };

    it.each([
      ['creator', 'creator-1', [], null, false],
      ['admin', 'other-user', ['ADMIN'], null, false],
      ['co-organizer', 'other-user', [], null, true],
      [
        'community owner',
        'other-user',
        [],
        { role: 'OWNER', status: 'JOINED' },
        false,
      ],
      [
        'community moderator',
        'other-user',
        [],
        { role: 'MODERATOR', status: 'JOINED' },
        false,
      ],
    ])(
      'allows %s to manage registration',
      async (_label, userId, roles, member, coOrganizer) => {
        mockRepo.isCoOrganizer.mockResolvedValue(coOrganizer);
        mockRepo.findCommunityMember.mockResolvedValue(member);

        await expect(
          (service as any).isManager(tournament, userId, roles),
        ).resolves.toBe(true);
      },
    );

    it.each([
      ['global organizer', 'other-user', ['ORGANIZER'], null, false],
      [
        'community player',
        'other-user',
        [],
        { role: 'PLAYER', status: 'JOINED' },
        false,
      ],
      [
        'pending community member',
        'other-user',
        [],
        { role: 'OWNER', status: 'PENDING' },
        false,
      ],
      ['unrelated user', 'other-user', [], null, false],
    ])(
      'rejects %s from managing registration',
      async (_label, userId, roles, member, coOrganizer) => {
        mockRepo.isCoOrganizer.mockResolvedValue(coOrganizer);
        mockRepo.findCommunityMember.mockResolvedValue(member);

        await expect(
          (service as any).isManager(tournament, userId, roles),
        ).resolves.toBe(false);
      },
    );
  });

  describe('football roster lock contract', () => {
    const tournament = {
      id: 'tournament-1',
      createdBy: 'creator-1',
      communityId: null,
      status: 'REGISTRATION_CLOSED',
    };
    const participant = {
      id: 'participant-1',
      tournamentId: 'tournament-1',
      tournamentDivisionId: 'division-1',
      footballTeamId: 'team-1',
    };

    it('locks a football participant only through the manager boundary and broadcasts the change', async () => {
      mockRepo.findById.mockResolvedValue(tournament);
      mockRepo.findParticipantById.mockResolvedValue(participant);
      mockRepo.lockParticipantRoster.mockResolvedValue({
        ...participant,
        rosterLockedAt: new Date(),
      });

      await expect(
        (service as any).lockParticipantRoster(
          'tournament-1',
          'participant-1',
          'creator-1',
          [],
        ),
      ).resolves.toEqual(expect.objectContaining({ id: 'participant-1' }));
      expect(mockRepo.lockParticipantRoster).toHaveBeenCalledWith(
        'participant-1',
        'creator-1',
      );
    });

    it('rejects a global organizer without tournament scope', async () => {
      mockRepo.findById.mockResolvedValue(tournament);
      mockRepo.findParticipantById.mockResolvedValue(participant);

      await expect(
        (service as any).lockParticipantRoster(
          'tournament-1',
          'participant-1',
          'other-user',
          ['ORGANIZER'],
        ),
      ).rejects.toThrow();
      expect(mockRepo.lockParticipantRoster).not.toHaveBeenCalled();
    });

    it('rejects roster edits for withdrawn or otherwise terminal registrations', async () => {
      mockRepo.findById.mockResolvedValue(tournament);
      mockRepo.findParticipantById.mockResolvedValue({
        ...participant,
        teamStatus: 'WITHDRAWN',
      });
      mockRepo.findFootballEntryForParticipant.mockResolvedValue({
        entry: { id: 'entry-1', status: 'DRAFT' },
      });

      await expect(
        (service as any).updateFootballRoster(
          'tournament-1',
          'participant-1',
          { memberIds: ['player-1'] },
          'creator-1',
          [],
        ),
      ).rejects.toThrow('đã kết thúc hoặc không còn hiệu lực');
      expect(mockRepo.updateFootballRoster).not.toHaveBeenCalled();
    });

    it('notifies only members newly moved to pending confirmation after a roster update', async () => {
      mockRepo.findById.mockResolvedValue({
        ...tournament,
        createdBy: 'creator-1',
        name: 'Football Cup',
      });
      mockRepo.findParticipantById.mockResolvedValue({
        ...participant,
        teamStatus: 'COMPLETE',
      });
      mockRepo.findFootballEntryForParticipant.mockResolvedValue({
        entry: { id: 'entry-1', status: 'PENDING_CONFIRMATION' },
      });
      mockRepo.getFootballEntryRoster.mockResolvedValue([
        { userId: 'already-pending', confirmationStatus: 'PENDING' },
        { userId: 'already-confirmed', confirmationStatus: 'CONFIRMED' },
      ]);
      mockRepo.updateFootballRoster.mockResolvedValue({
        roster: [
          { userId: 'already-pending', confirmationStatus: 'PENDING' },
          { userId: 'new-member', confirmationStatus: 'PENDING' },
          { userId: 'creator-1', confirmationStatus: 'CONFIRMED' },
        ],
      });

      await expect(
        (service as any).updateFootballRoster(
          'tournament-1',
          'participant-1',
          { memberIds: ['already-pending', 'new-member', 'creator-1'] },
          'creator-1',
          [],
        ),
      ).resolves.toEqual(
        expect.objectContaining({ roster: expect.any(Array) }),
      );

      expect(mockNotifications.sendNotification).toHaveBeenCalledTimes(1);
      expect(mockNotifications.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          receiverId: 'new-member',
          redirectUrl:
            '/tournaments/tournament-1?tab=teams&divisionId=division-1&participantId=participant-1',
        }),
      );
    });

    it('does not allow roster edits after the entry is locked', async () => {
      mockRepo.findById.mockResolvedValue({
        ...tournament,
        status: 'REGISTRATION_OPEN',
      });
      mockRepo.findParticipantById.mockResolvedValue(participant);
      mockRepo.findFootballEntryForParticipant.mockResolvedValue({
        entry: { id: 'entry-1', status: 'LOCKED' },
      });

      await expect(
        (service as any).updateFootballRoster(
          'tournament-1',
          'participant-1',
          { memberIds: ['player-1'] },
          'creator-1',
          [],
        ),
      ).rejects.toThrow('Roster đã khóa');
      expect(mockRepo.updateFootballRoster).not.toHaveBeenCalled();
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
      mockRepo.update!.mockImplementation(
        async (_id, _userId, dto) =>
          ({
            ...inProgressTournament,
            ...dto,
          }) as any,
      );
    });

    it('allows hiding public banner text while preserving tournament configuration', async () => {
      await service.update('tournament-1', 'user-1', {
        tournamentConfig: { hideFeaturedCardText: true },
      } as any);

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
        service.update('tournament-1', 'user-1', {
          tournamentConfig: { registrationMode: 'APPROVAL' },
        } as any),
      ).rejects.toThrow(BadRequestException);

      expect(mockRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('pairLiteParticipants', () => {
    it('rejects singles tournament', async () => {
      mockRepo.findById!.mockResolvedValue({
        ...liteTournament,
        matchType: 'SINGLES',
      });
      await expect(
        service.pairLiteParticipants('tournament-1', 'user-1', [], {
          participant1Id: 'p1',
          participant2Id: 'p2',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows pairing even when bracket exists', async () => {
      mockRepo.findById!.mockResolvedValue(liteTournament);
      mockRepo.findCommunityMember!.mockResolvedValue(null);
      mockRepo.findLeaderByParticipantId!.mockResolvedValue({
        userId: 'leader-1',
        role: 'MAIN',
        id: 'leader-1',
        joinedAt: new Date(),
      });
      mockRepo.findUserBasicById!.mockResolvedValue({
        id: 'leader-1',
        fullName: 'Player One',
        email: 'p1@test.com',
      });
      mockRepo.lockTournamentAndPair!.mockResolvedValue({
        id: 'p1',
        teamStatus: 'COMPLETE',
      });
      const result = await service.pairLiteParticipants(
        'tournament-1',
        'user-1',
        ['ADMIN'],
        {
          participant1Id: 'p1',
          participant2Id: 'p2',
        },
      );
      expect(result).toEqual({ id: 'p1', teamStatus: 'COMPLETE' });
    });

    it('calls lockTournamentAndPair for valid doubles', async () => {
      mockRepo.findById!.mockResolvedValue(liteTournament);
      mockRepo.hasNonDeletedStagesOrMatches!.mockResolvedValue(false);
      mockRepo.findLeaderByParticipantId!.mockResolvedValue({
        userId: 'leader-1',
        role: 'MAIN',
        id: 'leader-1',
        joinedAt: new Date(),
      });
      mockRepo.findUserBasicById!.mockResolvedValue({
        id: 'leader-1',
        fullName: 'Player One',
        email: 'p1@test.com',
      });
      mockRepo.lockTournamentAndPair!.mockResolvedValue({
        id: 'p1',
        teamStatus: 'COMPLETE',
      });
      const result = await service.pairLiteParticipants(
        'tournament-1',
        'user-1',
        ['ADMIN'],
        {
          participant1Id: 'p1',
          participant2Id: 'p2',
        },
      );
      expect(mockRepo.lockTournamentAndPair).toHaveBeenCalled();
      expect(result).toEqual({ id: 'p1', teamStatus: 'COMPLETE' });
    });
  });

  describe('generateLiteBracket', () => {
    it('blocks recreating a completed Lite tournament bracket', async () => {
      mockRepo.findById!.mockResolvedValue({
        ...liteTournament,
        status: 'COMPLETED',
      });

      await expect(
        service.generateLiteBracket('tournament-1', 'user-1', ['ADMIN']),
      ).rejects.toThrow('Giải đấu đã kết thúc');
      expect(mockRepo.findBracket).not.toHaveBeenCalled();
      expect(mockBracketGenerator.generateSingleElimination).not.toHaveBeenCalled();
    });

    it('blocks recreating a live Lite tournament bracket', async () => {
      mockRepo.findById!.mockResolvedValue({
        ...liteTournament,
        status: 'IN_PROGRESS',
      });

      await expect(
        service.generateLiteBracket('tournament-1', 'user-1', ['ADMIN']),
      ).rejects.toThrow('Giải đấu đang diễn ra');
      expect(mockRepo.findBracket).not.toHaveBeenCalled();
      expect(mockBracketGenerator.generateSingleElimination).not.toHaveBeenCalled();
    });

    it('passes divisionId to the generator for a newly created bracket', async () => {
      mockRepo.findById!.mockResolvedValue({
        ...liteTournament,
        tournamentType: 'CLUB',
        matchType: 'SINGLES',
      });
      mockBracketGenerator.generateSingleElimination.mockResolvedValue({
        stageId: 'stage-1',
        totalMatches: 8,
      });

      await service.generateLiteBracket(
        'tournament-1',
        'user-1',
        ['ADMIN'],
        'division-1',
      );

      expect(
        mockBracketGenerator.generateSingleElimination,
      ).toHaveBeenCalledWith('tournament-1', 'user-1', 'division-1', 'RANDOM');
      expect(
        mockCommunitySocial.createTournamentBracketPost,
      ).toHaveBeenCalledWith(
        'community-1',
        'user-1',
        'tournament-1',
        'Test Lite',
        'Division 1',
        expect.stringContaining('division-1:stage-1'),
      );
    });

    it('uses the division-scoped bracket when checking a reset', async () => {
      mockRepo.findById!.mockResolvedValue({
        ...liteTournament,
        matchType: 'SINGLES',
      });
      mockRepo.findBracket!.mockResolvedValue({ stages: [] });
      mockBracketGenerator.generateSingleElimination.mockResolvedValue({
        stageId: 'stage-2',
        totalMatches: 8,
      });

      await service.generateLiteBracket(
        'tournament-1',
        'user-1',
        ['ADMIN'],
        'division-1',
        true,
      );

      expect(mockRepo.findBracket).toHaveBeenCalledWith(
        'tournament-1',
        'division-1',
      );
      expect(
        mockBracketGenerator.generateSingleElimination,
      ).toHaveBeenCalledWith('tournament-1', 'user-1', 'division-1', 'RANDOM');
    });

    it('blocks reset after a bracket match has started', async () => {
      mockRepo.findById!.mockResolvedValue({
        ...liteTournament,
        matchType: 'SINGLES',
      });
      mockRepo.findBracket!.mockResolvedValue({
        stages: [
          {
            groups: [
              {
                matches: [{ status: 'IN_PROGRESS' }],
              },
            ],
          },
        ],
      });

      await expect(
        service.generateLiteBracket(
          'tournament-1',
          'user-1',
          ['ADMIN'],
          'division-1',
          true,
        ),
      ).rejects.toThrow('Không thể reset bracket sau khi đã bắt đầu');
      expect(
        mockBracketGenerator.generateSingleElimination,
      ).not.toHaveBeenCalled();
    });
  });

  describe('generateLitePairs', () => {
    it('rejects singles', async () => {
      mockRepo.findById!.mockResolvedValue({
        ...liteTournament,
        matchType: 'SINGLES',
      });
      await expect(
        service.generateLitePairs('tournament-1', 'user-1', [], {
          strategy: 'RANDOM',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('calls generateLitePairsTx with valid input (tx is authoritative)', async () => {
      mockRepo.findById!.mockResolvedValue(liteTournament);
      mockRepo.hasNonDeletedStagesOrMatches!.mockResolvedValue(false);
      mockRepo.generateLitePairsTx!.mockResolvedValue({
        message: 'Đã ghép 1 cặp thành công.',
        paired: [
          { participant1Id: 'p1', participant2Id: 'p2', teamName: 'P1 / P2' },
        ],
        unpairedParticipantIds: [],
        strategy: 'RANDOM',
      });
      const result = await service.generateLitePairs(
        'tournament-1',
        'user-1',
        ['ADMIN'],
        { strategy: 'RANDOM' },
      );
      expect(mockRepo.generateLitePairsTx).toHaveBeenCalled();
      expect(result.paired).toHaveLength(1);
    });
  });

  describe('unpairLiteParticipant', () => {
    it('allows unpairing even when bracket exists (bracket retains slot until regenerated)', async () => {
      mockRepo.findById!.mockResolvedValue(liteTournament);
      mockRepo.findCommunityMember!.mockResolvedValue(null);
      mockRepo.hasNonDeletedStagesOrMatches!.mockResolvedValue(true);
      mockRepo.lockTournamentAndUnpair!.mockResolvedValue({
        leader: { id: 'original', teamStatus: 'PENDING_PARTNER' },
        partner: { id: 'new', teamStatus: 'PENDING_PARTNER' },
      });
      const result = await (service as any).unpairLiteParticipant(
        'tournament-1',
        'paired-p1',
        'user-1',
        ['ADMIN'],
      );
      expect(mockRepo.lockTournamentAndUnpair).toHaveBeenCalledWith(
        'tournament-1',
        'paired-p1',
        'user-1',
      );
      expect(result.leader.teamStatus).toBe('PENDING_PARTNER');
    });

    it('calls lockTournamentAndUnpair for valid request', async () => {
      mockRepo.findById!.mockResolvedValue(liteTournament);
      mockRepo.hasNonDeletedStagesOrMatches!.mockResolvedValue(false);
      mockRepo.lockTournamentAndUnpair!.mockResolvedValue({
        leader: { id: 'original', teamStatus: 'PENDING_PARTNER' },
        partner: { id: 'new', teamStatus: 'PENDING_PARTNER' },
      });
      const result = await (service as any).unpairLiteParticipant(
        'tournament-1',
        'paired-p1',
        'user-1',
        ['ADMIN'],
      );
      expect(mockRepo.lockTournamentAndUnpair).toHaveBeenCalledWith(
        'tournament-1',
        'paired-p1',
        'user-1',
      );
      expect(result.leader.teamStatus).toBe('PENDING_PARTNER');
    });
  });
});

