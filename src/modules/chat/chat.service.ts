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

    if (!data.memberIds.includes(userId)) {
      data.memberIds.push(userId);
    }
    
    if (data.type === 'DIRECT' && data.memberIds.length !== 2) {
      throw new BadRequestException('Direct room must have exactly 2 members');
    }

    return this.chatRepository.createRoomWithMembers(data);
  }

  async sendMessage(userId: string, data: CreateMessageDto) {
    const isMember = await this.chatRepository.isMemberOfRoom(data.roomId, userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this chat room');
    }

    const message = await this.chatRepository.saveMessage(userId, data);
    
    // Broadcast the message
    this.chatGateway.broadcastMessage(data.roomId, message);
    
    return message;
  }

  async getMessages(userId: string, roomId: string) {
    const isMember = await this.chatRepository.isMemberOfRoom(roomId, userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this chat room');
    }

    return this.chatRepository.getMessagesByRoom(roomId);
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
