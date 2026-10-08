import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MatchesService } from './matches.service';

describe('MatchesService scoreboard visibility', () => {
  const repository = {
    findById: jest.fn(),
    isTournamentManager: jest.fn(),
    isRefereeAccepted: jest.fn(),
    setScoreboardVisibility: jest.fn(),
    canAccessLiveMatch: jest.fn(),
  };
  const gateway = {
    broadcastScoreboardVisibility: jest.fn(),
  };
  const rankings = {};
  const notifications = {};
  const redis = { hgetall: jest.fn(), hset: jest.fn(), getClient: jest.fn() };
  // `matchContextAdapter` is omitted on purpose: `this.matchContextAdapter?.resolve`
  // then yields undefined, so every case exercises the tournament path.
  const service = new MatchesService(
    repository as never,
    gateway as never,
    rankings as never,
    notifications as never,
    redis as never,
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
    repository.isTournamentManager.mockResolvedValue(false);
    repository.isRefereeAccepted.mockResolvedValue(false);
    repository.canAccessLiveMatch.mockResolvedValue(true);
  });

  it('lets a tournament manager hide the scoreboard and broadcasts it', async () => {
    repository.setScoreboardVisibility.mockResolvedValue({
      ...baseMatch,
      scoreboardVisible: false,
    });

    const result = await service.setScoreboardVisibility('match-1', manager, {
      visible: false,
    });

    expect(repository.setScoreboardVisibility).toHaveBeenCalledWith(
      'match-1',
      false,
    );
    expect(gateway.broadcastScoreboardVisibility).toHaveBeenCalledWith(
      'match-1',
      false,
    );
    expect(result).toMatchObject({ scoreboardVisible: false });
  });

  it('rejects a viewer who cannot score the match', async () => {
    const viewer = { sub: 'stranger-9', roles: ['PLAYER'] } as never;

    await expect(
      service.setScoreboardVisibility('match-1', viewer, { visible: false }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repository.setScoreboardVisibility).not.toHaveBeenCalled();
    expect(gateway.broadcastScoreboardVisibility).not.toHaveBeenCalled();
  });

  it('throws NotFound when the match does not exist', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(
      service.setScoreboardVisibility('missing', manager, { visible: true }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
