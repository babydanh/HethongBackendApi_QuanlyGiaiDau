import { ChatGateway } from './chat.gateway';
import { RoomType } from './dto/create-room.dto';

function createGateway(repository: Record<string, jest.Mock>) {
  const gateway = new ChatGateway(repository as never, { verify: jest.fn() } as never);
  const emit = jest.fn();
  const to = jest.fn().mockReturnValue({ emit });
  gateway.server = { to, emit: jest.fn() } as never;
  const client = {
    data: { user: { sub: 'user-a' } },
    join: jest.fn(),
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
  } as never;
  return { gateway, client, emit };
}

describe('ChatGateway direct authorization', () => {
  it.each([
    ['join', (gateway: ChatGateway, client: never) => gateway.handleJoinRoom('room-1', client)],
    ['send', (gateway: ChatGateway, client: never) => gateway.handleMessage({ roomId: 'room-1', content: 'hello' }, client)],
    ['typing', (gateway: ChatGateway, client: never) => gateway.handleClubTyping({ roomId: 'room-1', isTyping: true }, client)],
    ['read', (gateway: ChatGateway) => gateway.markRoomRead('room-1', 'user-a')],
  ])('fails closed for DIRECT %s when current shared-club lookup fails', async (_name, action) => {
    const repository = {
      findRoomById: jest.fn().mockResolvedValue({ id: 'room-1', type: RoomType.DIRECT }),
      canAccessRoom: jest.fn().mockResolvedValue(true),
      getRoomMemberIds: jest.fn().mockResolvedValue(['user-a', 'user-b']),
      isBlockedBetween: jest.fn().mockResolvedValue(false),
      shareCurrentJoinedCommunity: jest.fn().mockRejectedValue(new Error('database unavailable')),
      saveMessage: jest.fn(),
      markRead: jest.fn(),
    };
    const { gateway, client } = createGateway(repository);

    await expect(action(gateway, client)).resolves.toEqual({
      event: 'chat:error',
      data: 'NO_SHARED_CURRENT_CLUB',
    });
    expect(repository.saveMessage).not.toHaveBeenCalled();
    expect(repository.markRead).not.toHaveBeenCalled();
  });

  it('allows DIRECT join only when both users currently share a JOINED club', async () => {
    const repository = {
      findRoomById: jest.fn().mockResolvedValue({ id: 'room-1', type: RoomType.DIRECT }),
      canAccessRoom: jest.fn().mockResolvedValue(true),
      getRoomMemberIds: jest.fn().mockResolvedValue(['user-a', 'user-b']),
      isBlockedBetween: jest.fn().mockResolvedValue(false),
      shareCurrentJoinedCommunity: jest.fn().mockResolvedValue(true),
    };
    const { gateway, client } = createGateway(repository);

    await expect(gateway.handleJoinRoom('room-1', client)).resolves.toEqual({
      event: 'joined',
      data: 'chat:room-1',
    });
  });
});
