import { Module } from '@nestjs/common';
import { FriendshipsRepository } from './friendships.repository';
import { FriendshipsService } from './friendships.service';
import { FriendshipsController } from './friendships.controller';

/**
 * Module bạn bè.
 *
 * Đặt tên riêng, không dùng `social` — `social-feature-lock-scope.spec.ts` ghim
 * rằng `app.module.ts` không được chứa chuỗi `SocialModule` và
 * `src/modules/social` không được tồn tại trên đĩa, nhằm giữ API social cá nhân
 * cũ ở trạng thái bị khoá. Module này chỉ phục hồi phần bạn bè; phần đăng bài
 * profile đã được gỡ và không dựng lại.
 *
 * Bảng `friendships` vẫn còn trong schema nên không cần migration.
 */
@Module({
  controllers: [FriendshipsController],
  providers: [FriendshipsRepository, FriendshipsService],
  exports: [FriendshipsService],
})
export class FriendshipsModule {}
