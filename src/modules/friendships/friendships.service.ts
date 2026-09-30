import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  FriendshipsRepository,
  type FriendshipListItem,
  type FriendshipStatusView,
} from './friendships.repository';

type Actor = { id: string };

const ACTIVE_STATUSES = new Set(['PENDING', 'ACCEPTED', 'BLOCKED']);

/**
 * Nghiệp vụ bạn bè.
 *
 * Bảng `friendships` còn nguyên trong schema nhưng controller đã bị gỡ, khiến
 * web gọi `/social/*` nhận 404. Service này phục hồi đúng hợp đồng mà web đã
 * khai báo (`src/features/social/api.ts`).
 *
 * Quy tắc:
 * - Mỗi cặp người dùng chỉ có một quan hệ đang hoạt động (unique index trên
 *   cặp không thứ tự), nên gửi lời mời lần hai trả 409 thay vì tạo bản ghi mới.
 * - Huỷ bạn bè là soft delete, giữ lịch sử theo đúng ràng buộc đã harden.
 * - Trả về đúng shape web mong đợi, gồm cả lời mời đến và đi.
 */
@Injectable()
export class FriendshipsService {
  private readonly logger = new Logger(FriendshipsService.name);

  constructor(private readonly repository: FriendshipsRepository) {}

  private toStatusView(
    row: FriendshipRowLike | undefined,
    actorId: string,
  ): FriendshipStatusView {
    if (!row) {
      return { id: null, status: 'NONE', direction: 'NONE', senderId: null, receiverId: null };
    }
    return {
      id: row.id,
      status: row.status as FriendshipStatusView['status'],
      direction: row.senderId === actorId ? 'OUTGOING' : 'INCOMING',
      senderId: row.senderId,
      receiverId: row.receiverId,
    };
  }

  async list(actor: Actor): Promise<{ data: FriendshipListItem[] }> {
    const rows = await this.repository.listActiveForUser(actor.id);
    const friendIds = rows.map((row) =>
      row.senderId === actor.id ? row.receiverId : row.senderId,
    );
    const profiles = await this.repository.profilesFor(friendIds);

    const data: FriendshipListItem[] = rows.map((row) => {
      const friendId = row.senderId === actor.id ? row.receiverId : row.senderId;
      const profile = profiles.get(friendId);
      return {
        friendshipId: row.id,
        status: row.status,
        direction: row.senderId === actor.id ? 'OUTGOING' : 'INCOMING',
        senderId: row.senderId,
        receiverId: row.receiverId,
        friendId,
        friendName: profile?.name ?? null,
        friendAvatar: profile?.avatar ?? null,
      };
    });

    return { data };
  }

  async status(actor: Actor, otherUserId: string): Promise<{ data: FriendshipStatusView }> {
    if (otherUserId === actor.id) {
      throw new BadRequestException('Không thể tự kết bạn với chính mình.');
    }
    const row = await this.repository.findActiveBetween(actor.id, otherUserId);
    return { data: this.toStatusView(row, actor.id) };
  }

  async sendRequest(
    actor: Actor,
    receiverId: string,
  ): Promise<{ data: FriendshipStatusView }> {
    if (!receiverId || receiverId === actor.id) {
      throw new BadRequestException('Người nhận không hợp lệ.');
    }

    const existing = await this.repository.findActiveBetween(actor.id, receiverId);
    if (existing) {
      if (existing.status === 'ACCEPTED') {
        throw new ConflictException('Hai người đã là bạn bè.');
      }
      if (existing.status === 'PENDING') {
        // Người nhận đã gửi trước thì chuyển thành đã chấp nhận ngay thay vì
        // tạo quan hệ ngược chiều, vốn vi phạm unique index cặp không thứ tự.
        if (existing.senderId === receiverId) {
          const accepted = await this.repository.updateById(existing.id, {
            status: 'ACCEPTED',
            updatedAt: new Date(),
          });
          return { data: this.toStatusView(accepted, actor.id) };
        }
        throw new ConflictException('Đã có lời mời đang chờ trả lời.');
      }
      if (existing.status === 'BLOCKED') {
        throw new ForbiddenException('Không thể gửi lời mời tới người dùng này.');
      }
      // REJECTED đã bị đánh dấu deleted_at nên không xuất hiện ở đây.
    }

    const created = await this.repository.insert({
      senderId: actor.id,
      receiverId,
      status: 'PENDING',
    });
    this.logger.log(`Friend request ${created.id}: ${actor.id} -> ${receiverId}`);
    return { data: this.toStatusView(created, actor.id) };
  }

  async respond(
    actor: Actor,
    friendshipId: string,
    action: 'ACCEPTED' | 'REJECTED',
  ): Promise<{ data: FriendshipStatusView }> {
    const row = await this.repository.findById(friendshipId);
    if (!row || row.deletedAt) {
      throw new NotFoundException('Không tìm thấy lời mời kết bạn.');
    }
    // Chỉ người nhận mới trả lời được.
    if (row.receiverId !== actor.id) {
      throw new ForbiddenException('Chỉ người nhận mới có thể trả lời lời mời này.');
    }
    if (row.status !== 'PENDING') {
      throw new ConflictException('Lời mời này đã được xử lý.');
    }

    if (action === 'REJECTED') {
      // Từ chối cũng là soft delete để giữ lịch sử và mở lại được sau này.
      await this.repository.softDelete(row.id);
      return {
        data: { id: row.id, status: 'REJECTED', direction: 'INCOMING', senderId: row.senderId, receiverId: row.receiverId },
      };
    }

    const accepted = await this.repository.updateById(row.id, {
      status: 'ACCEPTED',
      updatedAt: new Date(),
    });
    return { data: this.toStatusView(accepted, actor.id) };
  }

  async remove(actor: Actor, friendshipId: string): Promise<{ data: FriendshipStatusView }> {
    const row = await this.repository.findById(friendshipId);
    if (!row || row.deletedAt) {
      throw new NotFoundException('Không tìm thấy quan hệ bạn bè.');
    }
    if (row.senderId !== actor.id && row.receiverId !== actor.id) {
      throw new ForbiddenException('Bạn không có quyền với quan hệ này.');
    }
    await this.repository.softDelete(row.id);
    return {
      data: { id: row.id, status: 'NONE', direction: 'NONE', senderId: null, receiverId: null },
    };
  }
}

type FriendshipRowLike = {
  id: string;
  senderId: string;
  receiverId: string;
  status: string;
  deletedAt: Date | null;
};

export { ACTIVE_STATUSES };
