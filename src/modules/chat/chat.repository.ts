import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import { eq, and, sql, asc, desc, inArray, lt, or, type SQL } from 'drizzle-orm';
import { CursorPaginationHelper } from '../../common/helpers/cursor-pagination.helper';
import { CreateRoomDto } from './dto/create-room.dto';
import { CreateMessageDto } from './dto/create-message.dto';

@Injectable()
export class ChatRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
  ) {}

  async getUserRooms(userId: string) {
    // 1. Direct and Group rooms where user is an explicit member
    const directAndGroupRooms = await this.db
      .select({
        id: schema.chatRooms.id,
        name: schema.chatRooms.name,
        type: schema.chatRooms.type,
        communityId: schema.chatRooms.communityId,
        clubName: schema.chatRooms.clubName,
        clubAvatar: schema.chatRooms.clubAvatar,
        communityName: schema.communities.name,
        communityLogo: schema.communities.logoUrl,
        createdAt: schema.chatRooms.createdAt,
      })
      .from(schema.chatRoomMembers)
      .innerJoin(schema.chatRooms, eq(schema.chatRoomMembers.roomId, schema.chatRooms.id))
      .leftJoin(schema.communities, eq(schema.chatRooms.communityId, schema.communities.id))
      .where(eq(schema.chatRoomMembers.userId, userId));

    // 2. Club rooms where user is a JOINED community member
    const clubRooms = await this.db
      .select({
        id: schema.chatRooms.id,
        name: schema.chatRooms.name,
        type: schema.chatRooms.type,
        communityId: schema.chatRooms.communityId,
        clubName: schema.chatRooms.clubName,
        clubAvatar: schema.chatRooms.clubAvatar,
        communityName: schema.communities.name,
        communityLogo: schema.communities.logoUrl,
        createdAt: schema.chatRooms.createdAt,
      })
      .from(schema.communityMembers)
      .innerJoin(schema.chatRooms, and(eq(schema.chatRooms.communityId, schema.communityMembers.communityId), eq(schema.chatRooms.type, 'CLUB')))
      .leftJoin(schema.communities, eq(schema.chatRooms.communityId, schema.communities.id))
      .where(and(eq(schema.communityMembers.userId, userId), eq(schema.communityMembers.status, 'JOINED')));

    // Deduplicate rooms
    const allRoomMap = new Map<string, typeof directAndGroupRooms[0]>();
    for (const r of directAndGroupRooms) allRoomMap.set(r.id, r);
    for (const r of clubRooms) allRoomMap.set(r.id, r);

    const roomsWithMembership = Array.from(allRoomMap.values());
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
      unreadCount: number;
      communityId: string | null;
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

      const nowIso = new Date().toISOString();
      const lastMsgDateIso = lastMessage?.createdAt
        ? (lastMessage.createdAt instanceof Date ? lastMessage.createdAt.toISOString() : new Date(lastMessage.createdAt).toISOString())
        : null;
      const roomCreatedDateIso = room.createdAt
        ? (room.createdAt instanceof Date ? room.createdAt.toISOString() : new Date(room.createdAt).toISOString())
        : nowIso;

      let unread = 0;
      try {
        unread = await this.countUnreadUsingState(room.id, userId);
      } catch {
        unread = 0;
      }

      roomsList.push({
        ...room,
        unreadCount: unread,
        participants,
        lastMessage: lastMessage
          ? {
              id: lastMessage.id,
              senderId: lastMessage.senderId,
              sender: {
                id: lastMessage.senderId,
                fullName: lastMessage.senderName || '',
                avatarUrl: lastMessage.senderAvatar || undefined,
              },
              content: lastMessage.messageText || '',
              createdAt: lastMsgDateIso || nowIso,
            }
          : undefined,
        updatedAt: lastMsgDateIso || roomCreatedDateIso,
      });
    }

    roomsList.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

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

  async getRoomMemberIds(roomId: string) {
    const rows = await this.db.select({ userId: schema.chatRoomMembers.userId })
      .from(schema.chatRoomMembers)
      .where(eq(schema.chatRoomMembers.roomId, roomId));
    return rows.map((row) => row.userId);
  }

  async isActiveUser(userId: string) {
    const [user] = await this.db.select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.id, userId), sql`${schema.users.deletedAt} IS NULL`))
      .limit(1);
    return !!user;
  }

  async isBlockedBetween(firstUserId: string, secondUserId: string) {
    const [record] = await this.db
      .select({ id: schema.chatBlocks.id })
      .from(schema.chatBlocks)
      .where(or(
        and(eq(schema.chatBlocks.blockerId, firstUserId), eq(schema.chatBlocks.blockedId, secondUserId)),
        and(eq(schema.chatBlocks.blockerId, secondUserId), eq(schema.chatBlocks.blockedId, firstUserId)),
      ))
      .limit(1);
    return !!record;
  }

  async createBlock(blockerId: string, blockedId: string) {
    const [record] = await this.db
      .insert(schema.chatBlocks)
      .values({ blockerId, blockedId })
      .onConflictDoNothing({ target: [schema.chatBlocks.blockerId, schema.chatBlocks.blockedId] })
      .returning();
    return record ?? (await this.db.select().from(schema.chatBlocks).where(and(
      eq(schema.chatBlocks.blockerId, blockerId), eq(schema.chatBlocks.blockedId, blockedId),
    )).limit(1))[0];
  }

  async deleteBlock(blockerId: string, blockedId: string) {
    const deleted = await this.db.delete(schema.chatBlocks).where(and(
      eq(schema.chatBlocks.blockerId, blockerId), eq(schema.chatBlocks.blockedId, blockedId),
    )).returning({ id: schema.chatBlocks.id });
    return deleted.length > 0;
  }

  async getBlocks(blockerId: string) {
    return this.db.select({
      id: schema.chatBlocks.id,
      blockedId: schema.chatBlocks.blockedId,
      createdAt: schema.chatBlocks.createdAt,
      fullName: schema.profiles.fullName,
      avatarUrl: schema.profiles.avatarUrl,
    }).from(schema.chatBlocks)
      .innerJoin(schema.users, eq(schema.chatBlocks.blockedId, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.chatBlocks.blockedId, schema.profiles.userId))
      .where(eq(schema.chatBlocks.blockerId, blockerId))
      .orderBy(desc(schema.chatBlocks.createdAt));
  }

  /**
   * P2D.1 — Member của cộng đồng (dùng cho guard kênh chat CLUB).
   */
  async findCommunityMember(communityId: string, userId: string) {
    const [member] = await this.db
      .select()
      .from(schema.communityMembers)
      .where(
        and(
          eq(schema.communityMembers.communityId, communityId),
          eq(schema.communityMembers.userId, userId),
        ),
      )
      .limit(1);
    return member;
  }

  /**
   * P2D.1 — Kiểm tra quyền truy cập phòng: room CLUB kiểm tra qua community_members
   * (status JOINED, membership động), các loại phòng khác qua chat_room_members như cũ.
   */
  async canAccessRoom(roomId: string, userId: string) {
    const room = await this.findRoomById(roomId);
    if (!room) return false;
    if (room.type === 'CLUB' && room.communityId) {
      if (!(await this.isClubChatEnabled(room.communityId))) return false;
      const member = await this.findCommunityMember(room.communityId, userId);
      return member?.status === 'JOINED';
    }
    return this.isMemberOfRoom(roomId, userId);
  }

  async isClubChatEnabled(communityId: string) {
    const [settings] = await this.db
      .select({ chatEnabled: schema.communitySocialSettings.chatEnabled })
      .from(schema.communitySocialSettings)
      .where(eq(schema.communitySocialSettings.communityId, communityId))
      .limit(1);
    return settings?.chatEnabled ?? true;
  }

  /**
   * P2D.1 — Lazy-create room CLUB theo cộng đồng (unique theo communityId + type=CLUB).
   * Denormalize clubName/clubAvatar (snapshot lúc tạo room). Không transaction bao ngoài:
   * insert đơn là atomic, unique index bảo vệ race (23505 → đọc lại room đã có).
   */
  async getOrCreateClubRoom(communityId: string) {
    const [existing] = await this.db
      .select()
      .from(schema.chatRooms)
      .where(
        and(
          eq(schema.chatRooms.communityId, communityId),
          eq(schema.chatRooms.type, 'CLUB'),
        ),
      )
      .limit(1);
    if (existing) return existing;

    const [community] = await this.db
      .select({
        id: schema.communities.id,
        name: schema.communities.name,
        logoUrl: schema.communities.logoUrl,
      })
      .from(schema.communities)
      .where(eq(schema.communities.id, communityId))
      .limit(1);
    if (!community) {
      throw new NotFoundException('Community not found');
    }

    try {
      const [room] = await this.db
        .insert(schema.chatRooms)
        .values({
          name: community.name,
          type: 'CLUB',
          communityId: community.id,
          clubName: community.name,
          clubAvatar: community.logoUrl,
        })
        .returning();
      return room;
    } catch (err) {
      // Race: 2 request tạo cùng lúc → unique violation (23505) → đọc lại room đã tồn tại.
      if ((err as { code?: string })?.code === '23505') {
        const [room] = await this.db
          .select()
          .from(schema.chatRooms)
          .where(
            and(
              eq(schema.chatRooms.communityId, communityId),
              eq(schema.chatRooms.type, 'CLUB'),
            ),
          )
          .limit(1);
        if (room) return room;
      }
      throw err;
    }
  }

  /**
   * P2D.1 — Danh sách member JOINED của cộng đồng cho kênh chat CLUB.
   */
  async getClubRoomMembers(communityId: string) {
    return this.db
      .select({
        id: schema.users.id,
        fullName: schema.profiles.fullName,
        avatarUrl: schema.profiles.avatarUrl,
        role: schema.communityMembers.role,
        tags: schema.communityMembers.tags,
      })
      .from(schema.communityMembers)
      .innerJoin(schema.users, eq(schema.communityMembers.userId, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(
        and(
          eq(schema.communityMembers.communityId, communityId),
          eq(schema.communityMembers.status, 'JOINED'),
        ),
      )
      .orderBy(asc(schema.communityMembers.joinedAt));
  }

  /**
   * P2D.1 — Tags của member trong cộng đồng (gắn vào payload message CLUB).
   */
  async getMemberTags(communityId: string, userId: string) {
    const [member] = await this.db
      .select({ tags: schema.communityMembers.tags })
      .from(schema.communityMembers)
      .where(
        and(
          eq(schema.communityMembers.communityId, communityId),
          eq(schema.communityMembers.userId, userId),
        ),
      )
      .limit(1);
    return member?.tags ?? [];
  }

  async saveMessage(senderId: string, data: CreateMessageDto) {
    const [record] = await this.db
      .insert(schema.chatMessages)
      .values({
        roomId: data.roomId,
        senderId,
        messageText: data.messageText,
        attachmentsUrls: data.attachmentsUrls || [],
        replyToId: data.replyToId || null,
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

    let replyTo: { id: string; senderName: string; text: string } | null = null;
    if (data.replyToId) {
      const [replyMsg] = await this.db
        .select({
          id: schema.chatMessages.id,
          messageText: schema.chatMessages.messageText,
          senderName: sql<string>`COALESCE(NULLIF(TRIM(${schema.profiles.fullName}), ''), SPLIT_PART(${schema.users.email}, '@', 1), 'Thành viên')`,
        })
        .from(schema.chatMessages)
        .leftJoin(schema.users, eq(schema.chatMessages.senderId, schema.users.id))
        .leftJoin(schema.profiles, eq(schema.chatMessages.senderId, schema.profiles.userId))
        .where(eq(schema.chatMessages.id, data.replyToId))
        .limit(1);

      if (replyMsg) {
        replyTo = {
          id: replyMsg.id,
          senderName: replyMsg.senderName,
          text: replyMsg.messageText || '',
        };
      }
    }

    const displayName = prof?.fullName?.trim() || prof?.email?.split('@')[0] || 'Thành viên';

    return {
      ...record,
      senderName: displayName,
      senderAvatar: prof?.avatarUrl || null,
      senderAvatarUrl: prof?.avatarUrl || null,
      replyTo,
      reactions: [],
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
        isRevoked: schema.chatMessages.isRevoked,
        isPinned: schema.chatMessages.isPinned,
        replyToId: schema.chatMessages.replyToId,
        createdAt: schema.chatMessages.createdAt,
        senderName: sql<string>`COALESCE(NULLIF(TRIM(${schema.profiles.fullName}), ''), SPLIT_PART(${schema.users.email}, '@', 1), 'Thành viên')`,
        senderAvatar: schema.profiles.avatarUrl,
        senderAvatarUrl: schema.profiles.avatarUrl,
      })
      .from(schema.chatMessages)
      .innerJoin(schema.users, eq(schema.chatMessages.senderId, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.chatMessages.senderId, schema.profiles.userId))
      .where(eq(schema.chatMessages.roomId, roomId))
      .orderBy(asc(schema.chatMessages.createdAt))
      .limit(limit);

    return result;
  }

  async getMessagesPage(roomId: string, limit: number, cursor?: string) {
    const conditions: SQL[] = [eq(schema.chatMessages.roomId, roomId)];
    const decoded = cursor ? CursorPaginationHelper.decodeCursor<{ id: string; createdAt: string }>(cursor) : null;
    if (decoded?.createdAt && decoded.id) {
      conditions.push(or(lt(schema.chatMessages.createdAt, new Date(decoded.createdAt)), and(eq(schema.chatMessages.createdAt, new Date(decoded.createdAt)), lt(schema.chatMessages.id, decoded.id))) as SQL);
    }
    const rows = await this.db.select({
      id: schema.chatMessages.id,
      roomId: schema.chatMessages.roomId,
      senderId: schema.chatMessages.senderId,
      messageText: schema.chatMessages.messageText,
      attachmentsUrls: schema.chatMessages.attachmentsUrls,
      isRead: schema.chatMessages.isRead,
      isRevoked: schema.chatMessages.isRevoked,
      isPinned: schema.chatMessages.isPinned,
      replyToId: schema.chatMessages.replyToId,
      createdAt: schema.chatMessages.createdAt,
      senderName: sql<string>`COALESCE(NULLIF(TRIM(${schema.profiles.fullName}), ''), SPLIT_PART(${schema.users.email}, '@', 1), 'Sporto Player')`,
      senderAvatar: schema.profiles.avatarUrl,
      senderAvatarUrl: schema.profiles.avatarUrl,
    }).from(schema.chatMessages).innerJoin(schema.users, eq(schema.chatMessages.senderId, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.chatMessages.senderId, schema.profiles.userId)).where(and(...conditions))
      .orderBy(desc(schema.chatMessages.createdAt), desc(schema.chatMessages.id)).limit(limit + 1);

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const messageIds = data.map((m) => m.id);

    // Batch load reactions for all messages in page
    const reactionsMap = new Map<string, string[]>();
    if (messageIds.length > 0) {
      const rxRows = await this.db
        .select({
          messageId: schema.chatMessageReactions.messageId,
          emoji: schema.chatMessageReactions.emoji,
        })
        .from(schema.chatMessageReactions)
        .where(inArray(schema.chatMessageReactions.messageId, messageIds));

      for (const rx of rxRows) {
        const arr = reactionsMap.get(rx.messageId) || [];
        arr.push(rx.emoji);
        reactionsMap.set(rx.messageId, arr);
      }
    }

    // Batch load replyTo metadata
    const replyIds = data.map((m) => m.replyToId).filter(Boolean) as string[];
    const replyMap = new Map<string, { id: string; senderName: string; text: string }>();
    if (replyIds.length > 0) {
      const replies = await this.db
        .select({
          id: schema.chatMessages.id,
          messageText: schema.chatMessages.messageText,
          senderName: sql<string>`COALESCE(NULLIF(TRIM(${schema.profiles.fullName}), ''), SPLIT_PART(${schema.users.email}, '@', 1), 'Thành viên')`,
        })
        .from(schema.chatMessages)
        .leftJoin(schema.users, eq(schema.chatMessages.senderId, schema.users.id))
        .leftJoin(schema.profiles, eq(schema.chatMessages.senderId, schema.profiles.userId))
        .where(inArray(schema.chatMessages.id, replyIds));

      for (const rep of replies) {
        replyMap.set(rep.id, {
          id: rep.id,
          senderName: rep.senderName,
          text: rep.messageText || '',
        });
      }
    }

    const populated = data.map((msg) => ({
      ...msg,
      reactions: reactionsMap.get(msg.id) || [],
      replyTo: msg.replyToId ? replyMap.get(msg.replyToId) || null : null,
    }));

    const last = populated[populated.length - 1];
    return {
      data: populated.reverse(),
      meta: {
        limit,
        hasMore,
        nextCursor: hasMore && last ? CursorPaginationHelper.encodeCursor({ id: last.id, createdAt: last.createdAt }) : null,
      },
    };
  }

  async findMessageById(messageId: string) {
    const [msg] = await this.db
      .select()
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.id, messageId))
      .limit(1);
    return msg ?? null;
  }

  async revokeMessage(messageId: string, revokedById: string) {
    const now = new Date();
    const [updated] = await this.db
      .update(schema.chatMessages)
      .set({
        isRevoked: true,
        revokedBy: revokedById,
        revokedAt: now,
      })
      .where(eq(schema.chatMessages.id, messageId))
      .returning();
    return updated;
  }

  async pinMessage(roomId: string, messageId: string, pinnedById: string) {
    const now = new Date();
    await this.db
      .update(schema.chatMessages)
      .set({ isPinned: true, pinnedBy: pinnedById, pinnedAt: now })
      .where(eq(schema.chatMessages.id, messageId));

    await this.db
      .update(schema.chatRooms)
      .set({ pinnedMessageId: messageId })
      .where(eq(schema.chatRooms.id, roomId));

    return { success: true, messageId, pinnedAt: now };
  }

  async unpinMessage(roomId: string, messageId: string) {
    await this.db
      .update(schema.chatMessages)
      .set({ isPinned: false, pinnedBy: null, pinnedAt: null })
      .where(eq(schema.chatMessages.id, messageId));

    const [room] = await this.db
      .select({ pinnedMessageId: schema.chatRooms.pinnedMessageId })
      .from(schema.chatRooms)
      .where(eq(schema.chatRooms.id, roomId))
      .limit(1);

    if (room?.pinnedMessageId === messageId) {
      await this.db
        .update(schema.chatRooms)
        .set({ pinnedMessageId: null })
        .where(eq(schema.chatRooms.id, roomId));
    }

    return { success: true, messageId };
  }

  async getPinnedMessage(roomId: string) {
    const [room] = await this.db
      .select({ pinnedMessageId: schema.chatRooms.pinnedMessageId })
      .from(schema.chatRooms)
      .where(eq(schema.chatRooms.id, roomId))
      .limit(1);

    if (!room?.pinnedMessageId) return null;

    const [pinned] = await this.db
      .select({
        id: schema.chatMessages.id,
        roomId: schema.chatMessages.roomId,
        messageText: schema.chatMessages.messageText,
        attachmentsUrls: schema.chatMessages.attachmentsUrls,
        createdAt: schema.chatMessages.createdAt,
        senderName: sql<string>`COALESCE(NULLIF(TRIM(${schema.profiles.fullName}), ''), SPLIT_PART(${schema.users.email}, '@', 1), 'Thành viên')`,
        senderAvatar: schema.profiles.avatarUrl,
      })
      .from(schema.chatMessages)
      .leftJoin(schema.users, eq(schema.chatMessages.senderId, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.chatMessages.senderId, schema.profiles.userId))
      .where(eq(schema.chatMessages.id, room.pinnedMessageId))
      .limit(1);

    return pinned ?? null;
  }

  async toggleReaction(messageId: string, userId: string, emoji: string) {
    const [existing] = await this.db
      .select()
      .from(schema.chatMessageReactions)
      .where(
        and(
          eq(schema.chatMessageReactions.messageId, messageId),
          eq(schema.chatMessageReactions.userId, userId),
          eq(schema.chatMessageReactions.emoji, emoji),
        ),
      )
      .limit(1);

    if (existing) {
      await this.db
        .delete(schema.chatMessageReactions)
        .where(eq(schema.chatMessageReactions.id, existing.id));
    } else {
      await this.db.insert(schema.chatMessageReactions).values({
        messageId,
        userId,
        emoji,
      });
    }

    const rxRows = await this.db
      .select({ emoji: schema.chatMessageReactions.emoji })
      .from(schema.chatMessageReactions)
      .where(eq(schema.chatMessageReactions.messageId, messageId));

    return rxRows.map((r) => r.emoji);
  }

  async updateClubRoomSettings(roomId: string, data: { name?: string; clubAvatar?: string; isAnnouncementOnly?: boolean; slowModeSeconds?: number }) {
    const [updated] = await this.db
      .update(schema.chatRooms)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.clubAvatar !== undefined ? { clubAvatar: data.clubAvatar } : {}),
        ...(data.isAnnouncementOnly !== undefined ? { isAnnouncementOnly: data.isAnnouncementOnly } : {}),
        ...(data.slowModeSeconds !== undefined ? { slowModeSeconds: data.slowModeSeconds } : {}),
      })
      .where(eq(schema.chatRooms.id, roomId))
      .returning();
    return updated;
  }

  async getCommunityRole(communityId: string, userId: string) {
    const [member] = await this.db
      .select({ role: schema.communityMembers.role, status: schema.communityMembers.status })
      .from(schema.communityMembers)
      .where(
        and(
          eq(schema.communityMembers.communityId, communityId),
          eq(schema.communityMembers.userId, userId),
        ),
      )
      .limit(1);

    if (!member || member.status !== 'JOINED') return null;
    return member.role as 'OWNER' | 'ADMIN' | 'MODERATOR' | 'MEMBER';
  }

  async countUnreadForUser(roomId: string, userId: string, lastReadAt?: Date | null) {
    const conditions: SQL[] = [
      eq(schema.chatMessages.roomId, roomId),
      sql`${schema.chatMessages.senderId} <> ${userId}`,
    ];
    if (lastReadAt) conditions.push(sql`${schema.chatMessages.createdAt} > ${lastReadAt}`);
    const [result] = await this.db.select({ count: sql<number>`count(*)` })
      .from(schema.chatMessages)
      .where(and(...conditions));
    return Number(result?.count ?? 0);
  }

  async getReadState(roomId: string, userId: string) {
    const [state] = await this.db.select().from(schema.chatReadStates)
      .where(and(eq(schema.chatReadStates.roomId, roomId), eq(schema.chatReadStates.userId, userId))).limit(1);
    return state ?? null;
  }

  async markRead(roomId: string, userId: string) {
    const now = new Date();
    const [state] = await this.db.insert(schema.chatReadStates)
      .values({ roomId, userId, lastReadAt: now })
      .onConflictDoUpdate({ target: [schema.chatReadStates.roomId, schema.chatReadStates.userId], set: { lastReadAt: now } })
      .returning();
    return state;
  }

  async countUnreadUsingState(roomId: string, userId: string) {
    try {
      const state = await this.getReadState(roomId, userId);
      return await this.countUnreadForUser(roomId, userId, state?.lastReadAt ?? null);
    } catch {
      return 0;
    }
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

    const nowIso = new Date().toISOString();
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

        const lastMsgDateIso = lastMessage?.createdAt
          ? (lastMessage.createdAt instanceof Date ? lastMessage.createdAt.toISOString() : new Date(lastMessage.createdAt).toISOString())
          : null;
        const roomCreatedDateIso = room.createdAt
          ? (room.createdAt instanceof Date ? room.createdAt.toISOString() : new Date(room.createdAt).toISOString())
          : nowIso;

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
                createdAt: lastMsgDateIso || nowIso,
              }
            : null,
          updatedAt: lastMsgDateIso || roomCreatedDateIso,
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
