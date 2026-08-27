import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Verified } from '../../common/decorators/verified.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/constants/enums';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateSchedulePlanDto } from './dto/create-schedule-plan.dto';
import { MatchesService } from './matches.service';

@ApiTags('tournament-schedule')
@Controller('tournaments')
export class TournamentScheduleController {
  constructor(private readonly matchesService: MatchesService) {}

  @Post(':tournamentId/schedule-plans')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN, UserRole.PLAYER)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Preview kế hoạch xếp lịch theo sân, không ghi dữ liệu' })
  async previewSchedulePlan(
    @Param('tournamentId', ParseUUIDPipe) tournamentId: string,
    @Body() dto: CreateSchedulePlanDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.matchesService.previewSchedulePlan(tournamentId, user, dto);
  }
}
