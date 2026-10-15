import {
  Controller,
  Get,
  Body,
  Patch,
  Post,
  Delete,
  Param,
  Query,
  ParseUUIDPipe,
  Header,
  UseGuards,
} from '@nestjs/common';
import { MatchesService } from './matches.service';
import { QueryMatchDto } from './dto/query-match.dto';
import { OperateMatchDto } from './dto/operate-match.dto';
import { UpdateMatchScoreDto } from './dto/update-match-score.dto';
import { UpdateMatchCourtStateDto } from './dto/update-match-court-state.dto';
import { UpdateMatchStatusDto } from './dto/update-match-status.dto';
import { UpdateScoreboardVisibilityDto } from './dto/update-scoreboard-visibility.dto';
import { UpdateOverlayVisibilityDto } from './dto/update-overlay-visibility.dto';
import { UpdateMatchScheduleDto } from './dto/update-match-schedule.dto';
import { CreateMatchCommentDto } from './dto/create-match-comment.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/decorators/roles.decorator';
import { Verified } from '../../common/decorators/verified.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { UserRole } from '../../common/constants/enums';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { OverlayService } from './overlay/overlay.service';

@ApiTags('matches')
@SkipThrottle()
@Controller('matches')
export class MatchesController {
  constructor(
    private readonly matchesService: MatchesService,
    private readonly overlayService: OverlayService,
  ) {}

  @Public()
  @SkipThrottle()
  @Header(
    'Cache-Control',
    'public, max-age=0, s-maxage=30, stale-while-revalidate=15',
  )
  @Header('Vary', 'Accept-Encoding')
  @Get()
  @ApiOperation({ summary: 'Lấy danh sách trận đấu' })
  async findAll(@Query() query: QueryMatchDto) {
    return this.matchesService.findAll(query);
  }

  @Public()
  @SkipThrottle()
  @UseGuards(OptionalJwtAuthGuard)
  @Header('Cache-Control', 'private, no-store')
  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết trận đấu' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.matchesService.findOne(id, user);
  }

  /**
   * View-model H2H và bảng nhánh để Web/App vẽ phủ lên video. Quyền xem giống `GET :id`;
   * hai cờ hiện/ẩn luôn mới, nội dung cache ngắn ở server.
   */
  @Public()
  @SkipThrottle()
  @UseGuards(OptionalJwtAuthGuard)
  @Header('Cache-Control', 'private, no-store')
  @Get(':id/overlay')
  @ApiOperation({ summary: 'Dữ liệu dựng sẵn cho overlay H2H và bảng nhánh trên video' })
  async getOverlay(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.overlayService.getOverlay(id, user);
  }
  @Header('Cache-Control', 'private, no-store')
  @Get(':id/score-access')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN, UserRole.REFEREE, UserRole.PLAYER)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Kiểm tra quyền nhập điểm của người dùng hiện tại' })
  async getScoreAccess(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.matchesService.getScoreAccess(id, user);
  }


  @Public()
  @SkipThrottle()
  @Get(':id/comments')
  @ApiOperation({ summary: 'Lấy danh sách bình luận trận đấu' })
  async getComments(@Param('id', ParseUUIDPipe) id: string) {
    return await this.matchesService.getComments(id);
  }

  @UseGuards(new RateLimitGuard(10, 60_000))
  @Post(':id/comments')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo bình luận trận đấu' })
  async createComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() createMatchCommentDto: CreateMatchCommentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return await this.matchesService.createComment(
      id,
      user,
      createMatchCommentDto,
    );
  }

  @Patch(':id/score')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN, UserRole.REFEREE, UserRole.PLAYER)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật tỷ số trận đấu' })
  async updateScore(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateMatchScoreDto: UpdateMatchScoreDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return await this.matchesService.updateScore(id, user, updateMatchScoreDto);
  }

  @Patch(':id/court-state')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN, UserRole.REFEREE, UserRole.PLAYER)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật cài đặt sân pickleball (CourtState)' })
  async updateCourtState(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateMatchCourtStateDto: UpdateMatchCourtStateDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return await this.matchesService.updateCourtState(
      id,
      user,
      updateMatchCourtStateDto,
    );
  }

  @Patch(':id/scoreboard-visibility')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN, UserRole.REFEREE)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Ẩn/hiện bảng điểm live của trận cho mọi người xem',
  })
  async setScoreboardVisibility(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateScoreboardVisibilityDto: UpdateScoreboardVisibilityDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return await this.matchesService.setScoreboardVisibility(
      id,
      user,
      updateScoreboardVisibilityDto,
    );
  }

  @Patch(':id/overlay-visibility')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN, UserRole.REFEREE)
  @Verified()
  @SkipThrottle({ default: false })
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Bật/tắt overlay H2H hoặc bảng nhánh trên sóng live',
  })
  async setOverlayVisibility(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateOverlayVisibilityDto: UpdateOverlayVisibilityDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return await this.matchesService.setOverlayVisibility(
      id,
      user,
      updateOverlayVisibilityDto,
    );
  }

  /**
   * Super Lite Live entry point. Authentication is still required by the
   * global JwtAuthGuard; the service verifies the canonical Super Lite flag
   * and never grants management permissions through this route.
   */
  @Patch(':id/lite-score')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tài khoản đã đăng nhập cập nhật tỷ số Super Lite' })
  async updateLiteScore(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateMatchScoreDto: UpdateMatchScoreDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return await this.matchesService.updateScore(id, user, updateMatchScoreDto);
  }

  @Patch(':id/status')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN, UserRole.REFEREE, UserRole.PLAYER)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cập nhật trạng thái trận đấu (ONGOING, COMPLETED)',
  })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateMatchStatusDto: UpdateMatchStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return await this.matchesService.updateStatus(
      id,
      user,
      updateMatchStatusDto,
    );
  }

  /**
   * Super Lite Live entry point. Any authenticated user with access to the
   * match may start/finish it; scheduling and operations remain protected by
   * their existing management endpoints.
   */
  @Patch(':id/lite-status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tài khoản đã đăng nhập đổi trạng thái Super Lite' })
  async updateLiteStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateMatchStatusDto: UpdateMatchStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return await this.matchesService.updateStatus(
      id,
      user,
      updateMatchStatusDto,
    );
  }

  @Patch(':id/schedule')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN, UserRole.PLAYER)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật lịch thi đấu, sân đấu và trọng tài' })
  async updateSchedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateMatchScheduleDto: UpdateMatchScheduleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return await this.matchesService.updateSchedule(
      id,
      user,
      updateMatchScheduleDto,
    );
  }

  @Patch(':id/operation')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN, UserRole.PLAYER)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Áp dụng quyết định nghiệp vụ đặc biệt cho trận đấu',
  })
  async operateMatch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() operateMatchDto: OperateMatchDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return await this.matchesService.operateMatch(id, user, operateMatchDto);
  }

  @Patch(':id/assign-referee')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Phân công trọng tài cho trận đấu' })
  async muteUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { userId: string; type: 'MUTE' | 'BAN'; reason?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return await this.matchesService.muteUser(
      id,
      body.userId,
      body.type,
      body.reason,
      user,
    );
  }

  @Delete(':id/unmute-user/:userId')
  @ApiBearerAuth()
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Bỏ mute/unban người dùng trong trận đấu' })
  async unmuteUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return await this.matchesService.unmuteUser(id, userId, user);
  }

  @Get(':id/muted-users')
  @ApiBearerAuth()
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Danh sách người dùng bị mute/ban' })
  async getMutedUsers(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return await this.matchesService.getMutedUsers(id, user);
  }

  @Public()
  @UseGuards(new RateLimitGuard(20, 60_000))
  @Post(':id/cheer')
  @ApiOperation({ summary: 'Cổ vũ trận đấu (tăng cheer count)' })
  async cheerMatch(@Param('id', ParseUUIDPipe) id: string) {
    return await this.matchesService.cheerMatch(id);
  }

  @Public()
  @SkipThrottle()
  @Get(':id/cheer-count')
  @ApiOperation({ summary: 'Lấy số lượng cổ vũ của trận đấu' })
  async getCheerCount(@Param('id', ParseUUIDPipe) id: string) {
    return await this.matchesService.getCheerCount(id);
  }
}
