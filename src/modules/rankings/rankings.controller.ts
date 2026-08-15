import { Controller, Get, Query, Post, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RankingsService } from './rankings.service';
import { FootballTeamEloService } from './football-team-elo.service';
import { QueryRankingDto } from './dto/query-ranking.dto';
import { UpdateEloDto } from './dto/update-elo.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';

@ApiTags('rankings')
@Controller('rankings')
export class RankingsController {
  constructor(
    private readonly rankingsService: RankingsService,
    private readonly footballTeamEloService: FootballTeamEloService,
  ) {}

  @Public()
  @Get('football-teams')
  @ApiOperation({ summary: 'Bảng xếp hạng ELO bóng đá theo đội' })
  async getFootballTeamLeaderboard(@Query() query: QueryRankingDto) {
    return this.footballTeamEloService.getLeaderboard(query.categoryId, query.limit, query.cursor);
  }

  @Public()
  @ApiBearerAuth()
  @Throttle({ default: { limit: 1800, ttl: 60000 } })
  @Get()
  @ApiOperation({ summary: 'Lấy bảng xếp hạng theo môn thể thao' })
  async getLeaderboard(@Query() query: QueryRankingDto) {
    return this.rankingsService.getLeaderboard(query);
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
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.rankingsService.getEloHistory(userId, {
      categoryId,
      scope,
      communityId,
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
