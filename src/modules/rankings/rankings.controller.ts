import { Controller, Get, Query, Post, Body } from '@nestjs/common';
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
  @Get()
  @ApiOperation({ summary: 'Lấy bảng xếp hạng theo môn thể thao' })
  async getLeaderboard(@Query() query: QueryRankingDto) {
    return this.rankingsService.getLeaderboard(query);
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
