import type { AppDb } from '../../database/db.types';
export declare class SocialRepository {
    private readonly db;
    constructor(db: AppDb);
    createFriendRequest(senderId: string, receiverId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        senderId: string;
        receiverId: string;
    }>;
    findFriendship(userA: string, userB: string): Promise<{
        id: string;
        senderId: string;
        receiverId: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    updateFriendshipStatus(id: string, status: string): Promise<{
        id: string;
        senderId: string;
        receiverId: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    getFriends(userId: string): Promise<{
        friendshipId: string;
        status: string;
        friendId: string;
        friendName: string;
        friendAvatar: string | null;
    }[]>;
}
