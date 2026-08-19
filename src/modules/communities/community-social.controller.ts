import { Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
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
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { UpdateCommunityCommentDto } from './dto/update-community-comment.dto';
import { ModerateCommunityCommentDto } from './dto/moderate-community-comment.dto';
import { UpdateCommunityReportStatusDto } from './dto/update-community-report-status.dto';

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
  @UseGuards(OptionalJwtAuthGuard)
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

  @Delete('posts/:postId')
  @Post('posts/:postId/delete')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa bài viết (tác giả hoặc BQT)' })
  deletePost(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @CurrentUser() user: { id: string; roles?: string[] },
  ) {
    return this.socialService.deletePost(communityId, postId, user);
  }

  @Get('posts/:postId/comments')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  listComments(@Param('communityId', ParseUUIDPipe) communityId: string, @Param('postId', ParseUUIDPipe) postId: string, @Query('limit') limit?: number, @Query('cursor') cursor?: string, @CurrentUser() user?: { id: string; roles?: string[] }) {
    return this.socialService.listComments(communityId, postId, Math.min(Math.max(Number(limit) || 20, 1), 50), cursor, user);
  }

  @Post('posts/:postId/comments')
  @ApiBearerAuth()
  createComment(@Param('communityId', ParseUUIDPipe) communityId: string, @Param('postId', ParseUUIDPipe) postId: string, @CurrentUser() user: { id: string; roles?: string[] }, @Body() dto: CreateCommunityCommentDto) {
    return this.socialService.createComment(communityId, postId, user, dto);
  }

  @Patch('comments/:commentId')
  @ApiBearerAuth()
  updateComment(@Param('communityId', ParseUUIDPipe) communityId: string, @Param('commentId', ParseUUIDPipe) commentId: string, @CurrentUser() user: { id: string; roles?: string[] }, @Body() dto: UpdateCommunityCommentDto) {
    return this.socialService.updateComment(communityId, commentId, user, dto);
  }

  @Post('comments/:commentId/delete')
  @ApiBearerAuth()
  deleteComment(@Param('communityId', ParseUUIDPipe) communityId: string, @Param('commentId', ParseUUIDPipe) commentId: string, @CurrentUser() user: { id: string; roles?: string[] }) {
    return this.socialService.deleteComment(communityId, commentId, user);
  }

  @Patch('comments/:commentId/moderation')
  @ApiBearerAuth()
  moderateComment(@Param('communityId', ParseUUIDPipe) communityId: string, @Param('commentId', ParseUUIDPipe) commentId: string, @CurrentUser() user: { id: string; roles?: string[] }, @Body() dto: ModerateCommunityCommentDto) {
    return this.socialService.moderateComment(communityId, commentId, user, dto.status, dto.reason);
  }

  @Get('moderation/posts')
  @ApiBearerAuth()
  listPendingPosts(@Param('communityId', ParseUUIDPipe) communityId: string, @CurrentUser() user: { id: string; roles?: string[] }) {
    return this.socialService.listPendingPosts(communityId, user);
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

  @Get('moderation/reports')
  @ApiBearerAuth()
  listReports(@Param('communityId', ParseUUIDPipe) communityId: string, @CurrentUser() user: { id: string; roles?: string[] }, @Query('status') status?: string) {
    return this.socialService.listReports(communityId, user, status);
  }

  @Patch('moderation/reports/:reportId')
  @ApiBearerAuth()
  updateReport(@Param('communityId', ParseUUIDPipe) communityId: string, @Param('reportId', ParseUUIDPipe) reportId: string, @CurrentUser() user: { id: string; roles?: string[] }, @Body() dto: UpdateCommunityReportStatusDto) {
    return this.socialService.updateReportStatus(communityId, reportId, user, dto.status);
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

  @Post('polls/:pollId/vote')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bình chọn hoặc hủy bình chọn một lựa chọn trong poll' })
  votePoll(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('pollId', ParseUUIDPipe) pollId: string,
    @CurrentUser() user: { id: string; roles?: string[] },
    @Body('optionId') optionId: string,
  ) {
    return this.socialService.votePoll(communityId, pollId, optionId, user);
  }

  @Post('polls/:pollId/options')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thêm một lựa chọn mới vào poll' })
  addPollOption(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('pollId', ParseUUIDPipe) pollId: string,
    @CurrentUser() user: { id: string; roles?: string[] },
    @Body('optionText') optionText: string,
  ) {
    return this.socialService.addPollOption(communityId, pollId, optionText, user);
  }

  @Post('polls/:pollId/close')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Kết thúc cuộc bình chọn sớm' })
  closePoll(
    @Param('communityId', ParseUUIDPipe) communityId: string,
    @Param('pollId', ParseUUIDPipe) pollId: string,
    @CurrentUser() user: { id: string; roles?: string[] },
  ) {
    return this.socialService.closePoll(communityId, pollId, user);
  }
}
