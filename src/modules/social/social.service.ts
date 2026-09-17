import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SocialRepository } from './social.repository';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';
import { UpdateFriendshipDto, FriendshipAction } from './dto/update-friendship.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TYPES } from '../notifications/notification-types';
import type {
  FriendshipDirection,
  FriendshipStatus,
  FriendshipStatusView,
} from './friendship.types';

@Injectable()
export class SocialService {
  private readonly logger = new Logger(SocialService.name);

  constructor(
    private readonly socialRepository: SocialRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

  async sendFriendRequest(userId: string, data: SendFriendRequestDto) {
    if (userId === data.receiverId) {
      throw new BadRequestException('Cannot send friend request to yourself');
    }

    const receiver = await this.socialRepository.findActiveUser(data.receiverId);
    if (!receiver) {
      throw new NotFoundException('User not found');
    }

    const existing = await this.socialRepository.findFriendship(
      userId,
      data.receiverId,
    );

    if (existing) {
      return this.resolveExistingRequest(userId, existing);
    }

    const created = await this.socialRepository.createFriendRequest(userId, data.receiverId);
    if (!created) {
      const raced = await this.socialRepository.findFriendship(userId, data.receiverId);
      if (!raced) {
        throw new ConflictException('Friend request could not be created');
      }
      return this.resolveExistingRequest(userId, raced);
    }

    await this.notifySafely({
      receiverId: data.receiverId,
      senderId: userId,
      type: NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
      title: 'Lời mời kết bạn mới',
      content: 'Bạn có một lời mời kết bạn mới.',
      redirectUrl: '/notifications',
    });

    return this.toStatusView(created, userId);
  }

  async respondToRequest(
    userId: string,
    friendshipId: string,
    data: UpdateFriendshipDto,
  ) {
    const friendship = await this.socialRepository.findFriendshipById(friendshipId);
    if (!friendship) {
      throw new NotFoundException('Friend request not found');
    }
    if (friendship.receiverId !== userId) {
      throw new ForbiddenException('Only the recipient can respond to this request');
    }
    if (friendship.status !== 'PENDING') {
      throw new ConflictException('Friend request is no longer pending');
    }

    const status: FriendshipStatus =
      data.action === FriendshipAction.ACCEPT ? 'ACCEPTED' : 'REJECTED';
    const updated = await this.socialRepository.updateFriendshipStatus(
      friendshipId,
      userId,
      status,
    );
    if (!updated) {
      throw new ConflictException('Friend request was updated by another action');
    }

    await this.notifySafely({
      receiverId: friendship.senderId,
      senderId: userId,
      type:
        status === 'ACCEPTED'
          ? NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED
          : NOTIFICATION_TYPES.FRIEND_REQUEST_REJECTED,
      title: status === 'ACCEPTED' ? 'Lời mời kết bạn đã được chấp nhận' : 'Lời mời kết bạn bị từ chối',
      content:
        status === 'ACCEPTED'
          ? 'Lời mời kết bạn của bạn đã được chấp nhận.'
          : 'Lời mời kết bạn của bạn đã bị từ chối.',
      redirectUrl: '/notifications',
    });

    return this.toStatusView(updated, userId);
  }

  async getMyFriends(userId: string) {
    return this.socialRepository.getFriends(userId);
  }

  async getFriendshipStatus(userId: string, targetUserId: string): Promise<FriendshipStatusView> {
    if (userId === targetUserId) {
      return this.noneStatus();
    }

    const target = await this.socialRepository.findActiveUser(targetUserId);
    if (!target) {
      throw new NotFoundException('User not found');
    }

    const friendship = await this.socialRepository.findFriendship(userId, targetUserId);
    return friendship ? this.toStatusView(friendship, userId) : this.noneStatus();
  }

  async deleteFriendship(userId: string, friendshipId: string): Promise<FriendshipStatusView> {
    const friendship = await this.socialRepository.findFriendshipById(friendshipId);
    if (!friendship) {
      throw new NotFoundException('Friendship not found');
    }

    const canDeletePending =
      friendship.status === 'PENDING' && friendship.senderId === userId;
    const canUnfriend =
      friendship.status === 'ACCEPTED' &&
      (friendship.senderId === userId || friendship.receiverId === userId);

    if (!canDeletePending && !canUnfriend) {
      throw new ForbiddenException('You cannot remove this friendship');
    }

    const deleted = await this.socialRepository.softDeleteFriendship(friendshipId, userId);
    if (!deleted) {
      throw new ConflictException('Friendship was updated by another action');
    }

    return this.noneStatus();
  }

  private resolveExistingRequest(
    userId: string,
    friendship: { senderId: string; receiverId: string; status: string; id: string },
  ): FriendshipStatusView {
    if (friendship.status === 'PENDING' && friendship.senderId === userId) {
      return this.toStatusView(friendship, userId);
    }

    if (friendship.status === 'PENDING' && friendship.receiverId === userId) {
      throw new ConflictException('This user already sent you a friend request');
    }

    throw new ConflictException('Friendship or request already exists');
  }

  private toStatusView(
    friendship: { id: string; senderId: string; receiverId: string; status: string },
    viewerId: string,
  ): FriendshipStatusView {
    const status = this.normalizeStatus(friendship.status);
    const direction: FriendshipDirection =
      friendship.senderId === viewerId ? 'OUTGOING' : 'INCOMING';
    return {
      id: friendship.id,
      status,
      direction,
      senderId: friendship.senderId,
      receiverId: friendship.receiverId,
    };
  }

  private normalizeStatus(status: string): FriendshipStatus {
    if (status === 'ACCEPTED' || status === 'REJECTED' || status === 'BLOCKED') {
      return status;
    }
    return 'PENDING';
  }

  private noneStatus(): FriendshipStatusView {
    return {
      id: null,
      status: 'NONE',
      direction: 'NONE',
      senderId: null,
      receiverId: null,
    };
  }

  private async notifySafely(data: {
    receiverId: string;
    senderId: string;
    type: string;
    title: string;
    content: string;
    redirectUrl: string;
  }): Promise<void> {
    try {
      await this.notificationsService.sendNotification(data);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Friendship notification failed: ${message}`);
    }
  }
}
