import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ChallengesService } from './challenges.service';
import { Verified } from '../../common/decorators/verified.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('challenges')
@ApiBearerAuth()
@Controller('communities/:id/challenges')
export class ChallengesController {
  constructor(private readonly challengesService: ChallengesService) {}

  @Post()
  @Verified()
  @ApiOperation({ summary: 'Gửi lời mời thách đấu / giao lưu tới CLB khác' })
  async createChallenge(
    @Param('id', ParseUUIDPipe) challengerId: string,
    @Body() body: { challengedId: string; message?: string; scheduledAt?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.challengesService.createChallenge(user.sub, challengerId, body);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách lời mời thách đấu của CLB' })
  async getChallenges(
    @Param('id', ParseUUIDPipe) communityId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.challengesService.getChallenges(user.sub, communityId);
  }

  @Patch(':challengeId')
  @Verified()
  @ApiOperation({ summary: 'Chấp nhận hoặc từ chối lời mời thách đấu giao lưu' })
  async respondChallenge(
    @Param('id', ParseUUIDPipe) communityId: string,
    @Param('challengeId', ParseUUIDPipe) challengeId: string,
    @Body() body: { status: 'ACCEPTED' | 'REJECTED' },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.challengesService.updateChallengeStatus(
      user.sub,
      communityId,
      challengeId,
      body,
    );
  }
}
