import { ClubMatchSessionsRepository } from './club-match-sessions.repository';

describe('ClubMatchSessionsRepository standalone playback projection', () => {
  it('never returns standalone playback settings from the activity projection', async () => {
    const context = {
      communityName: 'Riverside Club',
      categoryName: 'Pickleball',
      categorySlug: 'pickleball',
      categoryConfig: {},
    };
    const query = {
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([context]),
    };
    const repository = new ClubMatchSessionsRepository(
      { select: jest.fn().mockReturnValue(query) } as never,
      {} as never,
    );
    const match = {
      id: 'match-1',
      communityId: 'community-1',
      categoryId: 'category-1',
      sideAUserIds: [],
      sideBUserIds: [],
      matchType: 'SINGLES',
      status: 'ONGOING',
      scoreDetails: {},
      scoreConfig: null,
      p1SetsWon: 1,
      p2SetsWon: 0,
      winnerSide: 'A',
      scheduledAt: null,
      playbackUrl: 'https://media.example/private.m3u8',
      cameraName: 'Private camera name',
    };
    jest.spyOn(repository, 'findStandaloneMatch').mockResolvedValue(match as never);

    const projection = await repository.projectStandaloneMatch('match-1');

    expect(projection).not.toHaveProperty('playbackUrl');
    expect(projection).not.toHaveProperty('cameraName');
    expect(projection).toMatchObject({ id: 'match-1', status: 'ONGOING' });
  });
});
