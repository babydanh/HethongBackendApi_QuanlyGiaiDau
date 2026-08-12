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

@Injectable()
export class ChatService {
  constructor(
    private readonly chatRepository: ChatRepository,
    private readonly chatGateway: ChatGateway,
  ) {}

  async getUserRooms(userId: string) {
    return this.chatRepository.getUserRooms(userId);
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

    if (!data.memberIds.includes(userId)) {
      data.memberIds.push(userId);
    }
    
    
    if (data.type === 'DIRECT' && data.memberIds.length !== 2) {
      throw new BadRequestException('Direct room must have exactly 2 members');
    }

    return this.chatRepository.createRoomWithMembers(data);
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
    const room = await this.chatRepository.findRoomById(data.roomId);
    if (!room) {
      throw new NotFoundException('Không tìm thấy phòng chat.');
    }

    // P2D.1: room CLUB guard qua membership cộng đồng (JOINED), các loại khác qua chat_room_members.
    const roomType = room.type as RoomType;
    if (roomType === RoomType.CLUB && room.communityId) {
      await this.assertClubMember(room.communityId, userId);
    } else {
      const isMember = await this.chatRepository.isMemberOfRoom(
        data.roomId,
        userId,
      );
      if (!isMember) {
        throw new ForbiddenException('You are not a member of this chat room');
      }
    }

    const message = await this.chatRepository.saveMessage(userId, data);

    if (roomType === RoomType.SUPPORT) {
      this.chatGateway.broadcastSupportMessage(data.roomId, message);
    } else if (roomType === RoomType.CLUB && room.communityId) {
      // P2D.1: payload kèm tags của sender tại thời điểm gửi (denormalized, client không cần join lại).
      const senderTags = await this.chatRepository.getMemberTags(
        room.communityId,
        userId,
      );
      this.chatGateway.broadcastClubMessage(data.roomId, {
        ...message,
        senderTags,
      });
    } else {
      this.chatGateway.broadcastMessage(data.roomId, message);
    }

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
    }

    return this.chatRepository.getMessagesPage(roomId, limit, cursor);
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

  private async ensureSupportRoom(roomId: string) {
    const room = await this.chatRepository.findRoomById(roomId);
    if (!room || room.type !== RoomType.SUPPORT) {
      throw new NotFoundException('Không tìm thấy cuộc hội thoại hỗ trợ.');
    }
    return room;
  }
}
