import { Injectable, Inject } from '@nestjs/common';
import { PG_CONNECTION } from '../../database/database.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../database/schema';
import { eq, and } from 'drizzle-orm';
import { CreateRoomDto } from './dto/create-room.dto';
import { CreateMessageDto } from './dto/create-message.dto';

@Injectable()
export class ChatRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async createRoomWithMembers(data: CreateRoomDto) {
    return await this.db.transaction(async (tx) => {
      const [room] = await tx
        .insert(schema.chatRooms)
        .values({
          name: data.name,
          type: data.type,
        })
        .returning();

      if (data.memberIds && data.memberIds.length > 0) {
        const membersData = data.memberIds.map((userId) => ({
          roomId: room.id,
          userId,
        }));
        await tx.insert(schema.chatRoomMembers).values(membersData);
      }

      return room;
    });
  }

  async isMemberOfRoom(roomId: string, userId: string) {
    const [record] = await this.db
      .select()
      .from(schema.chatRoomMembers)
      .where(
        and(
          eq(schema.chatRoomMembers.roomId, roomId),
          eq(schema.chatRoomMembers.userId, userId),
        ),
      )
      .limit(1);
    return !!record;
  }

  async saveMessage(senderId: string, data: CreateMessageDto) {
    const [record] = await this.db
      .insert(schema.chatMessages)
      .values({
        roomId: data.roomId,
        senderId,
        messageText: data.messageText,
        attachmentsUrls: data.attachmentsUrls || [],
      })
      .returning();
    return record;
  }

  async getMessagesByRoom(roomId: string, limit: number = 50) {
    const result = await this.db
      .select({
        id: schema.chatMessages.id,
        roomId: schema.chatMessages.roomId,
        senderId: schema.chatMessages.senderId,
        messageText: schema.chatMessages.messageText,
        attachmentsUrls: schema.chatMessages.attachmentsUrls,
        isRead: schema.chatMessages.isRead,
        createdAt: schema.chatMessages.createdAt,
        senderName: schema.profiles.fullName,
        senderAvatar: schema.profiles.avatarUrl,
      })
      .from(schema.chatMessages)
      .leftJoin(schema.profiles, eq(schema.chatMessages.senderId, schema.profiles.userId))
      .where(eq(schema.chatMessages.roomId, roomId))
      .limit(limit);

    return result;
  }
}
