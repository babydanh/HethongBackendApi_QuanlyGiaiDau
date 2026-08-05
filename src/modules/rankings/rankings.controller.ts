import { Controller, Get, Query, Post, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RankingsService } from './rankings.service';
import { QueryRankingDto } from './dto/query-ranking.dto';
import { UpdateEloDto } from './dto/update-elo.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';

@ApiTags('rankings')
@Controller('rankings')
export class RankingsController {
  constructor(private readonly rankingsService: RankingsService) {}

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
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.rankingsService.getEloHistory(userId, {
      categoryId,
      scope,
      communityId,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
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
