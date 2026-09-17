import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SocialService } from './social.service';

type FriendshipRecord = {
  id: string;
  senderId: string;
  receiverId: string;
  status: string;
};

const friendship = (overrides: Partial<FriendshipRecord> = {}): FriendshipRecord => ({
  id: 'friendship-1',
  senderId: 'user-1',
  receiverId: 'user-2',
  status: 'PENDING',
  ...overrides,
});

describe('SocialService', () => {
  const repository = {
    findActiveUser: jest.fn(),
    findFriendship: jest.fn(),
    createFriendRequest: jest.fn(),
    findFriendshipById: jest.fn(),
    updateFriendshipStatus: jest.fn(),
    softDeleteFriendship: jest.fn(),
    getFriends: jest.fn(),
  };
  const notifications = { sendNotification: jest.fn() };
  let service: SocialService;

  beforeEach(() => {
    jest.resetAllMocks();
    notifications.sendNotification.mockResolvedValue({ id: 'notification-1' });
    service = new SocialService(repository as never, notifications as never);
  });

  it('rejects a self-request before touching persistence', async () => {
    await expect(
      service.sendFriendRequest('user-1', { receiverId: 'user-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repository.findActiveUser).not.toHaveBeenCalled();
  });

  it('rejects requests to an inactive or missing user', async () => {
    repository.findActiveUser.mockResolvedValue(null);

    await expect(
      service.sendFriendRequest('user-1', { receiverId: 'user-2' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(repository.findFriendship).not.toHaveBeenCalled();
  });

  it('is idempotent for the same outgoing pending request', async () => {
    const current = friendship();
    repository.findActiveUser.mockResolvedValue({ id: 'user-2' });
    repository.findFriendship.mockResolvedValue(current);

    await expect(
      service.sendFriendRequest('user-1', { receiverId: 'user-2' }),
    ).resolves.toMatchObject({ id: 'friendship-1', status: 'PENDING', direction: 'OUTGOING' });

    expect(repository.createFriendRequest).not.toHaveBeenCalled();
    expect(notifications.sendNotification).not.toHaveBeenCalled();
  });

  it('does not create a duplicate reverse request', async () => {
    repository.findActiveUser.mockResolvedValue({ id: 'user-1' });
    repository.findFriendship.mockResolvedValue(
      friendship({ senderId: 'user-1', receiverId: 'user-2' }),
    );

    await expect(
      service.sendFriendRequest('user-2', { receiverId: 'user-1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates a request and notifies the receiver', async () => {
    const created = friendship({ senderId: 'user-1', receiverId: 'user-2' });
    repository.findActiveUser.mockResolvedValue({ id: 'user-2' });
    repository.findFriendship.mockResolvedValue(null);
    repository.createFriendRequest.mockResolvedValue(created);

    await expect(
      service.sendFriendRequest('user-1', { receiverId: 'user-2' }),
    ).resolves.toMatchObject({ status: 'PENDING', direction: 'OUTGOING' });

    expect(notifications.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ receiverId: 'user-2', senderId: 'user-1' }),
    );
  });

  it('keeps the committed request when notification delivery fails', async () => {
    const created = friendship({ senderId: 'user-1', receiverId: 'user-2' });
    repository.findActiveUser.mockResolvedValue({ id: 'user-2' });
    repository.findFriendship.mockResolvedValue(null);
    repository.createFriendRequest.mockResolvedValue(created);
    notifications.sendNotification.mockRejectedValue(new Error('provider unavailable'));

    await expect(
      service.sendFriendRequest('user-1', { receiverId: 'user-2' }),
    ).resolves.toMatchObject({ status: 'PENDING' });
  });

  it('allows only the recipient to respond to a pending request', async () => {
    repository.findFriendshipById.mockResolvedValue(friendship());

    await expect(
      service.respondToRequest('user-1', 'friendship-1', { action: 'ACCEPTED' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repository.updateFriendshipStatus).not.toHaveBeenCalled();
  });

  it('accepts a pending request with a guarded update and notification', async () => {
    const pending = friendship();
    const accepted = friendship({ status: 'ACCEPTED' });
    repository.findFriendshipById.mockResolvedValue(pending);
    repository.updateFriendshipStatus.mockResolvedValue(accepted);

    await expect(
      service.respondToRequest('user-2', 'friendship-1', { action: 'ACCEPTED' }),
    ).resolves.toMatchObject({ status: 'ACCEPTED', direction: 'INCOMING' });

    expect(repository.updateFriendshipStatus).toHaveBeenCalledWith(
      'friendship-1',
      'user-2',
      'ACCEPTED',
    );
    expect(notifications.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ receiverId: 'user-1', senderId: 'user-2' }),
    );
  });

  it('does not allow the recipient to withdraw the sender request', async () => {
    repository.findFriendshipById.mockResolvedValue(friendship());

    await expect(
      service.deleteFriendship('user-2', 'friendship-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repository.softDeleteFriendship).not.toHaveBeenCalled();
  });

  it('soft-deletes an accepted friendship and returns NONE', async () => {
    repository.findFriendshipById.mockResolvedValue(friendship({ status: 'ACCEPTED' }));
    repository.softDeleteFriendship.mockResolvedValue(friendship({ status: 'ACCEPTED' }));

    await expect(
      service.deleteFriendship('user-2', 'friendship-1'),
    ).resolves.toEqual({
      id: null,
      status: 'NONE',
      direction: 'NONE',
      senderId: null,
      receiverId: null,
    });
  });

  it('returns NONE when no active friendship exists', async () => {
    repository.findActiveUser.mockResolvedValue({ id: 'user-2' });
    repository.findFriendship.mockResolvedValue(null);

    await expect(
      service.getFriendshipStatus('user-1', 'user-2'),
    ).resolves.toEqual({
      id: null,
      status: 'NONE',
      direction: 'NONE',
      senderId: null,
      receiverId: null,
    });
  });
});
