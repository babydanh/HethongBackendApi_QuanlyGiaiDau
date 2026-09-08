import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { UpdateMatchScoreDto } from '../matches/dto/update-match-score.dto';
import { ClubMatchSessionsService } from './club-match-sessions.service';
import {
  ClubMatchRevisionDto,
  CreateClubMatchDto,
  CreateClubStandaloneMatchDto,
  CreateClubMatchMockParticipantDto,
  CreateClubMatchSessionDto,
  ForceClubMatchParticipantsDto,
  QueryClubMatchChildrenDto,
  QueryClubMatchSessionsDto,
  QueryClubStandaloneMatchesDto,
  RemoveClubMatchParticipantDto,
  TransitionClubMatchSessionDto,
  UpdateClubMatchPreferencesDto,
  UpdateClubMatchSessionDto,
} from './dto/club-match-session.dto';

type RequestUser = { id: string; roles?: string[] };

@ApiTags('club-match-sessions')
@ApiBearerAuth()
@Controller('club-match-sessions')
export class ClubMatchSessionsController {
  constructor(private readonly service: ClubMatchSessionsService) {}

  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateClubMatchSessionDto,
    @Headers('accept-language') locale?: string,
  ) {
    return this.service.create(user, dto, locale);
  }

  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @Query() query: QueryClubMatchSessionsDto,
    @Headers('accept-language') locale?: string,
  ) {
    return this.service.list(user, query, locale);
  }

  @Post('standalone-matches')
  createStandaloneMatch(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateClubStandaloneMatchDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.createStandaloneMatch(user, dto, idempotencyKey);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('standalone-matches')
  listStandaloneMatches(
    @CurrentUser() user: RequestUser | undefined,
    @Query() query: QueryClubStandaloneMatchesDto,
  ) {
    return this.service.listStandaloneMatches(user, query);
  }

  @Delete('standalone-matches/:matchId')
  deleteStandaloneMatch(
    @CurrentUser() user: RequestUser,
    @Param('matchId', ParseUUIDPipe) matchId: string,
  ) {
    return this.service.deleteStandaloneMatch(matchId, user);
  }

  @Get(':id')
  get(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('accept-language') locale?: string,
  ) {
    return this.service.get(id, user, locale);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClubMatchSessionDto,
    @Headers('accept-language') locale?: string,
  ) {
    return this.service.update(id, user, dto, locale);
  }

  @Post(':id/transition')
  transition(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionClubMatchSessionDto,
    @Headers('accept-language') locale?: string,
  ) {
    return this.service.transition(id, user, dto, locale);
  }

  @Get(':id/participants')
  listParticipants(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryClubMatchChildrenDto,
  ) {
    return this.service.listParticipants(id, user, query);
  }

  @Post(':id/participants/self')
  selfJoin(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.selfJoin(id, user);
  }

  @Post(':id/participants/self/withdraw')
  withdraw(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.withdraw(id, user);
  }

  @Post(':id/participants/force')
  forceParticipants(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ForceClubMatchParticipantsDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.forceParticipants(id, user, dto, idempotencyKey);
  }

  @Post(':id/participants/mock')
  createMockParticipant(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateClubMatchMockParticipantDto,
  ) {
    return this.service.createMockParticipant(id, user, dto);
  }

  @Patch(':id/participants/:userId/remove')
  removeParticipant(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: RemoveClubMatchParticipantDto,
  ) {
    return this.service.removeParticipant(id, userId, user, dto);
  }

  @Patch(':id/preferences/me')
  updatePreferences(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClubMatchPreferencesDto,
  ) {
    return this.service.updatePreferences(id, user, dto);
  }

  @Post(':id/matches')
  createMatch(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateClubMatchDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.createMatch(id, user, dto, idempotencyKey);
  }

  @Get(':id/matches')
  listMatches(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryClubMatchChildrenDto,
  ) {
    return this.service.listMatches(id, user, query);
  }

  /**
   * Authenticated live snapshot for a free club-session match.
   * This is deliberately separate from the tournament match read route so a
   * session match never needs a synthetic tournament id on the client.
   */
  @Get('matches/:matchId')
  getMatch(
    @CurrentUser() user: RequestUser,
    @Param('matchId', ParseUUIDPipe) matchId: string,
  ) {
    return this.service.getLiveMatch(matchId, user);
  }

  @Post('matches/:matchId/start')
  startMatch(
    @CurrentUser() user: RequestUser,
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Body() dto: ClubMatchRevisionDto,
  ) {
    return this.service.startMatch(matchId, user, dto.expectedRevision);
  }

  @Patch('matches/:matchId/score')
  updateScore(
    @CurrentUser() user: RequestUser,
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Body() dto: UpdateMatchScoreDto,
  ) {
    return this.service.updateScore(matchId, user, dto);
  }

  @Post('matches/:matchId/complete')
  completeMatch(
    @CurrentUser() user: RequestUser,
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Body() dto: UpdateMatchScoreDto,
  ) {
    return this.service.completeMatch(matchId, user, dto);
  }
}
