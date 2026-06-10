import { Injectable, Inject } from '@nestjs/common';
import { PG_CONNECTION } from '../../database/database.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../database/schema';
import { eq, and, sql } from 'drizzle-orm';
import { CreateRoomDto } from './dto/create-room.dto';
import { CreateMessageDto } from './dto/create-message.dto';

@Injectable()
export class ChatRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async getUserRooms(userId: string) {
    const roomsWithMembership = await this.db
      .select({
        id: schema.chatRooms.id,
        name: schema.chatRooms.name,
        type: schema.chatRooms.type,
        createdAt: schema.chatRooms.createdAt,
      })
      .from(schema.chatRoomMembers)
      .innerJoin(schema.chatRooms, eq(schema.chatRoomMembers.roomId, schema.chatRooms.id))
      .where(eq(schema.chatRoomMembers.userId, userId));

    if (roomsWithMembership.length === 0) return [];

    const roomsList: {
      id: string;
      name: string | null;
      type: string;
      createdAt: Date;
      participants: { id: string; fullName: string | null; avatarUrl: string | null }[];
      lastMessage?: {
        id: string;
        senderId: string | null;
        sender: { id: string | null; fullName: string; avatarUrl?: string };
        content: string;
        createdAt: string;
      };
      updatedAt: string;
    }[] = [];

    for (const room of roomsWithMembership) {
      // Get participants
      const participants = await this.db
        .select({
          id: schema.users.id,
          fullName: schema.profiles.fullName,
          avatarUrl: schema.profiles.avatarUrl,
        })
        .from(schema.chatRoomMembers)
        .innerJoin(schema.users, eq(schema.chatRoomMembers.userId, schema.users.id))
        .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
        .where(eq(schema.chatRoomMembers.roomId, room.id));

      // Get last message
      const [lastMessage] = await this.db
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
        .where(eq(schema.chatMessages.roomId, room.id))
        .orderBy(sql`${schema.chatMessages.createdAt} DESC`)
        .limit(1);

      roomsList.push({
        ...room,
        participants,
        lastMessage: lastMessage ? {
          id: lastMessage.id,
          senderId: lastMessage.senderId,
          sender: {
            id: lastMessage.senderId,
            fullName: lastMessage.senderName || '',
            avatarUrl: lastMessage.senderAvatar || undefined,
          },
          content: lastMessage.messageText || '',
          createdAt: lastMessage.createdAt.toISOString(),
        } : undefined,
        updatedAt: lastMessage ? lastMessage.createdAt.toISOString() : room.createdAt.toISOString(),
      });
    }

    roomsList.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return roomsList;
  }

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
