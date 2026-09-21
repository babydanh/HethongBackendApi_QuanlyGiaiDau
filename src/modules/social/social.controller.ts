import { Controller, Get, Post, Body, Patch, Delete, Param, ParseUUIDPipe, Query, Headers, UseGuards } from '@nestjs/common';
import { SocialService } from './social.service';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';
import { UpdateFriendshipDto } from './dto/update-friendship.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { SocialFeatureLockGuard } from '../../common/guards/social-feature-lock.guard';
import { CreateProfilePostDto } from './dto/create-profile-post.dto';
import { CreateCommunityCommentDto } from '../communities/dto/create-community-comment.dto';
import { ReactCommunityPostDto } from '../communities/dto/react-community-post.dto';

@ApiTags('social')
@ApiBearerAuth()
@Controller('social')
@UseGuards(SocialFeatureLockGuard)
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  @Post('friend-requests')
  @UseGuards(new RateLimitGuard(20, 60_000))
  @ApiOperation({ summary: 'Gửi lời mời kết bạn' })
  async sendFriendRequest(
    @Body() sendFriendRequestDto: SendFriendRequestDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.socialService.sendFriendRequest(user.sub, sendFriendRequestDto);
  }

  @Patch('friend-requests/:id')
  @UseGuards(new RateLimitGuard(20, 60_000))
  @ApiOperation({ summary: 'Phản hồi lời mời kết bạn (Chấp nhận/Từ chối)' })
  async respondToRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateFriendshipDto: UpdateFriendshipDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.socialService.respondToRequest(user.sub, id, updateFriendshipDto);
  }

  @Get('friends')
  @ApiOperation({ summary: 'Lấy danh sách bạn bè (và lời mời)' })
  async getFriends(@CurrentUser() user: JwtPayload) {
    return this.socialService.getMyFriends(user.sub);
  }

  @Get('feed')
  @ApiOperation({ summary: 'Bảng tin bài viết cá nhân của mình và bạn bè' })
  async getProfileFeed(
    @CurrentUser() user: JwtPayload,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.socialService.listProfileFeed(user.sub, this.normalizeLimit(limit), cursor);
  }

  @Get('posts/mine')
  @ApiOperation({ summary: 'Danh sách bài viết cá nhân của tôi' })
  async getMyProfilePosts(
    @CurrentUser() user: JwtPayload,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.socialService.listMyProfilePosts(user.sub, this.normalizeLimit(limit), cursor);
  }

  @Post('posts')
  @UseGuards(new RateLimitGuard(20, 60_000))
  @ApiOperation({ summary: 'Đăng bài viết lên trang cá nhân' })
  async createProfilePost(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateProfilePostDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.socialService.createProfilePost(user.sub, dto, idempotencyKey);
  }

  @Delete('posts/:postId')
  @UseGuards(new RateLimitGuard(20, 60_000))
  @ApiOperation({ summary: 'Xóa bài viết cá nhân của tôi' })
  async deleteProfilePost(
    @Param('postId', ParseUUIDPipe) postId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.socialService.deleteProfilePost(postId, user.sub);
  }

  @Get('posts/:postId/comments')
  @ApiOperation({ summary: 'Xem bình luận bài viết cá nhân' })
  async listProfileComments(
    @Param('postId', ParseUUIDPipe) postId: string,
    @CurrentUser() user: JwtPayload,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.socialService.listProfileComments(postId, user.sub, this.normalizeLimit(limit), cursor);
  }

  @Post('posts/:postId/comments')
  @UseGuards(new RateLimitGuard(40, 60_000))
  @ApiOperation({ summary: 'Bình luận bài viết cá nhân' })
  async createProfileComment(
    @Param('postId', ParseUUIDPipe) postId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateCommunityCommentDto,
  ) {
    return this.socialService.createProfileComment(postId, user.sub, dto);
  }

  @Post('posts/:postId/reaction')
  @UseGuards(new RateLimitGuard(60, 60_000))
  @ApiOperation({ summary: 'Thả hoặc bỏ cảm xúc cho bài viết cá nhân' })
  async reactToProfilePost(
    @Param('postId', ParseUUIDPipe) postId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: ReactCommunityPostDto,
  ) {
    return this.socialService.reactToProfilePost(postId, user.sub, dto.reactionType);
  }

  @Get('posts/:postId/reactions')
  @ApiOperation({ summary: 'Xem cảm xúc của bài viết cá nhân' })
  async getProfilePostReactions(
    @Param('postId', ParseUUIDPipe) postId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.socialService.getProfilePostReactions(postId, user.sub);
  }

  @Post('posts/:postId/share')
  @UseGuards(new RateLimitGuard(20, 60_000))
  @ApiOperation({ summary: 'Chia sẻ bài viết cá nhân lên bảng tin' })
  async shareProfilePost(
    @Param('postId', ParseUUIDPipe) postId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateProfilePostDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.socialService.shareProfilePost(postId, user.sub, dto, idempotencyKey);
  }

  @Get('friendships/status/:userId')
  @ApiOperation({ summary: 'Lấy trạng thái kết bạn với một người dùng' })
  async getFriendshipStatus(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.socialService.getFriendshipStatus(user.sub, userId);
  }

  @Delete('friendships/:id')
  @UseGuards(new RateLimitGuard(20, 60_000))
  @ApiOperation({ summary: 'Thu hồi lời mời hoặc hủy kết bạn' })
  async deleteFriendship(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.socialService.deleteFriendship(user.sub, id);
  }

  private normalizeLimit(raw?: string) {
    return Math.min(Math.max(Number(raw) || 20, 1), 50);
  }
}
