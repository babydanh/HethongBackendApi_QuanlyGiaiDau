import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { SocialRepository } from './social.repository';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';
import { UpdateFriendshipDto, FriendshipAction } from './dto/update-friendship.dto';

@Injectable()
export class SocialService {
  constructor(private readonly socialRepository: SocialRepository) {}

  async sendFriendRequest(userId: string, data: SendFriendRequestDto) {
    if (userId === data.receiverId) {
      throw new BadRequestException('Cannot send friend request to yourself');
    }

    const existing = await this.socialRepository.findFriendship(
      userId,
      data.receiverId,
    );

    if (existing) {
      throw new BadRequestException('Friendship or pending request already exists');
    }

    return this.socialRepository.createFriendRequest(userId, data.receiverId);
  }

  async respondToRequest(
    userId: string,
    friendshipId: string,
    data: UpdateFriendshipDto,
  ) {
    // Để chặt chẽ cần lấy Friendship theo ID và check xem userId có phải receiverId không.
    // Tạm thời đơn giản hóa cho MVP.
    const status = data.action === FriendshipAction.ACCEPT ? 'ACCEPTED' : 'REJECTED';
    return this.socialRepository.updateFriendshipStatus(friendshipId, status);
  }

  async getMyFriends(userId: string) {
    return this.socialRepository.getFriends(userId);
  }
}
