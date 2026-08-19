import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ChatRepository } from './chat.repository';
import { CreateRoomDto } from './dto/create-room.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { ChatGateway } from './chat.gateway';
import { CreateSupportConversationDto } from './dto/create-support-conversation.dto';
import { RoomType } from './dto/create-room.dto';
import { extractLinkPreview } from './utils/link-preview.util';

import { FirebaseService } from '../firebase/firebase.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly chatRepository: ChatRepository,
    private readonly chatGateway: ChatGateway,
    private readonly firebaseService: FirebaseService,
  ) {}

  async getUserRooms(userId: string) {
    return this.chatRepository.getUserRooms(userId);
  }

  private async assertDirectRoomAccess(userId: string, roomId: string) {
    if (!(await this.chatRepository.isMemberOfRoom(roomId, userId))) {
      throw new ForbiddenException('Bạn không có quyền truy cập phòng chat này.');
    }

    const otherUserId = (await this.chatRepository.getRoomMemberIds(roomId))
      .find((memberId) => memberId !== userId);
    if (otherUserId && await this.chatRepository.isBlockedBetween(userId, otherUserId)) {
      throw new ForbiddenException('Bạn không thể tương tác trong cuộc trò chuyện này vì đã bị chặn.');
    }
  }

  /// Người nhận bật "không nhận tin nhắn người lạ" và người gửi không quen
  /// (không cùng CLB, không là bạn bè) → chặn nhắn tin riêng.
  async assertCanDirectMessage(fromUserId: string, toUserId: string) {
    if (fromUserId === toUserId) return;
    const allowed = await this.chatRepository.getAllowStrangerMessages(toUserId);
    if (allowed) return;
    if (await this.chatRepository.isAcquainted(fromUserId, toUserId)) return;
    throw new ForbiddenException('Người dùng này không nhận tin nhắn từ người lạ.');
  }

  async createRoom(userId: string, data: CreateRoomDto) {
    if (data.type === RoomType.SUPPORT) {
      throw new ForbiddenException(
        'Phòng hỗ trợ chỉ được tạo qua chức năng hỗ trợ trực tiếp.',
      );
    }

    if (data.type === RoomType.CLUB) {
      throw new ForbiddenException(
        'Phòng CLUB chỉ được tạo tự động qua chức năng chat cộng đồng.',
      );
    }

    const memberIds = Array.from(new Set([...data.memberIds, userId]));

    if (data.type === RoomType.DIRECT) {
      if (data.memberIds.length === 1 && data.memberIds[0] === userId) {
        throw new BadRequestException('Bạn không thể tự nhắn tin cho chính mình.');
      }
      if (memberIds.length !== 2) {
        throw new BadRequestException('Cuộc trò chuyện trực tiếp cần có đúng 2 thành viên.');
      }
    }

    if (data.type === RoomType.DIRECT) {
      const otherUserId = memberIds.find((memberId) => memberId !== userId);
      if (!otherUserId || !(await this.chatRepository.isActiveUser(otherUserId))) {
        throw new NotFoundException('Không tìm thấy người dùng để nhắn tin.');
      }
      if (otherUserId && await this.chatRepository.isBlockedBetween(userId, otherUserId)) {
        throw new ForbiddenException('Không thể mở chat vì một trong hai người đã chặn nhau.');
      }
      await this.assertCanDirectMessage(userId, otherUserId);
      const room = await this.chatRepository.getOrCreateDirectRoom(userId, otherUserId);
      return (await this.chatRepository.getUserRoomById(userId, room.id)) ?? room;
    }

    return this.chatRepository.createRoomWithMembers({ ...data, memberIds });
  }

  /**
   * P2D.1 — Lấy (hoặc lazy-create) phòng chat CLUB của cộng đồng.
   * Guard: user phải là member JOINED của cộng đồng.
   */
  async getOrCreateClubRoom(communityId: string, userId: string) {
    await this.assertClubMember(communityId, userId);

    const room = await this.chatRepository.getOrCreateClubRoom(communityId);
    const members = await this.chatRepository.getClubRoomMembers(communityId);

    return { ...room, members };
  }

  /**
   * P2D.1 — Guard kênh chat CLUB: user phải là member JOINED của cộng đồng.
   */
  async assertClubMember(communityId: string, userId: string) {
    if (!(await this.chatRepository.isClubChatEnabled(communityId))) {
      throw new ForbiddenException('KÃªnh chat cá»§a cá»™ng Ä‘á»“ng hiá»‡n Ä‘ang táº¯t.');
    }
    const member = await this.chatRepository.findCommunityMember(
      communityId,
      userId,
    );
    if (!member) {
      throw new ForbiddenException('You are not a member of this community');
    }
    if (member.status !== 'JOINED') {
      throw new ForbiddenException(
        'Bạn cần là thành viên chính thức của cộng đồng để tham gia kênh chat.',
      );
    }
    return member;
  }

  async sendMessage(userId: string, data: CreateMessageDto) {
    const messageText = data.messageText?.trim();
    const attachmentsUrls = (data.attachmentsUrls ?? []).filter((url) => url.trim().length > 0);
    if (!messageText && attachmentsUrls.length === 0) {
      throw new BadRequestException('Tin nhắn cần có nội dung hoặc ít nhất một tệp đính kèm.');
    }
    const room = await this.chatRepository.findRoomById(data.roomId);
    if (!room) {
      throw new NotFoundException('Không tìm thấy phòng chat.');
    }

    // P2D.1: room CLUB guard qua membership cộng đồng (JOINED), các loại khác qua chat_room_members.
    const roomType = room.type as RoomType;
    if (roomType === RoomType.CLUB && room.communityId) {
      const role = await this.chatRepository.getCommunityRole(room.communityId, userId);
      if (!role) {
        throw new ForbiddenException('Bạn phải là thành viên của CLB để gửi tin nhắn.');
      }
      if (room.isAnnouncementOnly && role !== 'OWNER' && role !== 'ADMIN' && role !== 'MODERATOR') {
        throw new ForbiddenException('Phòng chat đang ở chế độ Chỉ Ban Quản Trị được nhắn tin.');
      }
      if (room.slowModeSeconds && room.slowModeSeconds > 0 && role !== 'OWNER' && role !== 'ADMIN' && role !== 'MODERATOR') {
        const lastUserMsg = await this.chatRepository.getLastUserMessageInRoom(data.roomId, userId);
        if (lastUserMsg && lastUserMsg.createdAt) {
          const elapsed = (Date.now() - new Date(lastUserMsg.createdAt).getTime()) / 1000;
          if (elapsed < room.slowModeSeconds) {
            const waitTime = Math.ceil(room.slowModeSeconds - elapsed);
            throw new BadRequestException(`Chế độ làm chậm đang bật. Vui lòng chờ ${waitTime} giây trước khi gửi tiếp.`);
          }
        }
      }
    } else {
      const isMember = await this.chatRepository.isMemberOfRoom(
        data.roomId,
        userId,
      );
      if (!isMember) {
        throw new ForbiddenException('You are not a member of this chat room');
      }
    }

    if (roomType === RoomType.DIRECT) {
      const otherUserId = (await this.chatRepository.getRoomMemberIds(data.roomId))
        .find((memberId) => memberId !== userId);
      if (otherUserId && await this.chatRepository.isBlockedBetween(userId, otherUserId)) {
        throw new ForbiddenException('Không thể gửi tin nhắn vì một trong hai người đã chặn nhau.');
      }
      if (otherUserId) {
        await this.assertCanDirectMessage(userId, otherUserId);
      }
    }

    const message = await this.chatRepository.saveMessage(userId, {
      ...data,
      messageText,
      attachmentsUrls,
    });

    if (roomType === RoomType.SUPPORT) {
      this.chatGateway.broadcastSupportMessage(data.roomId, message);
    } else if (roomType === RoomType.CLUB && room.communityId) {
      // P2D.1: payload kèm tags của sender tại thời điểm gửi (denormalized, client không cần join lại).
      const senderTags = await this.chatRepository.getMemberTags(
        room.communityId,
        userId,
      );
      const clubPayload = {
        ...message,
        senderTags,
      };
      this.chatGateway.broadcastClubMessage(data.roomId, clubPayload);
      this.chatGateway.broadcastMessage(data.roomId, clubPayload);
    } else {
      this.chatGateway.broadcastMessage(data.roomId, message);
    }

    // Dispatch FCM Push Notification in background
    void (async () => {
      try {
        let recipientIds: string[] = [];
        if (roomType === RoomType.DIRECT || roomType === RoomType.SUPPORT) {
          const members = await this.chatRepository.getRoomMemberIds(data.roomId);
          recipientIds = members.filter((m) => m !== userId);
        } else if (roomType === RoomType.CLUB && room.communityId) {
          const membersWithPref = await this.chatRepository.getCommunityMembersWithNotificationPref(room.communityId, userId);
          const mentions = (data.metadata?.mentions as string[]) || [];
          const isMentioned = (uid: string) =>
            mentions.includes(uid) ||
            Boolean(messageText && (messageText.includes(`@${uid}`) || messageText.includes('@all') || messageText.includes('@everyone')));

          recipientIds = membersWithPref
            .filter((m) => {
              if (m.notificationPreference === 'MUTED') return false;
              if (m.notificationPreference === 'MENTIONS_ONLY') return isMentioned(m.userId);
              return true;
            })
            .map((m) => m.userId);
        }

        if (recipientIds.length > 0) {
          const senderUser = await this.chatRepository.findUserById(userId);
          const senderName = senderUser?.fullName || 'Một thành viên';
          const title = room.name ? `${senderName} (${room.name})` : senderName;
          const body = messageText || (attachmentsUrls.length > 0 ? '📷 Đã gửi hình ảnh' : 'Tin nhắn mới');

          await this.firebaseService.sendPushToUsers(recipientIds, {
            title,
            body,
            data: {
              type: 'CHAT',
              roomId: data.roomId,
              messageId: message.id,
            },
          });
        }
      } catch {
        // Fire-and-forget push error handling
      }
    })();

    return message;
  }

  async getMessages(userId: string, roomId: string, limit = 30, cursor?: string) {
    const room = await this.chatRepository.findRoomById(roomId);
    if (!room) {
      throw new NotFoundException('Không tìm thấy phòng chat.');
    }

    // P2D.1: room CLUB guard qua membership cộng đồng (JOINED), các loại khác qua chat_room_members.
    const roomType = room.type as RoomType;
    if (roomType === RoomType.CLUB && room.communityId) {
      await this.assertClubMember(room.communityId, userId);
    } else {
      const isMember = await this.chatRepository.isMemberOfRoom(roomId, userId);
      if (!isMember) {
        throw new ForbiddenException('You are not a member of this chat room');
      }
      if (roomType === RoomType.DIRECT) {
        const otherUserId = (await this.chatRepository.getRoomMemberIds(roomId))
          .find((memberId) => memberId !== userId);
        if (otherUserId && await this.chatRepository.isBlockedBetween(userId, otherUserId)) {
          throw new ForbiddenException('Bạn không thể truy cập cuộc trò chuyện này vì đã bị chặn.');
        }
      }
    }

    return this.chatRepository.getMessagesPage(roomId, limit, cursor, userId);
  }

  async clearRoomMessages(userId: string, roomId: string) {
    const room = await this.chatRepository.findRoomById(roomId);
    if (!room) {
      throw new NotFoundException('Không tìm thấy phòng chat.');
    }

    const roomType = room.type as RoomType;
    if (roomType === RoomType.CLUB && room.communityId) {
      await this.assertClubMember(room.communityId, userId);
    } else {
      const isMember = await this.chatRepository.isMemberOfRoom(roomId, userId);
      if (!isMember) {
        throw new ForbiddenException('Bạn không phải là thành viên của phòng chat này.');
      }
    }

    return await this.chatRepository.clearRoomHistory(userId, roomId);
  }

  async revokeMessage(userId: string, messageId: string) {
    const message = await this.chatRepository.findMessageById(messageId);
    if (!message) {
      throw new NotFoundException('Không tìm thấy tin nhắn.');
    }
    if (message.isRevoked) {
      return message;
    }

    const room = await this.chatRepository.findRoomById(message.roomId);
    if (!room) {
      throw new NotFoundException('Không tìm thấy phòng chat.');
    }

    let isAllowed = message.senderId === userId;
    const roomType = room.type as RoomType;
    if (!isAllowed && roomType === RoomType.CLUB && room.communityId) {
      const role = await this.chatRepository.getCommunityRole(room.communityId, userId);
      isAllowed = role === 'OWNER' || role === 'ADMIN' || role === 'MODERATOR';
    }

    if (!isAllowed) {
      throw new ForbiddenException('Bạn không có quyền thu hồi tin nhắn này.');
    }

    const updated = await this.chatRepository.revokeMessage(messageId, userId);
    this.chatGateway.broadcastMessageRevoked(message.roomId, messageId, userId);
    return updated;
  }

  async pinMessage(userId: string, roomId: string, messageId: string) {
    const room = await this.chatRepository.findRoomById(roomId);
    if (!room) throw new NotFoundException('Không tìm thấy phòng chat.');
    const message = await this.chatRepository.findMessageById(messageId);
    if (!message || message.roomId !== roomId) {
      throw new NotFoundException('Tin nhắn không thuộc phòng chat này.');
    }

    const roomType = room.type as RoomType;
    if (roomType === RoomType.CLUB && room.communityId) {
      const role = await this.chatRepository.getCommunityRole(room.communityId, userId);
      if (role !== 'OWNER' && role !== 'ADMIN' && role !== 'MODERATOR') {
        throw new ForbiddenException('Chỉ Ban Quản Trị mới có quyền ghim tin nhắn.');
      }
    } else if (roomType === RoomType.DIRECT) {
      await this.assertDirectRoomAccess(userId, roomId);
    } else if (!(await this.chatRepository.isMemberOfRoom(roomId, userId))) {
      throw new ForbiddenException('Bạn không có quyền ghim tin nhắn trong phòng này.');
    }

    const res = await this.chatRepository.pinMessage(roomId, messageId, userId);
    const pinnedMsg = await this.chatRepository.getPinnedMessage(roomId);
    this.chatGateway.broadcastMessagePinned(roomId, messageId, userId, pinnedMsg);
    return res;
  }

  async unpinMessage(userId: string, roomId: string, messageId: string) {
    const room = await this.chatRepository.findRoomById(roomId);
    if (!room) throw new NotFoundException('Không tìm thấy phòng chat.');
    const message = await this.chatRepository.findMessageById(messageId);
    if (!message || message.roomId !== roomId) {
      throw new NotFoundException('Tin nhắn không thuộc phòng chat này.');
    }

    const roomType = room.type as RoomType;
    if (roomType === RoomType.CLUB && room.communityId) {
      const role = await this.chatRepository.getCommunityRole(room.communityId, userId);
      if (role !== 'OWNER' && role !== 'ADMIN' && role !== 'MODERATOR') {
        throw new ForbiddenException('Chỉ Ban Quản Trị mới có quyền bỏ ghim tin nhắn.');
      }
    } else if (roomType === RoomType.DIRECT) {
      await this.assertDirectRoomAccess(userId, roomId);
    } else if (!(await this.chatRepository.isMemberOfRoom(roomId, userId))) {
      throw new ForbiddenException('Bạn không có quyền bỏ ghim tin nhắn trong phòng này.');
    }

    const res = await this.chatRepository.unpinMessage(roomId, messageId);
    this.chatGateway.broadcastMessageUnpinned(roomId, messageId, userId);
    return res;
  }

  async getPinnedMessage(userId: string, roomId: string) {
    const room = await this.chatRepository.findRoomById(roomId);
    if (!room) throw new NotFoundException('Không tìm thấy phòng chat.');

    const roomType = room.type as RoomType;
    if (roomType === RoomType.CLUB && room.communityId) {
      await this.assertClubMember(room.communityId, userId);
    } else if (roomType === RoomType.DIRECT) {
      await this.assertDirectRoomAccess(userId, roomId);
    } else if (!(await this.chatRepository.isMemberOfRoom(roomId, userId))) {
      throw new ForbiddenException('Bạn không có quyền xem tin nhắn được ghim.');
    }

    return this.chatRepository.getPinnedMessage(roomId);
  }

  async toggleReaction(userId: string, messageId: string, emoji: string) {
    const message = await this.chatRepository.findMessageById(messageId);
    if (!message) throw new NotFoundException('Không tìm thấy tin nhắn.');

    const room = await this.chatRepository.findRoomById(message.roomId);
    if (!room) throw new NotFoundException('Không tìm thấy phòng chat.');

    const roomType = room.type as RoomType;
    if (roomType === RoomType.CLUB && room.communityId) {
      await this.assertClubMember(room.communityId, userId);
    } else if (roomType === RoomType.DIRECT) {
      await this.assertDirectRoomAccess(userId, message.roomId);
    } else if (!(await this.chatRepository.isMemberOfRoom(message.roomId, userId))) {
      throw new ForbiddenException('Bạn không có quyền thả cảm xúc trong phòng này.');
    }

    const reactions = await this.chatRepository.toggleReaction(messageId, userId, emoji);
    this.chatGateway.broadcastMessageReaction(message.roomId, messageId, userId, emoji, reactions);
    return { reactions };
  }

  async updateClubRoomSettings(userId: string, roomId: string, data: { name?: string; clubAvatar?: string; isAnnouncementOnly?: boolean; slowModeSeconds?: number }) {
    const room = await this.chatRepository.findRoomById(roomId);
    const roomType = room?.type as RoomType;
    if (!room || roomType !== RoomType.CLUB || !room.communityId) {
      throw new NotFoundException('Phòng chat CLB không tồn tại.');
    }

    const role = await this.chatRepository.getCommunityRole(room.communityId, userId);
    if (role !== 'OWNER' && role !== 'ADMIN') {
      throw new ForbiddenException('Chỉ Chủ nhiệm hoặc Quản trị viên mới có thể đổi cài đặt phòng chat.');
    }

    const updated = await this.chatRepository.updateClubRoomSettings(roomId, data);
    this.chatGateway.broadcastRoomUpdated(roomId, updated);
    return updated;
  }

  async markRoomRead(userId: string, roomId: string) {
    await this.getMessages(userId, roomId, 1);
    const state = await this.chatRepository.markRead(roomId, userId);
    const readAt = state?.lastReadAt ? new Date(state.lastReadAt).toISOString() : new Date().toISOString();
    this.chatGateway.broadcastRoomRead(roomId, userId, readAt);
    return state;
  }

  async getUnreadCount(userId: string, roomId: string) {
    await this.getMessages(userId, roomId, 1);
    return { count: await this.chatRepository.countUnreadUsingState(roomId, userId) };
  }

  async blockUser(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) throw new BadRequestException('Không thể tự chặn chính mình.');
    if (!(await this.chatRepository.isActiveUser(blockedId))) {
      throw new NotFoundException('Không tìm thấy người dùng để chặn.');
    }
    return this.chatRepository.createBlock(blockerId, blockedId);
  }

  async unblockUser(blockerId: string, blockedId: string) {
    return { success: await this.chatRepository.deleteBlock(blockerId, blockedId) };
  }

  async getBlockedUsers(blockerId: string) {
    return this.chatRepository.getBlocks(blockerId);
  }

  async getMySupportConversation(userId: string) {
    const room = await this.chatRepository.findSupportRoomForUser(userId);
    if (!room) return null;
    return {
      ...room,
      messages: await this.chatRepository.getMessagesByRoom(room.id),
    };
  }

  async openSupportConversation(
    userId: string,
    data: CreateSupportConversationDto,
  ) {
    let room = await this.chatRepository.findSupportRoomForUser(userId);
    if (!room) {
      room = await this.chatRepository.createRoomWithMembers({
        name: 'Hỗ trợ người dùng',
        type: RoomType.SUPPORT,
        memberIds: [userId],
      });
    }

    const messageText = data.messageText?.trim();
    if (messageText) {
      const message = await this.chatRepository.saveMessage(userId, {
        roomId: room.id,
        messageText,
      });
      this.chatGateway.broadcastSupportMessage(room.id, message);
    }

    return {
      ...room,
      messages: await this.chatRepository.getMessagesByRoom(room.id),
    };
  }

  async getAdminSupportRooms() {
    return this.chatRepository.getSupportRooms();
  }

  async getAdminSupportMessages(roomId: string) {
    await this.ensureSupportRoom(roomId);
    return this.chatRepository.getMessagesByRoom(roomId);
  }

  async markAdminSupportRoomRead(roomId: string) {
    await this.ensureSupportRoom(roomId);
    await this.chatRepository.markSupportRoomRead(roomId);
    this.chatGateway.broadcastSupportRead(roomId);
    return { success: true };
  }

  async sendAdminSupportMessage(
    adminId: string,
    roomId: string,
    messageText: string,
  ) {
    await this.ensureSupportRoom(roomId);
    const content = messageText.trim();
    if (!content) {
      throw new BadRequestException('Nội dung tin nhắn không được để trống.');
    }
    const message = await this.chatRepository.saveMessage(adminId, {
      roomId,
      messageText: content,
    });
    this.chatGateway.broadcastSupportMessage(roomId, message);
    return message;
  }

  async votePoll(userId: string, messageId: string, optionId: string) {
    const result = await this.chatRepository.votePoll(userId, messageId, optionId);
    this.chatGateway.broadcastPollVoted(result.roomId, result.messageId, result.metadata);
    return result;
  }

  async getLinkPreview(url: string) {
    if (!url) {
      throw new BadRequestException('URL không được để trống.');
    }
    const preview = await extractLinkPreview(url);
    return { data: preview };
  }

  private async ensureSupportRoom(roomId: string) {
    const room = await this.chatRepository.findRoomById(roomId);
    const roomType = room?.type as RoomType;
    if (!room || roomType !== RoomType.SUPPORT) {
      throw new NotFoundException('Không tìm thấy cuộc hội thoại hỗ trợ.');
    }
    return room;
  }
}
