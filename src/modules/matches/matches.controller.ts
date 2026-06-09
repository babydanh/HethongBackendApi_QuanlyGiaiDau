import {
  Controller,
  Get,
  Body,
  Patch,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { MatchesService } from './matches.service';
import { QueryMatchDto } from './dto/query-match.dto';
import { UpdateMatchScoreDto } from './dto/update-match-score.dto';
import { UpdateMatchStatusDto } from './dto/update-match-status.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/constants/enums';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('matches')
@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Lấy danh sách trận đấu' })
  async findAll(@Query() query: QueryMatchDto) {
    return this.matchesService.findAll(query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết trận đấu' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.matchesService.findOne(id);
  }

  @Patch(':id/score')
  @ApiBearerAuth()
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Cập nhật tỷ số trận đấu' })
  async updateScore(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateMatchScoreDto: UpdateMatchScoreDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.matchesService.updateScore(id, user.sub, updateMatchScoreDto);
  }

  @Patch(':id/status')
  @ApiBearerAuth()
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Cập nhật trạng thái trận đấu (ONGOING, COMPLETED)',
  })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateMatchStatusDto: UpdateMatchStatusDto,
  ) {
    return this.matchesService.updateStatus(id, updateMatchStatusDto);
  }
}
