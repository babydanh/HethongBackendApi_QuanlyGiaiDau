import { NOTIFICATION_TYPES } from './notification-types';
import { NotificationsService } from './notifications.service';
import type { NotificationsGateway } from './notifications.gateway';
import type { NotificationsRepository } from './notifications.repository';
import type { FirebaseService } from '../firebase/firebase.service';

const EMAIL_SHAPED = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const stringValues = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringValues);
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap(stringValues);
  }
  return [];
};

describe('NotificationsService realtime sender attribution', () => {
  // The inviting manager is deliberately not the tournament owner so an
  // attribution that silently falls back to the creator cannot pass.
  const invitingManagerId = 'co-organizer-1';
  const invitingManagerEmail = 'mai.hoang@example.test';
  const refereeId = 'referee-user-1';

  const storedNotification = {
    id: 'notification-1',
    receiverId: refereeId,
    senderId: invitingManagerId,
    type: NOTIFICATION_TYPES.REFEREE_INVITED,
    title: 'Ban co loi moi lam trong tai',
    content: 'Ban to chuc vua moi ban tham gia dieu hanh gia Synthetic Inviter Tournament.',
    redirectUrl: '/notifications?action=referee-invite',
    isRead: false,
    createdAt: new Date('2026-10-02T00:00:00.000Z'),
  };

  const repositoryMock = {
    createNotification: jest.fn(),
    findSenderProfile: jest.fn(),
  };
  const gatewayMock = { pushNotification: jest.fn() };
  const firebaseMock = { sendPushToUser: jest.fn().mockResolvedValue(undefined) };

  const service = new NotificationsService(
    repositoryMock as unknown as NotificationsRepository,
    gatewayMock as unknown as NotificationsGateway,
    firebaseMock as unknown as FirebaseService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repositoryMock.createNotification.mockResolvedValue(storedNotification);
    firebaseMock.sendPushToUser.mockResolvedValue(undefined);
  });

  it('pushes the inviter identity to the invited referee realtime item', async () => {
    repositoryMock.findSenderProfile.mockResolvedValue({
      fullName: 'Mai Lan Huong',
      avatarUrl: 'https://cdn.example.test/avatars/inviter-mai-lan-huong.png',
    });

    await service.sendNotification({
      receiverId: refereeId,
      senderId: invitingManagerId,
      type: NOTIFICATION_TYPES.REFEREE_INVITED,
      title: storedNotification.title,
      content: storedNotification.content,
      redirectUrl: storedNotification.redirectUrl,
    });

    expect(gatewayMock.pushNotification).toHaveBeenCalledTimes(1);
    const [pushedTo, payload] = gatewayMock.pushNotification.mock.calls[0];
    expect(pushedTo).toBe(refereeId);
    expect(payload).toMatchObject({
      id: storedNotification.id,
      senderId: invitingManagerId,
      senderName: 'Mai Lan Huong',
      senderAvatarUrl:
        'https://cdn.example.test/avatars/inviter-mai-lan-huong.png',
    });
  });

  it('never puts the inviter email on the realtime item', async () => {
    repositoryMock.findSenderProfile.mockResolvedValue({
      fullName: 'Mai Lan Huong',
      avatarUrl: 'https://cdn.example.test/avatars/inviter-mai-lan-huong.png',
    });

    await service.sendNotification({
      receiverId: refereeId,
      senderId: invitingManagerId,
      type: NOTIFICATION_TYPES.REFEREE_INVITED,
      title: storedNotification.title,
      content: storedNotification.content,
    });

    const [, payload] = gatewayMock.pushNotification.mock.calls[0];
    const published = stringValues(payload);
    expect(published.filter((value) => EMAIL_SHAPED.test(value))).toEqual([]);
    expect(published).not.toContain(invitingManagerEmail);
  });

  it('leaves attribution null for an invitation with no recorded inviter', async () => {
    repositoryMock.createNotification.mockResolvedValue({
      ...storedNotification,
      senderId: null,
    });

    await service.sendNotification({
      receiverId: refereeId,
      type: NOTIFICATION_TYPES.REFEREE_INVITED,
      title: 'Loi moi lam trong tai',
      content: 'Ban co loi moi lam trong tai cho mot giai khac.',
    });

    expect(repositoryMock.findSenderProfile).not.toHaveBeenCalled();
    const [, payload] = gatewayMock.pushNotification.mock.calls[0];
    expect(payload).toMatchObject({
      senderId: null,
      senderName: null,
      senderAvatarUrl: null,
    });
  });

  it('does not publish a sender identity on notification types outside the referee invitation', async () => {
    repositoryMock.findSenderProfile.mockResolvedValue({
      fullName: 'Mai Lan Huong',
      avatarUrl: 'https://cdn.example.test/avatars/inviter-mai-lan-huong.png',
    });

    await service.sendNotification({
      receiverId: refereeId,
      senderId: invitingManagerId,
      type: NOTIFICATION_TYPES.REFEREE_INVITE_REVOKED,
      title: 'Loi moi da bi thu hoi',
      content: 'Ban to chuc da thu hoi loi moi cua ban.',
    });

    expect(repositoryMock.findSenderProfile).not.toHaveBeenCalled();
    const [, payload] = gatewayMock.pushNotification.mock.calls[0];
    expect(payload).toMatchObject({
      senderId: invitingManagerId,
      senderName: null,
      senderAvatarUrl: null,
    });
  });
});
