import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RankingsService } from './rankings.service';
import { AdminRankingService } from './admin-ranking.service';
import {
  AdminEloOperationDto,
  AdminEloQueryDto,
  AdminEloHistoryQueryDto,
  AdminEloPlayerQueryDto,
  AdminEloPlayerDetailQueryDto,
} from './dto/admin-elo-operation.dto';
import { FootballTeamEloService } from './football-team-elo.service';
import { QueryRankingDto } from './dto/query-ranking.dto';
import { UpdateEloDto } from './dto/update-elo.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('rankings')
@Controller('rankings')
export class RankingsController {
  constructor(
    private readonly rankingsService: RankingsService,
    private readonly footballTeamEloService: FootballTeamEloService,
    private readonly adminRankingService: AdminRankingService,
  ) {}

  @Public()
  @Get('football-teams')
  @ApiOperation({ summary: 'Bảng xếp hạng ELO bóng đá theo đội' })
  async getFootballTeamLeaderboard(@Query() query: QueryRankingDto) {
    return this.footballTeamEloService.getLeaderboard(
      query.categoryId,
      query.limit,
      query.cursor,
      query.communityId,
    );
  }

  @Public()
  @ApiBearerAuth()
  @Throttle({ default: { limit: 1800, ttl: 60000 } })
  @Get()
  @ApiOperation({ summary: 'Lấy bảng xếp hạng theo môn thể thao' })
  async getLeaderboard(@Query() query: QueryRankingDto) {
    return this.rankingsService.getLeaderboard(query);
  }

  @Get('admin/players')
  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Danh sách người chơi Elo đã nhóm theo bộ môn (Admin)',
  })
  async listAdminEloPlayers(@Query() query: AdminEloPlayerQueryDto) {
    return this.adminRankingService.listPlayers(query);
  }

  @Get('admin/players/:userId/detail')
  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Hồ sơ Elo chi tiết của người chơi theo bộ môn (Admin)',
  })
  async getAdminEloPlayerDetail(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: AdminEloPlayerDetailQueryDto,
  ) {
    return this.adminRankingService.getPlayerDetail(userId, query);
  }

  @Get('admin/contexts')
  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Danh sách context ELO để quản trị (Admin)' })
  async listAdminRankingContexts(@Query() query: AdminEloQueryDto) {
    return this.adminRankingService.listContexts(query);
  }

  @Get('admin/contexts/:contextId/history')
  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Lịch sử điều chỉnh ELO của context (Admin)' })
  async getAdminRankingHistory(
    @Param('contextId', ParseUUIDPipe) contextId: string,
    @Query() query: AdminEloHistoryQueryDto,
  ) {
    if (query.direction && query.direction !== 'next')
      throw new BadRequestException('ELO_CURSOR_DIRECTION_UNSUPPORTED');
    return this.adminRankingService.getHistory(
      contextId,
      query.limit,
      query.cursor,
    );
  }

  @Post('admin/operations')
  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Điều chỉnh ELO hoặc trạng thái bảng xếp hạng (Admin)',
  })
  async applyAdminRankingOperation(
    @CurrentUser() admin: { id: string },
    @Body() dto: AdminEloOperationDto,
  ) {
    return this.adminRankingService.applyOperation(admin.id, dto);
  }

  @Public()
  @Get('user/:userId')
  @ApiOperation({ summary: 'Lấy tổng hợp ELO của user (Public + các CLB)' })
  async getUserRankings(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.rankingsService.getUserRankings(userId);
  }

  @Public()
  @Get('user/:userId/history')
  @ApiOperation({ summary: 'Lấy lịch sử biến động ELO của user' })
  async getEloHistory(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('categoryId') categoryId?: string,
    @Query('scope') scope?: 'PUBLIC' | 'COMMUNITY',
    @Query('communityId') communityId?: string,
    @Query('matchType') matchType?: string,
    @Query('genderRestriction') genderRestriction?: string,
    @Query('partnerId') partnerId?: string,
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.rankingsService.getEloHistory(userId, {
      categoryId,
      scope,
      communityId,
      matchType,
      genderRestriction,
      partnerId,
      limit: limit ? Number(limit) : 20,
      cursor,
    });
  }

  // Internal/Admin endpoint for triggering ELO update manually if needed
  @Post('update-elo')
  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Tính lại ELO cho 1 trận đấu (Admin)' })
  async updateElo(@Body() updateEloDto: UpdateEloDto) {
    return this.rankingsService.updateMatchElo(updateEloDto);
  }
}
