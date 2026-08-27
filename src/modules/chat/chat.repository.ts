import { Injectable, Inject, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import { eq, and, sql, asc, desc, inArray, lt, or, type SQL } from 'drizzle-orm';
import { CursorPaginationHelper } from '../../common/helpers/cursor-pagination.helper';
import { CreateRoomDto } from './dto/create-room.dto';
import { CreateMessageDto } from './dto/create-message.dto';

@Injectable()
export class ChatRepository {
  private readonly logger = new Logger(ChatRepository.name);

  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
  ) {}

  async getUserRooms(userId: string) {
    try {
      // 1. Direct and Group rooms where user is an explicit member
      let directAndGroupRooms: Array<{
        id: string;
        name: string | null;
        type: string;
        communityId: string | null;
        clubName: string | null;
        clubAvatar: string | null;
        isAnnouncementOnly: boolean;
        slowModeSeconds: number;
        pinnedMessageId: string | null;
        communityName: string | null;
        communityLogo: string | null;
        createdAt: Date;
        clearedAt: Date | null;
      }> = [];

      try {
        directAndGroupRooms = await this.db
          .select({
            id: schema.chatRooms.id,
            name: schema.chatRooms.name,
            type: schema.chatRooms.type,
            communityId: schema.chatRooms.communityId,
            clubName: schema.chatRooms.clubName,
            clubAvatar: schema.chatRooms.clubAvatar,
            isAnnouncementOnly: schema.chatRooms.isAnnouncementOnly,
            slowModeSeconds: schema.chatRooms.slowModeSeconds,
            pinnedMessageId: schema.chatRooms.pinnedMessageId,
            communityName: schema.communities.name,
            communityLogo: schema.communities.logoUrl,
            createdAt: schema.chatRooms.createdAt,
            clearedAt: schema.chatRoomMembers.clearedAt,
          })
          .from(schema.chatRoomMembers)
          .innerJoin(schema.chatRooms, eq(schema.chatRoomMembers.roomId, schema.chatRooms.id))
          .leftJoin(schema.communities, eq(schema.chatRooms.communityId, schema.communities.id))
          .where(eq(schema.chatRoomMembers.userId, userId));
      } catch (err) {
        this.logger.warn(`Failed to fetch directAndGroupRooms for ${userId}:`, err);
      }

      // 2. Club rooms where user is a JOINED community member
      let clubRooms: Array<{
        id: string;
        name: string | null;
        type: string;
        communityId: string | null;
        clubName: string | null;
        clubAvatar: string | null;
        isAnnouncementOnly: boolean;
        slowModeSeconds: number;
        pinnedMessageId: string | null;
        communityName: string | null;
        communityLogo: string | null;
        createdAt: Date;
        clearedAt: Date | null;
      }> = [];

      try {
        clubRooms = await this.db
          .select({
            id: schema.chatRooms.id,
            name: schema.chatRooms.name,
            type: schema.chatRooms.type,
            communityId: schema.chatRooms.communityId,
            clubName: schema.chatRooms.clubName,
            clubAvatar: schema.chatRooms.clubAvatar,
            isAnnouncementOnly: schema.chatRooms.isAnnouncementOnly,
            slowModeSeconds: schema.chatRooms.slowModeSeconds,
            pinnedMessageId: schema.chatRooms.pinnedMessageId,
            communityName: schema.communities.name,
            communityLogo: schema.communities.logoUrl,
            createdAt: schema.chatRooms.createdAt,
            clearedAt: schema.chatRoomMembers.clearedAt,
          })
          .from(schema.communityMembers)
          .innerJoin(schema.chatRooms, and(eq(schema.chatRooms.communityId, schema.communityMembers.communityId), eq(schema.chatRooms.type, 'CLUB')))
          .leftJoin(schema.communities, eq(schema.chatRooms.communityId, schema.communities.id))
          .leftJoin(
            schema.chatRoomMembers,
            and(
              eq(schema.chatRoomMembers.roomId, schema.chatRooms.id),
              eq(schema.chatRoomMembers.userId, userId),
            ),
          )
          .where(and(eq(schema.communityMembers.userId, userId), eq(schema.communityMembers.status, 'JOINED')));
      } catch (err) {
        this.logger.warn(`Failed to fetch clubRooms for ${userId}:`, err);
      }

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
        canSendMessages?: boolean;
        messageRestriction?: 'STRANGER' | 'BLOCKED' | null;
      }[] = [];

      for (const room of roomsWithMembership) {
        try {
          // Get participants
          let participants: { id: string; fullName: string | null; avatarUrl: string | null }[] = [];
          try {
            if (room.type === 'CLUB' && room.communityId) {
              const members = await this.getClubRoomMembers(room.communityId);
              participants = members.map((m) => ({
                id: m.id,
                fullName: m.fullName,
                avatarUrl: m.avatarUrl,
              }));
            } else {
              participants = await this.db
                .select({
                  id: schema.users.id,
                  fullName: schema.profiles.fullName,
                  avatarUrl: schema.profiles.avatarUrl,
                })
                .from(schema.chatRoomMembers)
                .innerJoin(schema.users, eq(schema.chatRoomMembers.userId, schema.users.id))
                .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
                .where(eq(schema.chatRoomMembers.roomId, room.id));
            }
          } catch (pErr) {
            this.logger.warn(`Failed to get participants for room ${room.id}:`, pErr);
          }

          // Get last message (filtered by clearedAt if user has cleared history)
          let lastMessage: {
            id: string;
            roomId: string;
            senderId: string | null;
            messageText: string | null;
            attachmentsUrls: string[];
            isRead: boolean;
            createdAt: Date;
            senderName: string | null;
            senderAvatar: string | null;
          } | undefined = undefined;

          try {
            const lastMsgConditions: SQL[] = [eq(schema.chatMessages.roomId, room.id)];
            if (room.clearedAt) {
              lastMsgConditions.push(sql`${schema.chatMessages.createdAt} > ${room.clearedAt}`);
            }

            const [found] = await this.db
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
              .where(and(...lastMsgConditions))
              .orderBy(sql`${schema.chatMessages.createdAt} DESC`)
              .limit(1);
            lastMessage = found;
          } catch (mErr) {
            this.logger.warn(`Failed to get last message for room ${room.id}:`, mErr);
          }

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

          let canSendMessages = true;
          let messageRestriction: 'STRANGER' | 'BLOCKED' | null = null;
          if (room.type === 'DIRECT') {
            const otherParticipant = participants.find((participant) => participant.id !== userId);
            if (otherParticipant) {
              try {
                if (await this.isBlockedBetween(userId, otherParticipant.id)) {
                  canSendMessages = false;
                  messageRestriction = 'BLOCKED';
                } else if (
                  !(await this.getAllowStrangerMessages(otherParticipant.id)) &&
                  !(await this.isAcquainted(userId, otherParticipant.id))
                ) {
                  canSendMessages = false;
                  messageRestriction = 'STRANGER';
                }
              } catch (err) {
                this.logger.warn(`Failed to check restriction for direct room ${room.id}:`, err);
                canSendMessages = true;
              }
            }
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
            canSendMessages,
            messageRestriction,
          });
        } catch (roomProcessingErr) {
          this.logger.warn(`Error processing room ${room.id}:`, roomProcessingErr);
        }
      }

      // Legacy data may contain more than one DIRECT room for the same pair.
      // Collapse those rows at the API boundary so every client renders one
      // conversation, while preserving the freshest preview and unread state.
      const canonicalRooms = new Map<string, (typeof roomsList)[number]>();
      for (const room of roomsList) {
        const participantKey = room.type === 'DIRECT'
          ? room.participants
            .filter((participant) => participant.id !== userId)
            .map((participant) => participant.id)
            .sort()
            .join(',')
          : '';
        const key = room.type === 'DIRECT' && participantKey
          ? `DIRECT:${participantKey}`
          : `${room.type}:${room.id}`;
        const existing = canonicalRooms.get(key);
        if (!existing) {
          canonicalRooms.set(key, room);
          continue;
        }
        const isFresh = new Date(room.updatedAt).getTime() >= new Date(existing.updatedAt).getTime();
        const unreadCount = existing.id === room.id
          ? Math.max(existing.unreadCount, room.unreadCount)
          : existing.unreadCount + room.unreadCount;
        canonicalRooms.set(key, {
          ...(isFresh ? room : existing),
          unreadCount,
        });
      }

      const visibleRooms = Array.from(canonicalRooms.values());
      visibleRooms.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );

      return visibleRooms;
    } catch (error) {
      this.logger.error(`Failed to get user rooms for ${userId}:`, error);
      return [];
    }
  }

  async getUserRoomById(userId: string, roomId: string) {
    const rooms = await this.getUserRooms(userId);
    return rooms.find((room) => room.id === roomId) ?? null;
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

  async findDirectRoomBetween(firstUserId: string, secondUserId: string) {
    const memberRows = await this.db
      .select({ roomId: schema.chatRoomMembers.roomId, userId: schema.chatRoomMembers.userId })
      .from(schema.chatRoomMembers)
      .where(inArray(schema.chatRoomMembers.userId, [firstUserId, secondUserId]));

    const requestedUsers = new Set([firstUserId, secondUserId]);
    const roomUsers = new Map<string, Set<string>>();
    for (const row of memberRows) {
      const users = roomUsers.get(row.roomId) ?? new Set<string>();
      users.add(row.userId);
      roomUsers.set(row.roomId, users);
    }

    const roomIds = Array.from(roomUsers.entries())
      .filter(([, users]) => users.size === requestedUsers.size && [...requestedUsers].every((id) => users.has(id)))
      .map(([roomId]) => roomId);
    if (roomIds.length === 0) return null;

    const [room] = await this.db
      .select()
      .from(schema.chatRooms)
      .where(and(inArray(schema.chatRooms.id, roomIds), eq(schema.chatRooms.type, 'DIRECT')))
      .limit(1);
    return room ?? null;
  }

  async getOrCreateDirectRoom(firstUserId: string, secondUserId: string) {
    const pairKey = [firstUserId, secondUserId].sort().join(':');

    return this.db.transaction(async (tx) => {
      // Serialize creation for this pair. The existing schema has no unique
      // constraint that can represent an unordered two-user relationship.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${pairKey}))`);

      const memberRows = await tx
        .select({ roomId: schema.chatRoomMembers.roomId, userId: schema.chatRoomMembers.userId })
        .from(schema.chatRoomMembers)
        .where(inArray(schema.chatRoomMembers.userId, [firstUserId, secondUserId]));
      const requestedUsers = new Set([firstUserId, secondUserId]);
      const roomUsers = new Map<string, Set<string>>();
      for (const row of memberRows) {
        const users = roomUsers.get(row.roomId) ?? new Set<string>();
        users.add(row.userId);
        roomUsers.set(row.roomId, users);
      }
      const roomIds = Array.from(roomUsers.entries())
        .filter(([, users]) => users.size === 2 && [...requestedUsers].every((id) => users.has(id)))
        .map(([roomId]) => roomId);

      if (roomIds.length > 0) {
        const [existingRoom] = await tx
          .select()
          .from(schema.chatRooms)
          .where(and(inArray(schema.chatRooms.id, roomIds), eq(schema.chatRooms.type, 'DIRECT')))
          .limit(1);
        if (existingRoom) return existingRoom;
      }

      const [room] = await tx
        .insert(schema.chatRooms)
        .values({ type: 'DIRECT' })
        .returning();
      await tx.insert(schema.chatRoomMembers).values([
        { roomId: room.id, userId: firstUserId },
        { roomId: room.id, userId: secondUserId },
      ]);
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

  /// Cài đặt riêng tư của người nhận: cho phép người lạ nhắn tin (mặc định false).
  async getAllowStrangerMessages(userId: string): Promise<boolean> {
    try {
      const [row] = await this.db
        .select({ allow: schema.profiles.allowStrangerMessages })
        .from(schema.profiles)
        .where(eq(schema.profiles.userId, userId))
        .limit(1);
      return row?.allow ?? false;
    } catch (error) {
      // Privacy checks must fail closed. A schema/read failure must never turn
      // a recipient who disabled stranger messages into an implicitly open inbox.
      this.logger.error(
        `Unable to read stranger-message privacy for ${userId}; denying stranger access. Apply the allow_stranger_messages migration.`,
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  }

  /// Hai người "quen nhau" nếu đã từng có tin nhắn direct hoặc cùng là
  /// thành viên JOINED của ít nhất 1 CLB. Ngược lại là người lạ.
  async isAcquainted(firstUserId: string, secondUserId: string): Promise<boolean> {
    try {
      const [directMessageHistory] = await this.db
        .select({ id: schema.chatMessages.id })
        .from(schema.chatMessages)
        .innerJoin(schema.chatRooms, eq(schema.chatMessages.roomId, schema.chatRooms.id))
        .where(and(
          eq(schema.chatRooms.type, 'DIRECT'),
          sql`EXISTS (
            SELECT 1 FROM chat_room_members first_member
            WHERE first_member.room_id = ${schema.chatMessages.roomId}
              AND first_member.user_id = ${firstUserId}
          )`,
          sql`EXISTS (
            SELECT 1 FROM chat_room_members second_member
            WHERE second_member.room_id = ${schema.chatMessages.roomId}
              AND second_member.user_id = ${secondUserId}
          )`,
        ))
        .limit(1);
      if (directMessageHistory) return true;

      const secondUserMemberships = await this.db
        .select({ communityId: schema.communityMembers.communityId })
        .from(schema.communityMembers)
        .where(
          and(
            eq(schema.communityMembers.userId, secondUserId),
            eq(schema.communityMembers.status, 'JOINED'),
          ),
        );

      const secondUserCommunityIds = secondUserMemberships.map((m) => m.communityId);
      if (secondUserCommunityIds.length > 0) {
        const [sharedCommunity] = await this.db
          .select({ id: schema.communityMembers.id })
          .from(schema.communityMembers)
          .where(
            and(
              eq(schema.communityMembers.userId, firstUserId),
              eq(schema.communityMembers.status, 'JOINED'),
              inArray(schema.communityMembers.communityId, secondUserCommunityIds),
            ),
          )
          .limit(1);
        if (sharedCommunity) return true;
      }

      return false;
    } catch (error) {
      // If acquaintance data cannot be read, fail closed: the service will
      // return its normal 403 for a restricted recipient rather than a 500.
      this.logger.warn(
        `Unable to verify acquaintance for ${firstUserId} and ${secondUserId}.`,
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
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
        type: data.type || 'TEXT',
        metadata: data.metadata || null,
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
        type: schema.chatMessages.type,
        metadata: schema.chatMessages.metadata,
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

  async getMessagesPage(roomId: string, limit: number, cursor?: string, userId?: string) {
    const conditions: SQL[] = [eq(schema.chatMessages.roomId, roomId)];
    if (userId) {
      const clearedAt = await this.getMemberClearedAt(roomId, userId);
      if (clearedAt) {
        conditions.push(sql`${schema.chatMessages.createdAt} > ${clearedAt}`);
      }
    }
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
      type: schema.chatMessages.type,
      metadata: schema.chatMessages.metadata,
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
      .where(and(
        eq(schema.chatMessages.id, messageId),
        eq(schema.chatMessages.roomId, roomId),
      ));

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
      .where(and(
        eq(schema.chatMessages.id, messageId),
        eq(schema.chatMessages.roomId, roomId),
      ));

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

  async votePoll(userId: string, messageId: string, optionId: string) {
    const [msg] = await this.db
      .select()
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.id, messageId))
      .limit(1);

    if (!msg) {
      throw new NotFoundException('Không tìm thấy tin nhắn bình chọn.');
    }

    const canAccess = await this.canAccessRoom(msg.roomId, userId);
    if (!canAccess) {
      throw new ForbiddenException('Bạn không có quyền tham gia bình chọn trong phòng này.');
    }

    if (msg.type !== 'POLL' || msg.isRevoked) {
      throw new BadRequestException('Tin nhắn này không phải là cuộc bình chọn hợp lệ.');
    }

    const metadata = (msg.metadata || {}) as {
      question: string;
      options: Array<{ id: string; text: string; voterIds: string[] }>;
      allowMultiple?: boolean;
      isClosed?: boolean;
    };

    if (metadata.isClosed) {
      throw new BadRequestException('Cuộc bình chọn này đã kết thúc.');
    }

    const options = metadata.options || [];
    const targetOption = options.find((opt) => opt.id === optionId);
    if (!targetOption) {
      throw new BadRequestException('Lựa chọn bình chọn không tồn tại.');
    }

    const isAlreadyVoted = (targetOption.voterIds || []).includes(userId);

    const updatedOptions = options.map((opt) => {
      let voterIds = opt.voterIds || [];
      if (opt.id === optionId) {
        if (isAlreadyVoted) {
          voterIds = voterIds.filter((id) => id !== userId);
        } else {
          voterIds = [...voterIds.filter((id) => id !== userId), userId];
        }
      } else if (!metadata.allowMultiple && !isAlreadyVoted) {
        // Single choice: remove user from other options when voting for this one
        voterIds = voterIds.filter((id) => id !== userId);
      }
      return { ...opt, voterIds };
    });

    const updatedMetadata = {
      ...metadata,
      options: updatedOptions,
    };

    const [updated] = await this.db
      .update(schema.chatMessages)
      .set({ metadata: updatedMetadata })
      .where(eq(schema.chatMessages.id, messageId))
      .returning();

    return {
      messageId,
      roomId: msg.roomId,
      metadata: updatedMetadata,
      message: updated,
    };
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

    // If this is a direct room, also mark read for all direct rooms sharing the same pair of participants
    try {
      const [room] = await this.db.select({ type: schema.chatRooms.type }).from(schema.chatRooms).where(eq(schema.chatRooms.id, roomId)).limit(1);
      if (room?.type === 'DIRECT') {
        const members = await this.db.select({ userId: schema.chatRoomMembers.userId }).from(schema.chatRoomMembers).where(eq(schema.chatRoomMembers.roomId, roomId));
        const otherMember = members.find((m) => m.userId !== userId);
        if (otherMember) {
          const directRooms = await this.db
            .select({ roomId: schema.chatRoomMembers.roomId, userId: schema.chatRoomMembers.userId })
            .from(schema.chatRoomMembers)
            .where(inArray(schema.chatRoomMembers.userId, [userId, otherMember.userId]));
          const roomUsers = new Map<string, Set<string>>();
          for (const row of directRooms) {
            const users = roomUsers.get(row.roomId) ?? new Set<string>();
            users.add(row.userId);
            roomUsers.set(row.roomId, users);
          }
          const pairRoomIds = Array.from(roomUsers.entries())
            .filter(([rId, users]) => rId !== roomId && users.size === 2 && users.has(userId) && users.has(otherMember.userId))
            .map(([rId]) => rId);
          for (const pairRoomId of pairRoomIds) {
            await this.db.insert(schema.chatReadStates)
              .values({ roomId: pairRoomId, userId, lastReadAt: now })
              .onConflictDoUpdate({ target: [schema.chatReadStates.roomId, schema.chatReadStates.userId], set: { lastReadAt: now } });
          }
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to cascade markRead for direct room ${roomId}:`, err);
    }

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

  async getRoomDetails(roomId: string) {
    const [room] = await this.db
      .select()
      .from(schema.chatRooms)
      .where(eq(schema.chatRooms.id, roomId))
      .limit(1);
    if (!room) return null;

    const participants = await this.db
      .select({
        id: schema.users.id,
        fullName: schema.profiles.fullName,
        avatarUrl: schema.profiles.avatarUrl,
        lastReadAt: schema.chatReadStates.lastReadAt,
      })
      .from(schema.chatRoomMembers)
      .innerJoin(schema.users, eq(schema.chatRoomMembers.userId, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .leftJoin(
        schema.chatReadStates,
        and(
          eq(schema.chatReadStates.roomId, roomId),
          eq(schema.chatReadStates.userId, schema.users.id),
        ),
      )
      .where(eq(schema.chatRoomMembers.roomId, roomId));

    return { ...room, participants };
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
            attachmentsUrls: schema.chatMessages.attachmentsUrls,
            isRevoked: schema.chatMessages.isRevoked,
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

        let lastMsgContent = '';
        if (lastMessage) {
          if (lastMessage.isRevoked) {
            lastMsgContent = 'Tin nhắn đã thu hồi';
          } else if (lastMessage.messageText) {
            lastMsgContent = lastMessage.messageText;
          } else if (lastMessage.attachmentsUrls && lastMessage.attachmentsUrls.length > 0) {
            lastMsgContent = '🖼️ [Hình ảnh]';
          }
        }

        return {
          ...room,
          participants,
          unreadCount: unreadResult?.count ?? 0,
          lastMessage: lastMessage
            ? {
                id: lastMessage.id,
                senderId: lastMessage.senderId,
                senderName: lastMessage.senderName,
                content: lastMsgContent,
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

  async getLastUserMessageInRoom(roomId: string, userId: string) {
    const [msg] = await this.db
      .select({ createdAt: schema.chatMessages.createdAt })
      .from(schema.chatMessages)
      .where(and(eq(schema.chatMessages.roomId, roomId), eq(schema.chatMessages.senderId, userId)))
      .orderBy(desc(schema.chatMessages.createdAt))
      .limit(1);
    return msg ?? null;
  }

  async getCommunityMemberUserIds(communityId: string, excludeUserId?: string): Promise<string[]> {
    const rows = await this.db
      .select({ userId: schema.communityMembers.userId })
      .from(schema.communityMembers)
      .where(
        and(
          eq(schema.communityMembers.communityId, communityId),
          eq(schema.communityMembers.status, 'JOINED'),
        ),
      );

    return rows
      .map((r) => r.userId)
      .filter((uid) => !excludeUserId || uid !== excludeUserId);
  }

  async findUserById(userId: string) {
    const [user] = await this.db
      .select({
        id: schema.users.id,
        fullName: schema.profiles.fullName,
      })
      .from(schema.users)
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(eq(schema.users.id, userId))
      .limit(1);

    return user ?? null;
  }

  async getMemberClearedAt(roomId: string, userId: string): Promise<Date | null> {
    const [member] = await this.db
      .select({ clearedAt: schema.chatRoomMembers.clearedAt })
      .from(schema.chatRoomMembers)
      .where(
        and(
          eq(schema.chatRoomMembers.roomId, roomId),
          eq(schema.chatRoomMembers.userId, userId),
        ),
      )
      .limit(1);
    return member?.clearedAt ? new Date(member.clearedAt) : null;
  }

  async clearRoomHistory(userId: string, roomId: string): Promise<boolean> {
    const room = await this.findRoomById(roomId);
    if (!room) throw new NotFoundException('Phòng chat không tồn tại');

    const [existing] = await this.db
      .select({ id: schema.chatRoomMembers.id })
      .from(schema.chatRoomMembers)
      .where(
        and(
          eq(schema.chatRoomMembers.roomId, roomId),
          eq(schema.chatRoomMembers.userId, userId),
        ),
      )
      .limit(1);

    if (existing) {
      await this.db
        .update(schema.chatRoomMembers)
        .set({ clearedAt: new Date() })
        .where(eq(schema.chatRoomMembers.id, existing.id));
    } else {
      await this.db.insert(schema.chatRoomMembers).values({
        roomId,
        userId,
        clearedAt: new Date(),
      });
    }

    return true;
  }

  async getCommunityMembersWithNotificationPref(communityId: string, excludeUserId?: string) {
    const conditions: SQL[] = [
      eq(schema.communityMembers.communityId, communityId),
      eq(schema.communityMembers.status, 'JOINED'),
    ];
    if (excludeUserId) {
      conditions.push(sql`${schema.communityMembers.userId} != ${excludeUserId}`);
    }
    return this.db
      .select({
        userId: schema.communityMembers.userId,
        notificationPreference: schema.communityMembers.notificationPreference,
      })
      .from(schema.communityMembers)
      .where(and(...conditions));
  }
}
