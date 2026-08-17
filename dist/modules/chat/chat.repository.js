"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatRepository = void 0;
const common_1 = require("@nestjs/common");
const database_module_1 = require("../../database/database.module");
const schema = __importStar(require("../../database/schema"));
const drizzle_orm_1 = require("drizzle-orm");
const cursor_pagination_helper_1 = require("../../common/helpers/cursor-pagination.helper");
let ChatRepository = class ChatRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async getUserRooms(userId) {
        const directAndGroupRooms = await this.db
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
            .innerJoin(schema.chatRooms, (0, drizzle_orm_1.eq)(schema.chatRoomMembers.roomId, schema.chatRooms.id))
            .leftJoin(schema.communities, (0, drizzle_orm_1.eq)(schema.chatRooms.communityId, schema.communities.id))
            .where((0, drizzle_orm_1.eq)(schema.chatRoomMembers.userId, userId));
        const clubRooms = await this.db
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
            .innerJoin(schema.chatRooms, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.chatRooms.communityId, schema.communityMembers.communityId), (0, drizzle_orm_1.eq)(schema.chatRooms.type, 'CLUB')))
            .leftJoin(schema.communities, (0, drizzle_orm_1.eq)(schema.chatRooms.communityId, schema.communities.id))
            .leftJoin(schema.chatRoomMembers, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.chatRoomMembers.roomId, schema.chatRooms.id), (0, drizzle_orm_1.eq)(schema.chatRoomMembers.userId, userId)))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityMembers.userId, userId), (0, drizzle_orm_1.eq)(schema.communityMembers.status, 'JOINED')));
        const allRoomMap = new Map();
        for (const r of directAndGroupRooms)
            allRoomMap.set(r.id, r);
        for (const r of clubRooms)
            allRoomMap.set(r.id, r);
        const roomsWithMembership = Array.from(allRoomMap.values());
        if (roomsWithMembership.length === 0)
            return [];
        const roomsList = [];
        for (const room of roomsWithMembership) {
            const participants = await this.db
                .select({
                id: schema.users.id,
                fullName: schema.profiles.fullName,
                avatarUrl: schema.profiles.avatarUrl,
                lastReadAt: schema.chatReadStates.lastReadAt,
            })
                .from(schema.chatRoomMembers)
                .innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.chatRoomMembers.userId, schema.users.id))
                .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
                .leftJoin(schema.chatReadStates, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.chatReadStates.userId, schema.users.id), (0, drizzle_orm_1.eq)(schema.chatReadStates.roomId, room.id)))
                .where((0, drizzle_orm_1.eq)(schema.chatRoomMembers.roomId, room.id));
            const lastMsgConditions = [(0, drizzle_orm_1.eq)(schema.chatMessages.roomId, room.id)];
            if (room.clearedAt) {
                lastMsgConditions.push((0, drizzle_orm_1.sql) `${schema.chatMessages.createdAt} > ${room.clearedAt}`);
            }
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
                .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.chatMessages.senderId, schema.profiles.userId))
                .where((0, drizzle_orm_1.and)(...lastMsgConditions))
                .orderBy((0, drizzle_orm_1.sql) `${schema.chatMessages.createdAt} DESC`)
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
            }
            catch {
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
        const canonicalRooms = new Map();
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
            canonicalRooms.set(key, {
                ...(isFresh ? room : existing),
                unreadCount: Math.max(existing.unreadCount, room.unreadCount),
            });
        }
        const visibleRooms = Array.from(canonicalRooms.values());
        visibleRooms.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        return visibleRooms;
    }
    async getUserRoomById(userId, roomId) {
        const rooms = await this.getUserRooms(userId);
        return rooms.find((room) => room.id === roomId) ?? null;
    }
    async createRoomWithMembers(data) {
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
    async findDirectRoomBetween(firstUserId, secondUserId) {
        const memberRows = await this.db
            .select({ roomId: schema.chatRoomMembers.roomId, userId: schema.chatRoomMembers.userId })
            .from(schema.chatRoomMembers)
            .where((0, drizzle_orm_1.inArray)(schema.chatRoomMembers.userId, [firstUserId, secondUserId]));
        const requestedUsers = new Set([firstUserId, secondUserId]);
        const roomUsers = new Map();
        for (const row of memberRows) {
            const users = roomUsers.get(row.roomId) ?? new Set();
            users.add(row.userId);
            roomUsers.set(row.roomId, users);
        }
        const roomIds = Array.from(roomUsers.entries())
            .filter(([, users]) => users.size === requestedUsers.size && [...requestedUsers].every((id) => users.has(id)))
            .map(([roomId]) => roomId);
        if (roomIds.length === 0)
            return null;
        const [room] = await this.db
            .select()
            .from(schema.chatRooms)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema.chatRooms.id, roomIds), (0, drizzle_orm_1.eq)(schema.chatRooms.type, 'DIRECT')))
            .limit(1);
        return room ?? null;
    }
    async getOrCreateDirectRoom(firstUserId, secondUserId) {
        const pairKey = [firstUserId, secondUserId].sort().join(':');
        return this.db.transaction(async (tx) => {
            await tx.execute((0, drizzle_orm_1.sql) `SELECT pg_advisory_xact_lock(hashtextextended(${pairKey}, 0))`);
            const memberRows = await tx
                .select({ roomId: schema.chatRoomMembers.roomId, userId: schema.chatRoomMembers.userId })
                .from(schema.chatRoomMembers)
                .where((0, drizzle_orm_1.inArray)(schema.chatRoomMembers.userId, [firstUserId, secondUserId]));
            const requestedUsers = new Set([firstUserId, secondUserId]);
            const roomUsers = new Map();
            for (const row of memberRows) {
                const users = roomUsers.get(row.roomId) ?? new Set();
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
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema.chatRooms.id, roomIds), (0, drizzle_orm_1.eq)(schema.chatRooms.type, 'DIRECT')))
                    .limit(1);
                if (existingRoom)
                    return existingRoom;
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
    async isMemberOfRoom(roomId, userId) {
        const [record] = await this.db
            .select()
            .from(schema.chatRoomMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.chatRoomMembers.roomId, roomId), (0, drizzle_orm_1.eq)(schema.chatRoomMembers.userId, userId)))
            .limit(1);
        return !!record;
    }
    async getRoomMemberIds(roomId) {
        const rows = await this.db.select({ userId: schema.chatRoomMembers.userId })
            .from(schema.chatRoomMembers)
            .where((0, drizzle_orm_1.eq)(schema.chatRoomMembers.roomId, roomId));
        return rows.map((row) => row.userId);
    }
    async isActiveUser(userId) {
        const [user] = await this.db.select({ id: schema.users.id })
            .from(schema.users)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.users.id, userId), (0, drizzle_orm_1.sql) `${schema.users.deletedAt} IS NULL`))
            .limit(1);
        return !!user;
    }
    async isBlockedBetween(firstUserId, secondUserId) {
        const [record] = await this.db
            .select({ id: schema.chatBlocks.id })
            .from(schema.chatBlocks)
            .where((0, drizzle_orm_1.or)((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.chatBlocks.blockerId, firstUserId), (0, drizzle_orm_1.eq)(schema.chatBlocks.blockedId, secondUserId)), (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.chatBlocks.blockerId, secondUserId), (0, drizzle_orm_1.eq)(schema.chatBlocks.blockedId, firstUserId))))
            .limit(1);
        return !!record;
    }
    async getAllowStrangerMessages(userId) {
        const [row] = await this.db
            .select({ allow: schema.profiles.allowStrangerMessages })
            .from(schema.profiles)
            .where((0, drizzle_orm_1.eq)(schema.profiles.userId, userId))
            .limit(1);
        return row?.allow ?? true;
    }
    async isAcquainted(firstUserId, secondUserId) {
        const [sharedCommunity] = await this.db
            .select({ one: (0, drizzle_orm_1.sql) `1` })
            .from(schema.communityMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityMembers.userId, firstUserId), (0, drizzle_orm_1.eq)(schema.communityMembers.status, 'JOINED'), (0, drizzle_orm_1.sql) `EXISTS (
          SELECT 1 FROM ${schema.communityMembers} cm2
          WHERE cm2.community_id = ${schema.communityMembers.communityId}
            AND cm2.user_id = ${secondUserId}
            AND cm2.status = 'JOINED'
        )`))
            .limit(1);
        if (sharedCommunity)
            return true;
        const [friend] = await this.db
            .select({ id: schema.friendships.id })
            .from(schema.friendships)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.friendships.status, 'ACCEPTED'), (0, drizzle_orm_1.or)((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.friendships.senderId, firstUserId), (0, drizzle_orm_1.eq)(schema.friendships.receiverId, secondUserId)), (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.friendships.senderId, secondUserId), (0, drizzle_orm_1.eq)(schema.friendships.receiverId, firstUserId)))))
            .limit(1);
        return !!friend;
    }
    async createBlock(blockerId, blockedId) {
        const [record] = await this.db
            .insert(schema.chatBlocks)
            .values({ blockerId, blockedId })
            .onConflictDoNothing({ target: [schema.chatBlocks.blockerId, schema.chatBlocks.blockedId] })
            .returning();
        return record ?? (await this.db.select().from(schema.chatBlocks).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.chatBlocks.blockerId, blockerId), (0, drizzle_orm_1.eq)(schema.chatBlocks.blockedId, blockedId))).limit(1))[0];
    }
    async deleteBlock(blockerId, blockedId) {
        const deleted = await this.db.delete(schema.chatBlocks).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.chatBlocks.blockerId, blockerId), (0, drizzle_orm_1.eq)(schema.chatBlocks.blockedId, blockedId))).returning({ id: schema.chatBlocks.id });
        return deleted.length > 0;
    }
    async getBlocks(blockerId) {
        return this.db.select({
            id: schema.chatBlocks.id,
            blockedId: schema.chatBlocks.blockedId,
            createdAt: schema.chatBlocks.createdAt,
            fullName: schema.profiles.fullName,
            avatarUrl: schema.profiles.avatarUrl,
        }).from(schema.chatBlocks)
            .innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.chatBlocks.blockedId, schema.users.id))
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.chatBlocks.blockedId, schema.profiles.userId))
            .where((0, drizzle_orm_1.eq)(schema.chatBlocks.blockerId, blockerId))
            .orderBy((0, drizzle_orm_1.desc)(schema.chatBlocks.createdAt));
    }
    async findCommunityMember(communityId, userId) {
        const [member] = await this.db
            .select()
            .from(schema.communityMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityMembers.communityId, communityId), (0, drizzle_orm_1.eq)(schema.communityMembers.userId, userId)))
            .limit(1);
        return member;
    }
    async canAccessRoom(roomId, userId) {
        const room = await this.findRoomById(roomId);
        if (!room)
            return false;
        if (room.type === 'CLUB' && room.communityId) {
            if (!(await this.isClubChatEnabled(room.communityId)))
                return false;
            const member = await this.findCommunityMember(room.communityId, userId);
            return member?.status === 'JOINED';
        }
        return this.isMemberOfRoom(roomId, userId);
    }
    async isClubChatEnabled(communityId) {
        const [settings] = await this.db
            .select({ chatEnabled: schema.communitySocialSettings.chatEnabled })
            .from(schema.communitySocialSettings)
            .where((0, drizzle_orm_1.eq)(schema.communitySocialSettings.communityId, communityId))
            .limit(1);
        return settings?.chatEnabled ?? true;
    }
    async getOrCreateClubRoom(communityId) {
        const [existing] = await this.db
            .select()
            .from(schema.chatRooms)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.chatRooms.communityId, communityId), (0, drizzle_orm_1.eq)(schema.chatRooms.type, 'CLUB')))
            .limit(1);
        if (existing)
            return existing;
        const [community] = await this.db
            .select({
            id: schema.communities.id,
            name: schema.communities.name,
            logoUrl: schema.communities.logoUrl,
        })
            .from(schema.communities)
            .where((0, drizzle_orm_1.eq)(schema.communities.id, communityId))
            .limit(1);
        if (!community) {
            throw new common_1.NotFoundException('Community not found');
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
        }
        catch (err) {
            if (err?.code === '23505') {
                const [room] = await this.db
                    .select()
                    .from(schema.chatRooms)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.chatRooms.communityId, communityId), (0, drizzle_orm_1.eq)(schema.chatRooms.type, 'CLUB')))
                    .limit(1);
                if (room)
                    return room;
            }
            throw err;
        }
    }
    async getClubRoomMembers(communityId) {
        return this.db
            .select({
            id: schema.users.id,
            fullName: schema.profiles.fullName,
            avatarUrl: schema.profiles.avatarUrl,
            role: schema.communityMembers.role,
            tags: schema.communityMembers.tags,
        })
            .from(schema.communityMembers)
            .innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.communityMembers.userId, schema.users.id))
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityMembers.communityId, communityId), (0, drizzle_orm_1.eq)(schema.communityMembers.status, 'JOINED')))
            .orderBy((0, drizzle_orm_1.asc)(schema.communityMembers.joinedAt));
    }
    async getMemberTags(communityId, userId) {
        const [member] = await this.db
            .select({ tags: schema.communityMembers.tags })
            .from(schema.communityMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityMembers.communityId, communityId), (0, drizzle_orm_1.eq)(schema.communityMembers.userId, userId)))
            .limit(1);
        return member?.tags ?? [];
    }
    async saveMessage(senderId, data) {
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
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .where((0, drizzle_orm_1.eq)(schema.users.id, senderId))
            .limit(1);
        let replyTo = null;
        if (data.replyToId) {
            const [replyMsg] = await this.db
                .select({
                id: schema.chatMessages.id,
                messageText: schema.chatMessages.messageText,
                senderName: (0, drizzle_orm_1.sql) `COALESCE(NULLIF(TRIM(${schema.profiles.fullName}), ''), SPLIT_PART(${schema.users.email}, '@', 1), 'Thành viên')`,
            })
                .from(schema.chatMessages)
                .leftJoin(schema.users, (0, drizzle_orm_1.eq)(schema.chatMessages.senderId, schema.users.id))
                .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.chatMessages.senderId, schema.profiles.userId))
                .where((0, drizzle_orm_1.eq)(schema.chatMessages.id, data.replyToId))
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
    async getMessagesByRoom(roomId, limit = 50) {
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
            senderName: (0, drizzle_orm_1.sql) `COALESCE(NULLIF(TRIM(${schema.profiles.fullName}), ''), SPLIT_PART(${schema.users.email}, '@', 1), 'Thành viên')`,
            senderAvatar: schema.profiles.avatarUrl,
            senderAvatarUrl: schema.profiles.avatarUrl,
        })
            .from(schema.chatMessages)
            .innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.chatMessages.senderId, schema.users.id))
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.chatMessages.senderId, schema.profiles.userId))
            .where((0, drizzle_orm_1.eq)(schema.chatMessages.roomId, roomId))
            .orderBy((0, drizzle_orm_1.asc)(schema.chatMessages.createdAt))
            .limit(limit);
        return result;
    }
    async getMessagesPage(roomId, limit, cursor, userId) {
        const conditions = [(0, drizzle_orm_1.eq)(schema.chatMessages.roomId, roomId)];
        if (userId) {
            const clearedAt = await this.getMemberClearedAt(roomId, userId);
            if (clearedAt) {
                conditions.push((0, drizzle_orm_1.sql) `${schema.chatMessages.createdAt} > ${clearedAt}`);
            }
        }
        const decoded = cursor ? cursor_pagination_helper_1.CursorPaginationHelper.decodeCursor(cursor) : null;
        if (decoded?.createdAt && decoded.id) {
            conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.lt)(schema.chatMessages.createdAt, new Date(decoded.createdAt)), (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.chatMessages.createdAt, new Date(decoded.createdAt)), (0, drizzle_orm_1.lt)(schema.chatMessages.id, decoded.id))));
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
            senderName: (0, drizzle_orm_1.sql) `COALESCE(NULLIF(TRIM(${schema.profiles.fullName}), ''), SPLIT_PART(${schema.users.email}, '@', 1), 'Sporto Player')`,
            senderAvatar: schema.profiles.avatarUrl,
            senderAvatarUrl: schema.profiles.avatarUrl,
        }).from(schema.chatMessages).innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.chatMessages.senderId, schema.users.id))
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.chatMessages.senderId, schema.profiles.userId)).where((0, drizzle_orm_1.and)(...conditions))
            .orderBy((0, drizzle_orm_1.desc)(schema.chatMessages.createdAt), (0, drizzle_orm_1.desc)(schema.chatMessages.id)).limit(limit + 1);
        const hasMore = rows.length > limit;
        const data = hasMore ? rows.slice(0, limit) : rows;
        const messageIds = data.map((m) => m.id);
        const reactionsMap = new Map();
        if (messageIds.length > 0) {
            const rxRows = await this.db
                .select({
                messageId: schema.chatMessageReactions.messageId,
                emoji: schema.chatMessageReactions.emoji,
            })
                .from(schema.chatMessageReactions)
                .where((0, drizzle_orm_1.inArray)(schema.chatMessageReactions.messageId, messageIds));
            for (const rx of rxRows) {
                const arr = reactionsMap.get(rx.messageId) || [];
                arr.push(rx.emoji);
                reactionsMap.set(rx.messageId, arr);
            }
        }
        const replyIds = data.map((m) => m.replyToId).filter(Boolean);
        const replyMap = new Map();
        if (replyIds.length > 0) {
            const replies = await this.db
                .select({
                id: schema.chatMessages.id,
                messageText: schema.chatMessages.messageText,
                senderName: (0, drizzle_orm_1.sql) `COALESCE(NULLIF(TRIM(${schema.profiles.fullName}), ''), SPLIT_PART(${schema.users.email}, '@', 1), 'Thành viên')`,
            })
                .from(schema.chatMessages)
                .leftJoin(schema.users, (0, drizzle_orm_1.eq)(schema.chatMessages.senderId, schema.users.id))
                .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.chatMessages.senderId, schema.profiles.userId))
                .where((0, drizzle_orm_1.inArray)(schema.chatMessages.id, replyIds));
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
                nextCursor: hasMore && last ? cursor_pagination_helper_1.CursorPaginationHelper.encodeCursor({ id: last.id, createdAt: last.createdAt }) : null,
            },
        };
    }
    async findMessageById(messageId) {
        const [msg] = await this.db
            .select()
            .from(schema.chatMessages)
            .where((0, drizzle_orm_1.eq)(schema.chatMessages.id, messageId))
            .limit(1);
        return msg ?? null;
    }
    async revokeMessage(messageId, revokedById) {
        const now = new Date();
        const [updated] = await this.db
            .update(schema.chatMessages)
            .set({
            isRevoked: true,
            revokedBy: revokedById,
            revokedAt: now,
        })
            .where((0, drizzle_orm_1.eq)(schema.chatMessages.id, messageId))
            .returning();
        return updated;
    }
    async pinMessage(roomId, messageId, pinnedById) {
        const now = new Date();
        await this.db
            .update(schema.chatMessages)
            .set({ isPinned: true, pinnedBy: pinnedById, pinnedAt: now })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.chatMessages.id, messageId), (0, drizzle_orm_1.eq)(schema.chatMessages.roomId, roomId)));
        await this.db
            .update(schema.chatRooms)
            .set({ pinnedMessageId: messageId })
            .where((0, drizzle_orm_1.eq)(schema.chatRooms.id, roomId));
        return { success: true, messageId, pinnedAt: now };
    }
    async unpinMessage(roomId, messageId) {
        await this.db
            .update(schema.chatMessages)
            .set({ isPinned: false, pinnedBy: null, pinnedAt: null })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.chatMessages.id, messageId), (0, drizzle_orm_1.eq)(schema.chatMessages.roomId, roomId)));
        const [room] = await this.db
            .select({ pinnedMessageId: schema.chatRooms.pinnedMessageId })
            .from(schema.chatRooms)
            .where((0, drizzle_orm_1.eq)(schema.chatRooms.id, roomId))
            .limit(1);
        if (room?.pinnedMessageId === messageId) {
            await this.db
                .update(schema.chatRooms)
                .set({ pinnedMessageId: null })
                .where((0, drizzle_orm_1.eq)(schema.chatRooms.id, roomId));
        }
        return { success: true, messageId };
    }
    async getPinnedMessage(roomId) {
        const [room] = await this.db
            .select({ pinnedMessageId: schema.chatRooms.pinnedMessageId })
            .from(schema.chatRooms)
            .where((0, drizzle_orm_1.eq)(schema.chatRooms.id, roomId))
            .limit(1);
        if (!room?.pinnedMessageId)
            return null;
        const [pinned] = await this.db
            .select({
            id: schema.chatMessages.id,
            roomId: schema.chatMessages.roomId,
            messageText: schema.chatMessages.messageText,
            attachmentsUrls: schema.chatMessages.attachmentsUrls,
            createdAt: schema.chatMessages.createdAt,
            senderName: (0, drizzle_orm_1.sql) `COALESCE(NULLIF(TRIM(${schema.profiles.fullName}), ''), SPLIT_PART(${schema.users.email}, '@', 1), 'Thành viên')`,
            senderAvatar: schema.profiles.avatarUrl,
        })
            .from(schema.chatMessages)
            .leftJoin(schema.users, (0, drizzle_orm_1.eq)(schema.chatMessages.senderId, schema.users.id))
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.chatMessages.senderId, schema.profiles.userId))
            .where((0, drizzle_orm_1.eq)(schema.chatMessages.id, room.pinnedMessageId))
            .limit(1);
        return pinned ?? null;
    }
    async toggleReaction(messageId, userId, emoji) {
        const [existing] = await this.db
            .select()
            .from(schema.chatMessageReactions)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.chatMessageReactions.messageId, messageId), (0, drizzle_orm_1.eq)(schema.chatMessageReactions.userId, userId), (0, drizzle_orm_1.eq)(schema.chatMessageReactions.emoji, emoji)))
            .limit(1);
        if (existing) {
            await this.db
                .delete(schema.chatMessageReactions)
                .where((0, drizzle_orm_1.eq)(schema.chatMessageReactions.id, existing.id));
        }
        else {
            await this.db.insert(schema.chatMessageReactions).values({
                messageId,
                userId,
                emoji,
            });
        }
        const rxRows = await this.db
            .select({ emoji: schema.chatMessageReactions.emoji })
            .from(schema.chatMessageReactions)
            .where((0, drizzle_orm_1.eq)(schema.chatMessageReactions.messageId, messageId));
        return rxRows.map((r) => r.emoji);
    }
    async updateClubRoomSettings(roomId, data) {
        const [updated] = await this.db
            .update(schema.chatRooms)
            .set({
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.clubAvatar !== undefined ? { clubAvatar: data.clubAvatar } : {}),
            ...(data.isAnnouncementOnly !== undefined ? { isAnnouncementOnly: data.isAnnouncementOnly } : {}),
            ...(data.slowModeSeconds !== undefined ? { slowModeSeconds: data.slowModeSeconds } : {}),
        })
            .where((0, drizzle_orm_1.eq)(schema.chatRooms.id, roomId))
            .returning();
        return updated;
    }
    async getCommunityRole(communityId, userId) {
        const [member] = await this.db
            .select({ role: schema.communityMembers.role, status: schema.communityMembers.status })
            .from(schema.communityMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityMembers.communityId, communityId), (0, drizzle_orm_1.eq)(schema.communityMembers.userId, userId)))
            .limit(1);
        if (!member || member.status !== 'JOINED')
            return null;
        return member.role;
    }
    async countUnreadForUser(roomId, userId, lastReadAt) {
        const conditions = [
            (0, drizzle_orm_1.eq)(schema.chatMessages.roomId, roomId),
            (0, drizzle_orm_1.sql) `${schema.chatMessages.senderId} <> ${userId}`,
        ];
        if (lastReadAt)
            conditions.push((0, drizzle_orm_1.sql) `${schema.chatMessages.createdAt} > ${lastReadAt}`);
        const [result] = await this.db.select({ count: (0, drizzle_orm_1.sql) `count(*)` })
            .from(schema.chatMessages)
            .where((0, drizzle_orm_1.and)(...conditions));
        return Number(result?.count ?? 0);
    }
    async votePoll(userId, messageId, optionId) {
        const [msg] = await this.db
            .select()
            .from(schema.chatMessages)
            .where((0, drizzle_orm_1.eq)(schema.chatMessages.id, messageId))
            .limit(1);
        if (!msg) {
            throw new common_1.NotFoundException('Không tìm thấy tin nhắn bình chọn.');
        }
        const canAccess = await this.canAccessRoom(msg.roomId, userId);
        if (!canAccess) {
            throw new common_1.ForbiddenException('Bạn không có quyền tham gia bình chọn trong phòng này.');
        }
        if (msg.type !== 'POLL' || msg.isRevoked) {
            throw new common_1.BadRequestException('Tin nhắn này không phải là cuộc bình chọn hợp lệ.');
        }
        const metadata = (msg.metadata || {});
        if (metadata.isClosed) {
            throw new common_1.BadRequestException('Cuộc bình chọn này đã kết thúc.');
        }
        const options = metadata.options || [];
        const targetOption = options.find((opt) => opt.id === optionId);
        if (!targetOption) {
            throw new common_1.BadRequestException('Lựa chọn bình chọn không tồn tại.');
        }
        const isAlreadyVoted = (targetOption.voterIds || []).includes(userId);
        const updatedOptions = options.map((opt) => {
            let voterIds = opt.voterIds || [];
            if (opt.id === optionId) {
                if (isAlreadyVoted) {
                    voterIds = voterIds.filter((id) => id !== userId);
                }
                else {
                    voterIds = [...voterIds.filter((id) => id !== userId), userId];
                }
            }
            else if (!metadata.allowMultiple && !isAlreadyVoted) {
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
            .where((0, drizzle_orm_1.eq)(schema.chatMessages.id, messageId))
            .returning();
        return {
            messageId,
            roomId: msg.roomId,
            metadata: updatedMetadata,
            message: updated,
        };
    }
    async getReadState(roomId, userId) {
        const [state] = await this.db.select().from(schema.chatReadStates)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.chatReadStates.roomId, roomId), (0, drizzle_orm_1.eq)(schema.chatReadStates.userId, userId))).limit(1);
        return state ?? null;
    }
    async markRead(roomId, userId) {
        const now = new Date();
        const [state] = await this.db.insert(schema.chatReadStates)
            .values({ roomId, userId, lastReadAt: now })
            .onConflictDoUpdate({ target: [schema.chatReadStates.roomId, schema.chatReadStates.userId], set: { lastReadAt: now } })
            .returning();
        return state;
    }
    async countUnreadUsingState(roomId, userId) {
        try {
            const state = await this.getReadState(roomId, userId);
            return await this.countUnreadForUser(roomId, userId, state?.lastReadAt ?? null);
        }
        catch {
            return 0;
        }
    }
    async findSupportRoomForUser(userId) {
        const [room] = await this.db
            .select({
            id: schema.chatRooms.id,
            name: schema.chatRooms.name,
            type: schema.chatRooms.type,
            createdAt: schema.chatRooms.createdAt,
        })
            .from(schema.chatRoomMembers)
            .innerJoin(schema.chatRooms, (0, drizzle_orm_1.eq)(schema.chatRoomMembers.roomId, schema.chatRooms.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.chatRoomMembers.userId, userId), (0, drizzle_orm_1.eq)(schema.chatRooms.type, 'SUPPORT')))
            .limit(1);
        return room;
    }
    async findRoomById(roomId) {
        const [room] = await this.db
            .select()
            .from(schema.chatRooms)
            .where((0, drizzle_orm_1.eq)(schema.chatRooms.id, roomId))
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
            .where((0, drizzle_orm_1.eq)(schema.chatRooms.type, 'SUPPORT'));
        const nowIso = new Date().toISOString();
        const result = await Promise.all(rooms.map(async (room) => {
            const participants = await this.db
                .select({
                id: schema.users.id,
                email: schema.users.email,
                fullName: schema.profiles.fullName,
                avatarUrl: schema.profiles.avatarUrl,
            })
                .from(schema.chatRoomMembers)
                .innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.chatRoomMembers.userId, schema.users.id))
                .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
                .where((0, drizzle_orm_1.eq)(schema.chatRoomMembers.roomId, room.id));
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
                .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.chatMessages.senderId, schema.profiles.userId))
                .where((0, drizzle_orm_1.eq)(schema.chatMessages.roomId, room.id))
                .orderBy((0, drizzle_orm_1.sql) `${schema.chatMessages.createdAt} DESC`)
                .limit(1);
            const participantIds = participants.map((participant) => participant.id);
            const [unreadResult] = participantIds.length > 0
                ? await this.db
                    .select({ count: (0, drizzle_orm_1.sql) `COUNT(*)::int` })
                    .from(schema.chatMessages)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.chatMessages.roomId, room.id), (0, drizzle_orm_1.eq)(schema.chatMessages.isRead, false), (0, drizzle_orm_1.inArray)(schema.chatMessages.senderId, participantIds)))
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
                }
                else if (lastMessage.messageText) {
                    lastMsgContent = lastMessage.messageText;
                }
                else if (lastMessage.attachmentsUrls && lastMessage.attachmentsUrls.length > 0) {
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
        }));
        return result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }
    async markSupportRoomRead(roomId) {
        const participants = await this.db
            .select({ userId: schema.chatRoomMembers.userId })
            .from(schema.chatRoomMembers)
            .where((0, drizzle_orm_1.eq)(schema.chatRoomMembers.roomId, roomId));
        const participantIds = participants.map((participant) => participant.userId);
        if (participantIds.length === 0)
            return;
        await this.db
            .update(schema.chatMessages)
            .set({ isRead: true })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.chatMessages.roomId, roomId), (0, drizzle_orm_1.eq)(schema.chatMessages.isRead, false), (0, drizzle_orm_1.inArray)(schema.chatMessages.senderId, participantIds)));
    }
    async getLastUserMessageInRoom(roomId, userId) {
        const [msg] = await this.db
            .select({ createdAt: schema.chatMessages.createdAt })
            .from(schema.chatMessages)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.chatMessages.roomId, roomId), (0, drizzle_orm_1.eq)(schema.chatMessages.senderId, userId)))
            .orderBy((0, drizzle_orm_1.desc)(schema.chatMessages.createdAt))
            .limit(1);
        return msg ?? null;
    }
    async getCommunityMemberUserIds(communityId, excludeUserId) {
        const rows = await this.db
            .select({ userId: schema.communityMembers.userId })
            .from(schema.communityMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityMembers.communityId, communityId), (0, drizzle_orm_1.eq)(schema.communityMembers.status, 'JOINED')));
        return rows
            .map((r) => r.userId)
            .filter((uid) => !excludeUserId || uid !== excludeUserId);
    }
    async findUserById(userId) {
        const [user] = await this.db
            .select({
            id: schema.users.id,
            fullName: schema.profiles.fullName,
        })
            .from(schema.users)
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .where((0, drizzle_orm_1.eq)(schema.users.id, userId))
            .limit(1);
        return user ?? null;
    }
    async getMemberClearedAt(roomId, userId) {
        const [member] = await this.db
            .select({ clearedAt: schema.chatRoomMembers.clearedAt })
            .from(schema.chatRoomMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.chatRoomMembers.roomId, roomId), (0, drizzle_orm_1.eq)(schema.chatRoomMembers.userId, userId)))
            .limit(1);
        return member?.clearedAt ? new Date(member.clearedAt) : null;
    }
    async clearRoomHistory(userId, roomId) {
        const room = await this.findRoomById(roomId);
        if (!room)
            throw new common_1.NotFoundException('Phòng chat không tồn tại');
        const [existing] = await this.db
            .select({ id: schema.chatRoomMembers.id })
            .from(schema.chatRoomMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.chatRoomMembers.roomId, roomId), (0, drizzle_orm_1.eq)(schema.chatRoomMembers.userId, userId)))
            .limit(1);
        if (existing) {
            await this.db
                .update(schema.chatRoomMembers)
                .set({ clearedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema.chatRoomMembers.id, existing.id));
        }
        else {
            await this.db.insert(schema.chatRoomMembers).values({
                roomId,
                userId,
                clearedAt: new Date(),
            });
        }
        return true;
    }
    async getCommunityMembersWithNotificationPref(communityId, excludeUserId) {
        const conditions = [
            (0, drizzle_orm_1.eq)(schema.communityMembers.communityId, communityId),
            (0, drizzle_orm_1.eq)(schema.communityMembers.status, 'JOINED'),
        ];
        if (excludeUserId) {
            conditions.push((0, drizzle_orm_1.sql) `${schema.communityMembers.userId} != ${excludeUserId}`);
        }
        return this.db
            .select({
            userId: schema.communityMembers.userId,
            notificationPreference: schema.communityMembers.notificationPreference,
        })
            .from(schema.communityMembers)
            .where((0, drizzle_orm_1.and)(...conditions));
    }
};
exports.ChatRepository = ChatRepository;
exports.ChatRepository = ChatRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.PG_CONNECTION)),
    __metadata("design:paramtypes", [Object])
], ChatRepository);
//# sourceMappingURL=chat.repository.js.map