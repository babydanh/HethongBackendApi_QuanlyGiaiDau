import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { TournamentAccessService } from '../tournaments/services/tournament-access.service';

describe('MatchesService overlay visibility', () => {
  const repository = {
    findById: jest.fn(),
    isRefereeAccepted: jest.fn(),
    setOverlayVisibility: jest.fn(),
    canAccessLiveMatch: jest.fn(),
  };
  const gateway = {
    broadcastOverlayVisibility: jest.fn(),
  };
  const rankings = {};
  const notifications = {};
  const redis = { hgetall: jest.fn(), hset: jest.fn(), getClient: jest.fn() };
  const tournamentsRepository = {
    isCoOrganizer: jest.fn().mockResolvedValue(false),
    findCommunityById: jest.fn().mockResolvedValue(null),
    findCommunityMember: jest.fn().mockResolvedValue(null),
  };
  const tournamentAccess = new TournamentAccessService(
    tournamentsRepository as never,
  );
  // `matchContextAdapter` is omitted on purpose: every case runs the tournament path.
  const service = new MatchesService(
    repository as never,
    gateway as never,
    rankings as never,
    notifications as never,
    redis as never,
    tournamentAccess as never,
  );

  const baseMatch = {
    id: 'match-1',
    tournamentId: 'tournament-1',
    status: 'ONGOING',
    participant1Id: 'p1',
    participant2Id: 'p2',
    refereeId: null,
    scoreDetails: null,
    scoreboardVisible: true,
    h2hOverlayVisible: false,
    bracketOverlayVisible: false,
    p1SetsWon: 0,
    p2SetsWon: 0,
    revision: 1,
    stageId: 'stage-1',
    tournament: { createdBy: 'owner-1', sportRules: null },
  };
  const manager = { sub: 'owner-1', roles: [], role: undefined } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findById.mockResolvedValue({ ...baseMatch });
    tournamentsRepository.isCoOrganizer.mockResolvedValue(false);
    repository.isRefereeAccepted.mockResolvedValue(false);
    repository.canAccessLiveMatch.mockResolvedValue(true);
  });

  it('lets a manager turn H2H on, clears BRACKET, and broadcasts both flags once', async () => {
    repository.setOverlayVisibility.mockResolvedValue({
      ...baseMatch,
      h2hOverlayVisible: true,
      bracketOverlayVisible: false,
    });

    const result = await service.setOverlayVisibility('match-1', manager, {
      kind: 'H2H',
      visible: true,
    });

    expect(repository.setOverlayVisibility).toHaveBeenCalledWith(
      'match-1',
      'H2H',
      true,
    );
    expect(gateway.broadcastOverlayVisibility).toHaveBeenCalledTimes(1);
    expect(gateway.broadcastOverlayVisibility).toHaveBeenCalledWith('match-1', {
      h2hOverlayVisible: true,
      bracketOverlayVisible: false,
    });
    expect(result).toEqual({
      id: 'match-1',
      matchId: 'match-1',
      h2hOverlayVisible: true,
      bracketOverlayVisible: false,
    });
  });

  it('keeps the BRACKET flag the referee left on when H2H is turned off', async () => {
    repository.setOverlayVisibility.mockResolvedValue({
      ...baseMatch,
      h2hOverlayVisible: false,
      bracketOverlayVisible: true,
    });

    await service.setOverlayVisibility('match-1', manager, {
      kind: 'H2H',
      visible: false,
    });

    // Tắt H2H không được làm rơi cờ BRACKET: payload luôn mang đủ trạng thái.
    expect(gateway.broadcastOverlayVisibility).toHaveBeenCalledWith('match-1', {
      h2hOverlayVisible: false,
      bracketOverlayVisible: true,
    });
  });

  it('rejects a viewer who cannot score and writes nothing', async () => {
    const viewer = { sub: 'stranger-9', roles: ['PLAYER'] } as never;

    await expect(
      service.setOverlayVisibility('match-1', viewer, {
        kind: 'BRACKET',
        visible: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repository.setOverlayVisibility).not.toHaveBeenCalled();
    expect(gateway.broadcastOverlayVisibility).not.toHaveBeenCalled();
  });

  it('throws NotFound when the match does not exist and writes nothing', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(
      service.setOverlayVisibility('missing', manager, {
        kind: 'H2H',
        visible: true,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(repository.setOverlayVisibility).not.toHaveBeenCalled();
    expect(gateway.broadcastOverlayVisibility).not.toHaveBeenCalled();
  });
});
