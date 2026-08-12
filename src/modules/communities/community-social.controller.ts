import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CommunitySocialService } from './community-social.service';
import { CreateCommunityPostDto } from './dto/create-community-post.dto';
import { QueryCommunityPostsDto } from './dto/query-community-posts.dto';
import { CreateCommunityCommentDto } from './dto/create-community-comment.dto';
import { ReactCommunityPostDto } from './dto/react-community-post.dto';
import { UpdateCommunitySocialSettingsDto } from './dto/update-community-social-settings.dto';
import { ReportCommunityContentDto } from './dto/report-community-content.dto';
import { UpdateCommunityPreferencesDto } from './dto/update-community-preferences.dto';
import { ModerateCommunityPostDto } from './dto/moderate-community-post.dto';

@ApiTags('community-social')
@Controller('communities/:communityId')
export class CommunitySocialController {
  constructor(private readonly socialService: CommunitySocialService) {}

  @Public()
  @Get('social-settings')
  @ApiOperation({ summary: 'Lấy cài đặt không gian sinh hoạt cộng đồng' })
  getSettings(@Param('communityId', ParseUUIDPipe) communityId: string) {
    return this.socialService.getSettings(communityId);
  }

  @Patch('social-settings')
  @ApiBearerAuth()
  updateSettings(@Param('communityId', ParseUUIDPipe) communityId: string, @CurrentUser() user: { id: string; roles?: string[] }, @Body() dto: UpdateCommunitySocialSettingsDto) {
    return this.socialService.updateSettings(communityId, user, dto);
  }

  @Public()
  @Get('posts')
  @ApiOperation({ summary: 'Lấy feed bài viết theo cursor, thứ tự mới nhất trước' })
  listPosts(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Query() query: QueryCommunityPostsDto,
    @CurrentUser() user?: { id: string; roles?: string[] },
  ) {
    return this.socialService.listPosts(communityId, query.limit ?? 20, query.cursor, user);
  }

  @Post('posts')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đăng bài vào cộng đồng' })
  createPost(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @CurrentUser() user: { id: string; roles?: string[] },
    @Body() dto: CreateCommunityPostDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.socialService.createPost(communityId, user, dto, idempotencyKey);
  }

  @Get('posts/:postId/comments')
  @Public()
  listComments(@Param('communityId', ParseUUIDPipe) communityId: string, @Param('postId', ParseUUIDPipe) postId: string, @Query('limit') limit?: number, @Query('cursor') cursor?: string) {
    return this.socialService.listComments(communityId, postId, Math.min(Math.max(Number(limit) || 20, 1), 50), cursor);
  }

  @Post('posts/:postId/comments')
  @ApiBearerAuth()
  createComment(@Param('communityId', ParseUUIDPipe) communityId: string, @Param('postId', ParseUUIDPipe) postId: string, @CurrentUser() user: { id: string; roles?: string[] }, @Body() dto: CreateCommunityCommentDto) {
    return this.socialService.createComment(communityId, postId, user, dto);
  }

  @Post('posts/:postId/reaction')
  @ApiBearerAuth()
  react(@Param('communityId', ParseUUIDPipe) communityId: string, @Param('postId', ParseUUIDPipe) postId: string, @CurrentUser() user: { id: string; roles?: string[] }, @Body() dto: ReactCommunityPostDto) {
    return this.socialService.react(communityId, postId, user, dto.reactionType);
  }

  @Post('posts/:postId/report')
  @ApiBearerAuth()
  report(@Param('communityId', ParseUUIDPipe) communityId: string, @Param('postId', ParseUUIDPipe) postId: string, @CurrentUser() user: { id: string; roles?: string[] }, @Body() dto: ReportCommunityContentDto) {
    return this.socialService.report(communityId, postId, user, dto);
  }

  @Patch('posts/:postId/moderation')
  @ApiBearerAuth()
  moderate(@Param('communityId', ParseUUIDPipe) communityId: string, @Param('postId', ParseUUIDPipe) postId: string, @CurrentUser() user: { id: string; roles?: string[] }, @Body() dto: ModerateCommunityPostDto) {
    return this.socialService.moderatePost(communityId, postId, user, dto.status);
  }

  @Patch('social-preferences')
  @ApiBearerAuth()
  updatePreferences(@Param('communityId', ParseUUIDPipe) communityId: string, @CurrentUser() user: { id: string; roles?: string[] }, @Body() dto: UpdateCommunityPreferencesDto) {
    return this.socialService.updatePreferences(communityId, user, dto);
  }
}
