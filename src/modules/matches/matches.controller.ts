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
} from '@nestjs/common';
import { MatchesService } from './matches.service';
import { QueryMatchDto } from './dto/query-match.dto';
import { OperateMatchDto } from './dto/operate-match.dto';
import { UpdateMatchScoreDto } from './dto/update-match-score.dto';
import { UpdateMatchStatusDto } from './dto/update-match-status.dto';
import { UpdateMatchScheduleDto } from './dto/update-match-schedule.dto';
import { CreateMatchCommentDto } from './dto/create-match-comment.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Roles } from '../../common/decorators/roles.decorator';
import { Verified } from '../../common/decorators/verified.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/constants/enums';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('matches')
@SkipThrottle()
@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Public()
  @SkipThrottle()
  @Get()
  @ApiOperation({ summary: 'Lấy danh sách trận đấu' })
  async findAll(@Query() query: QueryMatchDto) {
    return this.matchesService.findAll(query);
  }

  @Public()
  @SkipThrottle()
  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết trận đấu' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.matchesService.findOne(id);
  }

  @Public()
  @SkipThrottle()
  @Get(':id/comments')
  @ApiOperation({ summary: 'Lấy danh sách bình luận trận đấu' })
  async getComments(@Param('id', ParseUUIDPipe) id: string) {
    return await this.matchesService.getComments(id);
  }

  @Public()
  @SkipThrottle()
  @Post(':id/comments')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo bình luận trận đấu' })
  async createComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() createMatchCommentDto: CreateMatchCommentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return await this.matchesService.createComment(id, user, createMatchCommentDto);
  }

  @Patch(':id/score')
  @Verified()
  @ApiBearerAuth()
  @Roles(UserRole.REFEREE, UserRole.ADMIN)
  @ApiOperation({ summary: 'Cập nhật tỷ số trận đấu' })
  async updateScore(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateMatchScoreDto: UpdateMatchScoreDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return await this.matchesService.updateScore(id, user, updateMatchScoreDto);
  }

  @Patch(':id/status')
  @Verified()
  @ApiBearerAuth()
  @Roles(UserRole.REFEREE, UserRole.ADMIN, UserRole.ORGANIZER)
  @ApiOperation({
    summary: 'Cập nhật trạng thái trận đấu (ONGOING, COMPLETED)',
  })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateMatchStatusDto: UpdateMatchStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return await this.matchesService.updateStatus(id, user, updateMatchStatusDto);
  }

  @Patch(':id/schedule')
  @Verified()
  @ApiBearerAuth()
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Cập nhật lịch thi đấu, sân đấu và trọng tài' })
  async updateSchedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateMatchScheduleDto: UpdateMatchScheduleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return await this.matchesService.updateSchedule(id, user, updateMatchScheduleDto);
  }

  @Patch(':id/operation')
  @Verified()
  @ApiBearerAuth()
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Áp dụng quyết định nghiệp vụ đặc biệt cho trận đấu' })
  async operateMatch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() operateMatchDto: OperateMatchDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return await this.matchesService.operateMatch(id, user, operateMatchDto);
  }

  @Patch(':id/assign-referee')
  @Verified()
  @ApiBearerAuth()
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Phân công trọng tài cho trận đấu' })
  async assignReferee(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { refereeId: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return await this.matchesService.assignReferee(id, body.refereeId, user);
  }

  @Post(':id/mute-user')
  @ApiBearerAuth()
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Mute/block người dùng trong trận đấu' })
  async muteUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { userId: string; type: 'MUTE' | 'BAN'; reason?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return await this.matchesService.muteUser(id, body.userId, body.type, body.reason, user);
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
  @SkipThrottle()
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
