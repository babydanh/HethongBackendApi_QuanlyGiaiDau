import { SocialRepository } from './social.repository';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';
import { UpdateFriendshipDto } from './dto/update-friendship.dto';
export declare class SocialService {
    private readonly socialRepository;
    constructor(socialRepository: SocialRepository);
    sendFriendRequest(userId: string, data: SendFriendRequestDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        receiverId: string;
        senderId: string;
    }>;
    respondToRequest(userId: string, friendshipId: string, data: UpdateFriendshipDto): Promise<{
        id: string;
        senderId: string;
        receiverId: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    getMyFriends(userId: string): Promise<{
        friendshipId: string;
        status: string;
        friendId: string;
        friendName: string;
        friendAvatar: string | null;
    }[]>;
}
