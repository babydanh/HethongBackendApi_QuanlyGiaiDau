import { SocialService } from './social.service';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';
import { UpdateFriendshipDto } from './dto/update-friendship.dto';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
export declare class SocialController {
    private readonly socialService;
    constructor(socialService: SocialService);
    sendFriendRequest(sendFriendRequestDto: SendFriendRequestDto, user: JwtPayload): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        senderId: string;
        receiverId: string;
    }>;
    respondToRequest(id: string, updateFriendshipDto: UpdateFriendshipDto, user: JwtPayload): Promise<{
        id: string;
        senderId: string;
        receiverId: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    getFriends(user: JwtPayload): Promise<{
        friendshipId: string;
        status: string;
        friendId: string;
        friendName: string;
        friendAvatar: string | null;
    }[]>;
}
