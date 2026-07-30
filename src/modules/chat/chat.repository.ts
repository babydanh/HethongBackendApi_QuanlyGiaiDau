import { Injectable, Inject } from '@nestjs/common';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import { eq, and, sql, asc, inArray } from 'drizzle-orm';
import { CreateRoomDto } from './dto/create-room.dto';
import { CreateMessageDto } from './dto/create-message.dto';

@Injectable()
export class ChatRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
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

    const [prof] = await this.db
      .select({
        fullName: schema.profiles.fullName,
        avatarUrl: schema.profiles.avatarUrl,
        email: schema.users.email,
      })
      .from(schema.users)
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(eq(schema.users.id, senderId))
      .limit(1);

    const displayName = prof?.fullName?.trim() || prof?.email?.split('@')[0] || 'VNDC Player';

    return {
      ...record,
      senderName: displayName,
      senderAvatar: prof?.avatarUrl || null,
    };
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
        senderName: sql<string>`COALESCE(NULLIF(TRIM(${schema.profiles.fullName}), ''), SPLIT_PART(${schema.users.email}, '@', 1), 'VNDC Player')`,
        senderAvatar: schema.profiles.avatarUrl,
      })
      .from(schema.chatMessages)
      .innerJoin(schema.users, eq(schema.chatMessages.senderId, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.chatMessages.senderId, schema.profiles.userId))
      .where(eq(schema.chatMessages.roomId, roomId))
      .orderBy(asc(schema.chatMessages.createdAt))
      .limit(limit);

    return result;
  }

  async findSupportRoomForUser(userId: string) {
    const [room] = await this.db
      .select({
        id: schema.chatRooms.id,
        name: schema.chatRooms.name,
        type: schema.chatRooms.type,
        createdAt: schema.chatRooms.createdAt,
      })
      .from(schema.chatRoomMembers)
      .innerJoin(schema.chatRooms, eq(schema.chatRoomMembers.roomId, schema.chatRooms.id))
      .where(
        and(
          eq(schema.chatRoomMembers.userId, userId),
          eq(schema.chatRooms.type, 'SUPPORT'),
        ),
      )
      .limit(1);

    return room;
  }

  async findRoomById(roomId: string) {
    const [room] = await this.db
      .select()
      .from(schema.chatRooms)
      .where(eq(schema.chatRooms.id, roomId))
      .limit(1);
    return room;
  }

  async getSupportRooms() {
    const rooms = await this.db
      .select({
        id: schema.chatRooms.id,
        name: schema.chatRooms.name,
        type: schema.chatRooms.type,
        createdAt: schema.chatRooms.createdAt,
      })
      .from(schema.chatRooms)
      .where(eq(schema.chatRooms.type, 'SUPPORT'));

    const result = await Promise.all(
      rooms.map(async (room) => {
        const participants = await this.db
          .select({
            id: schema.users.id,
            email: schema.users.email,
            fullName: schema.profiles.fullName,
            avatarUrl: schema.profiles.avatarUrl,
          })
          .from(schema.chatRoomMembers)
          .innerJoin(schema.users, eq(schema.chatRoomMembers.userId, schema.users.id))
          .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
          .where(eq(schema.chatRoomMembers.roomId, room.id));

        const [lastMessage] = await this.db
          .select({
            id: schema.chatMessages.id,
            senderId: schema.chatMessages.senderId,
            messageText: schema.chatMessages.messageText,
            createdAt: schema.chatMessages.createdAt,
            senderName: schema.profiles.fullName,
          })
          .from(schema.chatMessages)
          .leftJoin(schema.profiles, eq(schema.chatMessages.senderId, schema.profiles.userId))
          .where(eq(schema.chatMessages.roomId, room.id))
          .orderBy(sql`${schema.chatMessages.createdAt} DESC`)
          .limit(1);

        const participantIds = participants.map((participant) => participant.id);
        const [unreadResult] = participantIds.length > 0
          ? await this.db
              .select({ count: sql<number>`COUNT(*)::int` })
              .from(schema.chatMessages)
              .where(
                and(
                  eq(schema.chatMessages.roomId, room.id),
                  eq(schema.chatMessages.isRead, false),
                  inArray(schema.chatMessages.senderId, participantIds),
                ),
              )
          : [{ count: 0 }];

        return {
          ...room,
          participants,
          unreadCount: unreadResult?.count ?? 0,
          lastMessage: lastMessage
            ? {
                id: lastMessage.id,
                senderId: lastMessage.senderId,
                senderName: lastMessage.senderName,
                content: lastMessage.messageText ?? '',
                createdAt: lastMessage.createdAt.toISOString(),
              }
            : null,
          updatedAt: (lastMessage?.createdAt ?? room.createdAt).toISOString(),
        };
      }),
    );

    return result.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  async markSupportRoomRead(roomId: string) {
    const participants = await this.db
      .select({ userId: schema.chatRoomMembers.userId })
      .from(schema.chatRoomMembers)
      .where(eq(schema.chatRoomMembers.roomId, roomId));

    const participantIds = participants.map((participant) => participant.userId);
    if (participantIds.length === 0) return;

    await this.db
      .update(schema.chatMessages)
      .set({ isRead: true })
      .where(
        and(
          eq(schema.chatMessages.roomId, roomId),
          eq(schema.chatMessages.isRead, false),
          inArray(schema.chatMessages.senderId, participantIds),
        ),
      );
  }
}


