import { ForbiddenException } from '@nestjs/common';
import { ClubMatchSessionsService } from './club-match-sessions.service';

describe('ClubMatchSessionsService overlay visibility (standalone)', () => {
  const db = { update: jest.fn() };
  const repository = {
    findMatch: jest.fn(),
    findStandaloneMatch: jest.fn(),
    findCommunityContext: jest.fn(),
    findMembership: jest.fn(),
    getDb: jest.fn(),
  };
  const gateway = { broadcastOverlayVisibility: jest.fn() };
  const processor = {
    dispatchNow: jest.fn(),
    setClubMatchUpdatePublisher: jest.fn(),
  };
  const rankingsService = {};
  const tournamentsService = { createLite: jest.fn(), remove: jest.fn() };
  let service: ClubMatchSessionsService;

  const standaloneMatch = { id: 'match-1', communityId: 'community-1' };
  const member = { id: 'member-1', roles: [] };

  // Chuỗi `db.update(...).set(...).where(...).returning()` trả về một dòng.
  const stubUpdate = (row: Record<string, unknown>) => {
    const returning = jest.fn().mockResolvedValue([row]);
    const where = jest.fn(() => ({ returning }));
    const set = jest.fn(() => ({ where }));
    db.update.mockReturnValue({ set });
    return set;
  };

  beforeEach(() => {
    jest.resetAllMocks();
    repository.getDb.mockReturnValue(db);
    repository.findMatch.mockResolvedValue(null);
    repository.findStandaloneMatch.mockResolvedValue(standaloneMatch);
    service = new ClubMatchSessionsService(
      repository as never,
      gateway as never,
      processor as never,
      rankingsService as never,
      tournamentsService as never,
    );
  });

  it('rejects a joined member whose club disabled match scoring', async () => {
    repository.findCommunityContext.mockResolvedValue({
      status: 'ACTIVE',
      memberStatus: 'JOINED',
      memberRole: 'MEMBER',
      memberMatchScoringEnabled: false,
    });
    repository.findMembership.mockResolvedValue({
      status: 'JOINED',
      role: 'MEMBER',
    });

    await expect(
      service.setOverlayVisibility('match-1', member, 'H2H', true),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(db.update).not.toHaveBeenCalled();
    expect(gateway.broadcastOverlayVisibility).not.toHaveBeenCalled();
  });

  it('lets a club owner turn BRACKET on, clearing H2H, and broadcasts exactly the two flags to the match room', async () => {
    repository.findCommunityContext.mockResolvedValue({
      status: 'ACTIVE',
      memberStatus: 'JOINED',
      memberRole: 'OWNER',
      memberMatchScoringEnabled: false,
    });
    repository.findMembership.mockResolvedValue({
      status: 'JOINED',
      role: 'OWNER',
    });
    const set = stubUpdate({
      id: 'match-1',
      communityId: 'community-1',
      h2hOverlayVisible: false,
      bracketOverlayVisible: true,
    });

    const result = await service.setOverlayVisibility(
      'match-1',
      { id: 'owner-1', roles: [] },
      'BRACKET',
      true,
    );

    expect(set).toHaveBeenCalledWith({
      bracketOverlayVisible: true,
      h2hOverlayVisible: false,
      updatedAt: expect.any(Date),
    });
    expect(gateway.broadcastOverlayVisibility).toHaveBeenCalledWith(
      'match-1',
      { h2hOverlayVisible: false, bracketOverlayVisible: true },
    );
    expect(result).toEqual({
      id: 'match-1',
      matchId: 'match-1',
      h2hOverlayVisible: false,
      bracketOverlayVisible: true,
    });
  });
});
