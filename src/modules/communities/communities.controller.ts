import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CommunitiesService } from './communities.service';
import { CreateCommunityDto } from './dto/create-community.dto';
import { UpdateCommunityDto } from './dto/update-community.dto';
import { QueryCommunityDto } from './dto/query-community.dto';
import { ReviewCommunityDto } from './dto/review-community.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { JoinCommunityDto } from './dto/join-community.dto';
import { ReviewJoinDto } from './dto/review-join.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { CreateGalleryItemDto } from './dto/create-gallery-item.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Verified } from '../../common/decorators/verified.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/constants/enums';
import { Throttle } from '@nestjs/throttler';

@ApiTags('communities')
@Controller('communities')
export class CommunitiesController {
  constructor(private readonly communitiesService: CommunitiesService) {}

  // --- COMMUNITIES ---

  @Public()
  @Get()
  @ApiOperation({ summary: 'Lấy danh sách các cộng đồng' })
  @ApiResponse({ status: 200, description: 'Danh sách cộng đồng' })
  async findAll(@Query() query: QueryCommunityDto) {
    // Public endpoint: luôn chỉ trả ACTIVE, bỏ qua status client gửi để tránh lộ PENDING
    query.status = 'ACTIVE';
    return await this.communitiesService.findAll(query);
  }

  @Get('my')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy danh sách cộng đồng của tôi' })
  async findMyCommunities(@CurrentUser() user: { id: string }) {
    return await this.communitiesService.findMyCommunities(user.id);
  }

  @Get('my/invites')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy danh sách lời mời tham gia cộng đồng của tôi' })
  async findMyInvites(@CurrentUser() user: { id: string }) {
    return await this.communitiesService.getMyInvites(user.id);
  }

  @Get('favorites')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy danh sách cộng đồng yêu thích' })
  async findFavorites(@CurrentUser() user: { id: string }) {
    return await this.communitiesService.getFavorites(user.id);
  }

  @Get('pending')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy danh sách cộng đồng chờ duyệt (Chỉ ADMIN)' })
  async findPending(@Query() query: QueryCommunityDto) {
    query.status = 'PENDING';
    return await this.communitiesService.findAll(query);
  }

  @Get('admin')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy tất cả cộng đồng (Admin) - bao gồm đã khoá' })
  async findAllAdmin(@Query() query: QueryCommunityDto) {
    return await this.communitiesService.findAll(query);
  }

  @Public()
  @Throttle({ default: { limit: 1800, ttl: 60000 } })
  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết 1 cộng đồng' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: { id: string; roles: string[] },
  ) {
    return await this.communitiesService.findById(id, user);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo cộng đồng mới (User đã login)' })
  async create(
    @CurrentUser() user: { id: string; roles: string[] },
    @Body() createCommunityDto: CreateCommunityDto,
  ) {
    return await this.communitiesService.create(user.id, createCommunityDto);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật cộng đồng (OWNER hoặc MODERATOR)' })
  async update(
    @CurrentUser() user: { id: string; roles: string[] },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateCommunityDto: UpdateCommunityDto,
  ) {
    return await this.communitiesService.update(
      user.id,
      id,
      updateCommunityDto,
      user.roles,
    );
  }

  @Patch(':id/review')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Duyệt / Từ chối cộng đồng (Chỉ ADMIN)' })
  async review(
    @CurrentUser() user: { id: string; roles: string[] },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() reviewDto: ReviewCommunityDto,
  ) {
    return await this.communitiesService.review(user.id, id, reviewDto, user.roles);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa cộng đồng (OWNER hoặc ADMIN)' })
  async remove(
    @CurrentUser() user: { id: string; roles: string[] },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return await this.communitiesService.remove(user.id, id, user.roles);
  }

  // --- MEMBERS ---

  @Public()
  @Throttle({ default: { limit: 1800, ttl: 60000 } })
  @Get(':id/members')
  @ApiOperation({ summary: 'Lấy danh sách thành viên cộng đồng' })
  async getMembers(@Param('id', ParseUUIDPipe) id: string) {
    return await this.communitiesService.getMembers(id);
  }

  @Post(':id/members')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thêm thành viên vào cộng đồng (OWNER/MODERATOR)' })
  async addMember(
    @CurrentUser() user: { id: string; roles: string[] },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() addMemberDto: AddMemberDto,
  ) {
    return await this.communitiesService.addMember(
      user.id,
      id,
      addMemberDto,
      user.roles,
    );
  }

  @Patch(':id/members/:userId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sửa role thành viên (Chỉ OWNER)' })
  async updateMemberRole(
    @CurrentUser() user: { id: string; roles: string[] },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() updateMemberDto: UpdateMemberDto,
  ) {
    return await this.communitiesService.updateMemberRole(
      user.id,
      id,
      userId,
      updateMemberDto,
      user.roles,
    );
  }

  @Delete(':id/members/:userId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Xóa thành viên khỏi cộng đồng (OWNER/MODERATOR hoặc tự rời đi)',
  })
  async removeMember(
    @CurrentUser() user: { id: string; roles: string[] },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return await this.communitiesService.removeMember(
      user.id,
      id,
      userId,
      user.roles,
    );
  }

  @Post(':id/members/:userId/ban')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cấm thành viên khỏi cộng đồng (OWNER/MODERATOR theo quyền)' })
  async banMember(
    @CurrentUser() user: { id: string; roles: string[] },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return await this.communitiesService.banMember(user.id, id, userId, user.roles);
  }

  @Delete(':id/members/:userId/ban')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Gỡ cấm thành viên khỏi cộng đồng (OWNER/MODERATOR theo quyền)' })
  async unbanMember(
    @CurrentUser() user: { id: string; roles: string[] },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return await this.communitiesService.unbanMember(user.id, id, userId, user.roles);
  }
  @Post(':id/join')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xin tham gia cộng đồng' })
  async joinCommunity(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: JoinCommunityDto
  ) {
    return await this.communitiesService.joinCommunity(user.id, id, body.joinAnswers);
  }

  @Patch(':id/join-requests/:memberId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Duyệt/Từ chối đơn xin vào' })
  async reviewJoinRequest(
    @CurrentUser() user: { id: string; roles: string[] },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() body: ReviewJoinDto
  ) {
    return await this.communitiesService.reviewJoinRequest(user.id, id, memberId, body.action, user.roles);
  }

  @Post(':id/follow')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Theo dõi cộng đồng' })
  async followCommunity(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return await this.communitiesService.followCommunity(user.id, id);
  }

  @Delete(':id/follow')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bỏ theo dõi cộng đồng' })
  async unfollowCommunity(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return await this.communitiesService.unfollowCommunity(user.id, id);
  }

  @Post(':id/favorite')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Yêu thích cộng đồng' })
  async favoriteCommunity(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return await this.communitiesService.favoriteCommunity(user.id, id);
  }

  @Delete(':id/favorite')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bỏ yêu thích cộng đồng' })
  async unfavoriteCommunity(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return await this.communitiesService.unfavoriteCommunity(user.id, id);
  }
  @Get(':id/join-requests')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Danh sách đơn xin vào' })
  async getJoinRequests(
    @CurrentUser() user: { id: string; roles: string[] },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return await this.communitiesService.getJoinRequests(user.id, id, user.roles);
  }

  @Post(':id/invite')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mời thành viên' })
  async inviteMember(
    @CurrentUser() user: { id: string; roles: string[] },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: InviteMemberDto
  ) {
    return await this.communitiesService.inviteMember(user.id, id, body.userId, body.role, user.roles);
  }

  @Post(':id/invite/:action')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Chấp nhận/Từ chối lời mời' })
  async respondToInvite(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('action') action: 'accept' | 'decline'
  ) {
    const act = action === 'accept' ? 'ACCEPT' : 'DECLINE';
    return await this.communitiesService.respondToInvite(user.id, id, act);
  }

  @Public()
  @Throttle({ default: { limit: 1800, ttl: 60000 } })
  @Get(':id/gallery')
  @ApiOperation({ summary: 'Lấy gallery ảnh' })
  async getGallery(@Param('id', ParseUUIDPipe) id: string) {
    return await this.communitiesService.getGallery(id);
  }

  @Post(':id/gallery')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload ảnh lên gallery' })
  async addGalleryItem(
    @CurrentUser() user: { id: string; roles: string[] },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateGalleryItemDto
  ) {
    return await this.communitiesService.addGalleryItem(user.id, id, body.imageUrl, body.caption, user.roles);
  }

  @Delete(':id/gallery/:imageId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xoá ảnh gallery' })
  async removeGalleryItem(
    @CurrentUser() user: { id: string; roles: string[] },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ) {
    return await this.communitiesService.removeGalleryItem(user.id, id, imageId, user.roles);
  }

  @Public()
  @Throttle({ default: { limit: 1800, ttl: 60000 } })
  @Get(':id/tournaments')
  @ApiOperation({ summary: 'Lấy giải đấu trong cộng đồng' })
  async getTournaments(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('status') status?: string
  ) {
    return await this.communitiesService.getTournaments(id, status);
  }

  @Public()
  @Throttle({ default: { limit: 1800, ttl: 60000 } })
  @Get(':id/rankings')
  @ApiOperation({ summary: 'Lấy bảng xếp hạng trong cộng đồng' })
  async getRankings(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: number
  ) {
    return await this.communitiesService.getRankings(id, limit ? Number(limit) : undefined);
  }
}
