import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ChatRepository } from './chat.repository';
import { CreateRoomDto } from './dto/create-room.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { ChatGateway } from './chat.gateway';

@Injectable()
export class ChatService {
  constructor(
    private readonly chatRepository: ChatRepository,
    private readonly chatGateway: ChatGateway,
  ) {}

  async createRoom(userId: string, data: CreateRoomDto) {
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
}
