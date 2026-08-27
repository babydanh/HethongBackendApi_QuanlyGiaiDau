import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MatchesService } from './matches.service';

describe('MatchesService object-level football authority', () => {
  const repository = {
    findById: jest.fn(),
    isTournamentManager: jest.fn(),
    isRefereeAccepted: jest.fn(),
    findAllowedCourtForMatch: jest.fn(),
    getRostersForParticipants: jest.fn(),
    updateSchedule: jest.fn(),
    updateScore: jest.fn(),
    updateRefereeId: jest.fn(),
    updateStatus: jest.fn(),
  };
  const gateway = {
    broadcastScoreUpdate: jest.fn(),
    broadcastMatchStatus: jest.fn(),
  };
  const rankings = {};
  const notifications = {};
  const redis = {
    hset: jest.fn(),
    getClient: jest.fn(() => ({ expire: jest.fn() })),
    delByPattern: jest.fn(),
  };
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
    p1SetsWon: 0,
    p2SetsWon: 0,
    revision: 1,
    stageId: 'stage-1',
    tournament: { createdBy: 'owner-1', sportRules: null },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findById.mockResolvedValue({ ...baseMatch });
    repository.isTournamentManager.mockResolvedValue(false);
    repository.isRefereeAccepted.mockResolvedValue(false);
    repository.findAllowedCourtForMatch.mockResolvedValue({
      id: 'court-1',
      courtName: 'Sân 1',
      courtAddress: 'Địa chỉ sân',
    });
    repository.getRostersForParticipants.mockResolvedValue([]);
    repository.updateSchedule.mockResolvedValue({
      ...baseMatch,
      courtId: 'court-1',
      courtName: 'Sân 1',
      courtAddress: 'Địa chỉ sân',
    });
    repository.updateScore.mockResolvedValue({ ...baseMatch, p1SetsWon: 1 });
    repository.updateRefereeId.mockResolvedValue({
      ...baseMatch,
      refereeId: 'ref-1',
    });
    repository.updateStatus.mockResolvedValue({
      ...baseMatch,
      status: 'ONGOING',
    });
  });

  it('allows an accepted player-referee assigned to the match to enter score', async () => {
    repository.findById.mockResolvedValue({ ...baseMatch, refereeId: 'ref-1' });

    await expect(
      service.updateScore(
        'match-1',
        { sub: 'ref-1', roles: ['PLAYER'] } as never,
        { p1SetsWon: 1, p2SetsWon: 0 } as never,
      ),
    ).resolves.toBeDefined();
    expect(repository.updateScore).toHaveBeenCalled();
  });

  it('allows a co-organizer scoped to this tournament to enter score', async () => {
    repository.isTournamentManager.mockResolvedValue(true);

    await expect(
      service.updateScore(
        'match-1',
        { sub: 'co-organizer-1', roles: ['PLAYER'] } as never,
        { p1SetsWon: 1, p2SetsWon: 0 } as never,
      ),
    ).resolves.toBeDefined();
  });

  it('rejects a global organizer who is not assigned to this tournament', async () => {
    await expect(
      service.updateScore(
        'match-1',
        { sub: 'other-organizer', roles: ['ORGANIZER'] } as never,
        { p1SetsWon: 1, p2SetsWon: 0 } as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.updateScore).not.toHaveBeenCalled();
  });

  it('allows a tournament-scoped PLAYER co-organizer to assign an available court', async () => {
    repository.isTournamentManager.mockResolvedValue(true);

    await expect(
      service.updateSchedule(
        'match-1',
        { sub: 'co-organizer-1', roles: ['PLAYER'] } as never,
        { courtId: 'court-1' },
      ),
    ).resolves.toBeDefined();

    expect(repository.findAllowedCourtForMatch).toHaveBeenCalledWith(
      expect.objectContaining({ tournamentId: 'tournament-1' }),
      'court-1',
    );
    expect(repository.updateSchedule).toHaveBeenCalledWith(
      'match-1',
      'co-organizer-1',
      expect.objectContaining({ courtId: 'court-1' }),
    );
  });

  it('rejects a cross-tournament or disabled court before persistence', async () => {
    repository.isTournamentManager.mockResolvedValue(true);
    repository.findAllowedCourtForMatch.mockResolvedValue(null);

    await expect(
      service.updateSchedule(
        'match-1',
        { sub: 'co-organizer-1', roles: ['PLAYER'] } as never,
        { courtId: 'court-foreign-or-disabled' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.updateSchedule).not.toHaveBeenCalled();
  });

  it('saves an accepted unassigned referee who starts the scheduled match', async () => {
    repository.findById.mockResolvedValue({
      ...baseMatch,
      status: 'SCHEDULED',
    });
    repository.isRefereeAccepted.mockResolvedValue(true);

    await expect(
      service.updateStatus(
        'match-1',
        { sub: 'ref-1', roles: ['PLAYER'] } as never,
        { status: 'ONGOING' } as never,
      ),
    ).resolves.toBeDefined();
    expect(repository.updateRefereeId).toHaveBeenCalledWith(
      'match-1',
      'ref-1',
      'ref-1',
    );
  });
});
