import { ChatRepository } from './chat.repository';

type QueryResult = Record<string, unknown>[];

function createSelectQuery(result: QueryResult) {
  const query = {
    from: jest.fn(),
    innerJoin: jest.fn(),
    leftJoin: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn(),
  };

  query.from.mockReturnValue(query);
  query.innerJoin.mockReturnValue(query);
  query.leftJoin.mockReturnValue(query);
  query.where.mockReturnValue(query);
  query.orderBy.mockReturnValue(query);
  query.limit.mockResolvedValue(result);
  Object.assign(query, {
    then: (resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  });

  return query;
}

function createRepository(selectResults: QueryResult[]) {
  const db = {
    select: jest.fn().mockImplementation(() => {
      const result = selectResults.shift();
      if (!result) throw new Error('Unexpected select query');
      return createSelectQuery(result);
    }),
  };

  return {
    repository: new ChatRepository(db as never),
    db,
  };
}

const room = {
  id: 'room-1',
  name: null,
  type: 'DIRECT',
  communityId: null,
  clubName: null,
  clubAvatar: null,
  isAnnouncementOnly: false,
  slowModeSeconds: 0,
  pinnedMessageId: null,
  communityName: null,
  communityLogo: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  clearedAt: null,
};

function inboxSelectResults(lastReadAt: Date | null): QueryResult[] {
  return [
    [room],
    [],
    [
      { id: 'user-a', fullName: 'User A', avatarUrl: null, lastReadAt: null },
      { id: 'user-b', fullName: 'User B', avatarUrl: null, lastReadAt },
    ],
    [],
  ];
}

describe('ChatRepository receipt projections', () => {
  it('projects a populated canonical lastReadAt in inbox participants', async () => {
    const readAt = new Date('2026-02-03T04:05:06.000Z');
    const { repository } = createRepository(inboxSelectResults(readAt));
    jest.spyOn(repository, 'countUnreadUsingState').mockResolvedValue(0);
    jest.spyOn(repository, 'isBlockedBetween').mockResolvedValue(false);
    jest.spyOn(repository, 'shareCurrentJoinedCommunity').mockResolvedValue(true);

    const rooms = await repository.getUserRooms('user-a');

    expect(rooms[0]?.participants).toEqual([
      { id: 'user-a', fullName: 'User A', avatarUrl: null, lastReadAt: null },
      { id: 'user-b', fullName: 'User B', avatarUrl: null, lastReadAt: readAt },
    ]);
  });

  it('projects null when an inbox participant has no read-state row', async () => {
    const { repository } = createRepository(inboxSelectResults(null));
    jest.spyOn(repository, 'countUnreadUsingState').mockResolvedValue(0);
    jest.spyOn(repository, 'isBlockedBetween').mockResolvedValue(false);
    jest.spyOn(repository, 'shareCurrentJoinedCommunity').mockResolvedValue(true);

    const rooms = await repository.getUserRooms('user-a');

    expect(rooms[0]?.participants[1]).toEqual({
      id: 'user-b',
      fullName: 'User B',
      avatarUrl: null,
      lastReadAt: null,
    });
  });

  it('keeps room details aligned with populated and absent read states', async () => {
    const readAt = new Date('2026-02-03T04:05:06.000Z');
    const { repository } = createRepository([
      [{ id: 'room-1', type: 'DIRECT' }],
      [
        { id: 'user-a', fullName: 'User A', avatarUrl: null, lastReadAt: null },
        { id: 'user-b', fullName: 'User B', avatarUrl: null, lastReadAt: readAt },
      ],
    ]);

    await expect(repository.getRoomDetails('room-1')).resolves.toEqual({
      id: 'room-1',
      type: 'DIRECT',
      participants: [
        { id: 'user-a', fullName: 'User A', avatarUrl: null, lastReadAt: null },
        { id: 'user-b', fullName: 'User B', avatarUrl: null, lastReadAt: readAt },
      ],
    });
  });
});
