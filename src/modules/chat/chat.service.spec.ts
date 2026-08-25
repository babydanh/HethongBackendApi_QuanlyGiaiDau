import { ForbiddenException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { RoomType } from './dto/create-room.dto';

function createService(repository: Record<string, jest.Mock>) {
  const defaultRepo = {
    getAllowStrangerMessages: jest.fn().mockResolvedValue(true),
    isAcquainted: jest.fn().mockResolvedValue(true),
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
  it('reuses the same DIRECT room and hydrates it for the caller', async () => {
    const room = { id: 'room-1', type: RoomType.DIRECT };
    const hydrated = { ...room, members: [] };
    const repository = {
      isActiveUser: jest.fn().mockResolvedValue(true),
      isBlockedBetween: jest.fn().mockResolvedValue(false),
      getAllowStrangerMessages: jest.fn().mockResolvedValue(true),
      isAcquainted: jest.fn().mockResolvedValue(true),
      getOrCreateDirectRoom: jest.fn().mockResolvedValue(room),
      getUserRoomById: jest.fn().mockResolvedValue(hydrated),
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
    expect(repository.getOrCreateDirectRoom).toHaveBeenNthCalledWith(1, 'user-a', 'user-b');
    expect(repository.getOrCreateDirectRoom).toHaveBeenNthCalledWith(2, 'user-b', 'user-a');
  });

  it('denies a stranger when the recipient disabled stranger messages', async () => {
    const repository = {
      isActiveUser: jest.fn().mockResolvedValue(true),
      isBlockedBetween: jest.fn().mockResolvedValue(false),
      getAllowStrangerMessages: jest.fn().mockResolvedValue(false),
      isAcquainted: jest.fn().mockResolvedValue(false),
    };
    const { service } = createService(repository);

    await expect(service.createRoom('user-a', {
      type: RoomType.DIRECT,
      memberIds: ['user-b'],
    })).rejects.toBeInstanceOf(ForbiddenException);
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
