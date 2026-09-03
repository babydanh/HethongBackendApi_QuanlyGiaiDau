import { ForbiddenException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { RoomType } from './dto/create-room.dto';

function createService(repository: Record<string, jest.Mock>) {
  const defaultRepo = {
    shareCurrentJoinedCommunity: jest.fn().mockResolvedValue(true),
    ...repository,
  };
  const gateway = {
    broadcastMessage: jest.fn(),
    broadcastMessagePinned: jest.fn(),
    broadcastMessageReaction: jest.fn(),
    notifyDirectRoomCreated: jest.fn(),
    notifyDirectRoomUpdated: jest.fn(),
  };
  const firebase = { sendPushToUsers: jest.fn() };
  return {
    service: new ChatService(defaultRepo as never, gateway as never, firebase as never),
    gateway,
    firebase,
  };
}

describe('ChatService authorization regressions', () => {
  it('reuses the same DIRECT room and hydrates it without rebuilding the inbox', async () => {
    const room = { id: 'room-1', type: RoomType.DIRECT };
    const hydrated = { ...room, participants: [] };
    const repository = {
      isActiveUser: jest.fn().mockResolvedValue(true),
      isBlockedBetween: jest.fn().mockResolvedValue(false),
      getAllowStrangerMessages: jest.fn().mockResolvedValue(true),
      isAcquainted: jest.fn().mockResolvedValue(true),
      getOrCreateDirectRoom: jest.fn().mockResolvedValue(room),
      getRoomDetails: jest.fn().mockResolvedValue(hydrated),
      getUserRooms: jest.fn(),
      getUserRoomById: jest.fn(),
    };
    const { service } = createService(repository);

    const first = await service.createRoom('user-a', {
      type: RoomType.DIRECT,
      memberIds: ['user-b'],
    });
    const second = await service.createRoom('user-b', {
      type: RoomType.DIRECT,
      memberIds: ['user-a'],
    });

    expect(first).toEqual(hydrated);
    expect(second).toEqual(hydrated);
    expect(repository.getOrCreateDirectRoom).toHaveBeenCalledTimes(2);
    expect(repository.getRoomDetails).toHaveBeenCalledTimes(2);
    expect(repository.getUserRooms).not.toHaveBeenCalled();
    expect(repository.getUserRoomById).not.toHaveBeenCalled();
  });

  it('allows DIRECT creation only for users sharing a current JOINED club', async () => {
    const room = { id: 'room-1', type: RoomType.DIRECT };
    const repository = {
      isActiveUser: jest.fn().mockResolvedValue(true),
      isBlockedBetween: jest.fn().mockResolvedValue(false),
      shareCurrentJoinedCommunity: jest.fn().mockResolvedValue(true),
      getOrCreateDirectRoom: jest.fn().mockResolvedValue(room),
      getRoomDetails: jest.fn().mockResolvedValue(room),
    };
    const { service } = createService(repository);

    await expect(service.createRoom('user-a', {
      type: RoomType.DIRECT,
      memberIds: ['user-b'],
    })).resolves.toEqual(room);
  });

  it.each([
    'different clubs',
    'same tournament only',
    'former member with no row',
    'non-JOINED membership',
    'prior direct history',
    'friend or follower',
    'recipient stranger opt-in',
  ])('denies DIRECT creation for %s', async () => {
    const repository = {
      isActiveUser: jest.fn().mockResolvedValue(true),
      isBlockedBetween: jest.fn().mockResolvedValue(false),
      shareCurrentJoinedCommunity: jest.fn().mockResolvedValue(false),
      getOrCreateDirectRoom: jest.fn(),
    };
    const { service } = createService(repository);

    const promise = service.createRoom('user-a', {
      type: RoomType.DIRECT,
      memberIds: ['user-b'],
    });
    await expect(promise).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'NO_SHARED_CURRENT_CLUB' }),
    });
    expect(repository.getOrCreateDirectRoom).not.toHaveBeenCalled();
  });

  it('returns the stable shared-club denial code from the policy endpoint', async () => {
    const repository = {
      isActiveUser: jest.fn().mockResolvedValue(true),
      isBlockedBetween: jest.fn().mockResolvedValue(false),
      shareCurrentJoinedCommunity: jest.fn().mockResolvedValue(false),
    };
    const { service } = createService(repository);

    await expect(service.getDirectMessagePolicy('user-a', 'user-b')).resolves.toEqual({
      canMessage: false,
      reasonCode: 'NO_SHARED_CURRENT_CLUB',
    });
  });

  it('fails closed when the shared-club policy lookup errors', async () => {
    const repository = {
      isActiveUser: jest.fn().mockResolvedValue(true),
      isBlockedBetween: jest.fn().mockResolvedValue(false),
      shareCurrentJoinedCommunity: jest.fn().mockRejectedValue(new Error('database unavailable')),
    };
    const { service } = createService(repository);

    await expect(service.getDirectMessagePolicy('user-a', 'user-b')).resolves.toEqual({
      canMessage: false,
      reasonCode: 'NO_SHARED_CURRENT_CLUB',
    });
  });

  it('rechecks current shared-club membership when sending in an existing direct room', async () => {
    const repository = {
      findRoomById: jest.fn().mockResolvedValue({ id: 'room-1', type: RoomType.DIRECT }),
      isMemberOfRoom: jest.fn().mockResolvedValue(true),
      getRoomMemberIds: jest.fn().mockResolvedValue(['user-a', 'user-b']),
      isBlockedBetween: jest.fn().mockResolvedValue(false),
      shareCurrentJoinedCommunity: jest.fn().mockResolvedValue(false),
      saveMessage: jest.fn(),
    };
    const { service } = createService(repository);

    await expect(service.sendMessage('user-a', {
      roomId: 'room-1',
      messageText: 'hello',
    })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'NO_SHARED_CURRENT_CLUB' }),
    });
    expect(repository.saveMessage).not.toHaveBeenCalled();
  });

  it('returns room details only after DIRECT membership and block checks pass', async () => {
    const repository = {
      findRoomById: jest.fn().mockResolvedValue({ id: 'room-1', type: RoomType.DIRECT }),
      isMemberOfRoom: jest.fn().mockResolvedValue(true),
      getRoomMemberIds: jest.fn().mockResolvedValue(['user-a', 'user-b']),
      isBlockedBetween: jest.fn().mockResolvedValue(false),
      getRoomDetails: jest.fn().mockResolvedValue({
        id: 'room-1',
        type: RoomType.DIRECT,
        participants: [],
      }),
    };
    const { service } = createService(repository);

    await expect(service.getRoomDetails('user-a', 'room-1')).resolves.toEqual(
      expect.objectContaining({ id: 'room-1', participants: [] }),
    );
    expect(repository.getRoomDetails).toHaveBeenCalledWith('room-1');
  });

  it('rejects room details for a DIRECT non-member', async () => {
    const repository = {
      findRoomById: jest.fn().mockResolvedValue({ id: 'room-1', type: RoomType.DIRECT }),
      isMemberOfRoom: jest.fn().mockResolvedValue(false),
      getRoomMemberIds: jest.fn().mockResolvedValue(['user-a', 'user-b']),
      isBlockedBetween: jest.fn().mockResolvedValue(false),
    };
    const { service } = createService(repository);

    await expect(service.getRoomDetails('intruder', 'room-1'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects pinning a DIRECT message by a non-member', async () => {
    const repository = {
      findRoomById: jest.fn().mockResolvedValue({ id: 'room-1', type: RoomType.DIRECT }),
      findMessageById: jest.fn().mockResolvedValue({ id: 'message-1', roomId: 'room-1' }),
      isMemberOfRoom: jest.fn().mockResolvedValue(false),
      getRoomMemberIds: jest.fn().mockResolvedValue(['user-a', 'user-b']),
      isBlockedBetween: jest.fn().mockResolvedValue(false),
    };
    const { service } = createService(repository);

    await expect(service.pinMessage('intruder', 'room-1', 'message-1'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects reacting to a DIRECT message by a non-member', async () => {
    const repository = {
      findMessageById: jest.fn().mockResolvedValue({ id: 'message-1', roomId: 'room-1' }),
      findRoomById: jest.fn().mockResolvedValue({ id: 'room-1', type: RoomType.DIRECT }),
      isMemberOfRoom: jest.fn().mockResolvedValue(false),
      getRoomMemberIds: jest.fn().mockResolvedValue(['user-a', 'user-b']),
      isBlockedBetween: jest.fn().mockResolvedValue(false),
    };
    const { service } = createService(repository);

    await expect(service.toggleReaction('intruder', 'message-1', '👍'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});

export {};
