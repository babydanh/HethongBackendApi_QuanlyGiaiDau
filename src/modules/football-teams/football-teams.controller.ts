import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateFootballTeamDto } from './dto/create-football-team.dto';
import { InviteFootballTeamMemberDto } from './dto/invite-football-team-member.dto';
import { RespondFootballTeamInviteDto } from './dto/respond-football-team-invite.dto';
import { UpdateFootballTeamDto } from './dto/update-football-team.dto';
import { UpdateFootballTeamMemberDto } from './dto/update-football-team-member.dto';
import { FootballTeamsService } from './football-teams.service';
import { QueryFootballTeamMemberCandidatesDto } from './dto/query-football-team-member-candidates.dto';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('football-teams')
@ApiBearerAuth()
@Controller('football-teams')
export class FootballTeamsController {
  constructor(private readonly service: FootballTeamsService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo đội bóng' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateFootballTeamDto) {
    return this.service.create(user.sub, dto);
  }

  @Get('mine')
  @ApiOperation({ summary: 'Danh sách đội bóng của tôi' })
  listMine(@CurrentUser() user: JwtPayload) {
    return this.service.listMine(user.sub);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  update(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFootballTeamDto) {
    return this.service.update(user.sub, id, dto);
  }

  @Get(':id/member-candidates')
  @ApiOperation({ summary: 'Tìm tài khoản đủ điều kiện để mời vào đội' })
  searchMemberCandidates(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryFootballTeamMemberCandidatesDto,
  ) {
    return this.service.searchMemberCandidates(user.sub, id, query);
  }

  @Post(':id/invites')
  invite(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: InviteFootballTeamMemberDto) {
    return this.service.invite(user.sub, id, dto);
  }

  @Post(':id/invites/respond')
  respond(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RespondFootballTeamInviteDto) {
    return this.service.respond(user.sub, id, dto.status);
  }

  @Delete(':id/invites/:userId')
  @ApiOperation({ summary: 'Hủy lời mời đang chờ' })
  cancelInvite(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
  ) {
    return this.service.cancelInvite(user.sub, id, targetUserId);
  }

  @Patch(':id/members/:userId')
  updateMember(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @Body() dto: UpdateFootballTeamMemberDto,
  ) {
    return this.service.updateMember(user.sub, id, targetUserId, dto.role);
  }

  @Delete(':id/members/me')
  leave(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.leave(user.sub, id);
  }

  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'Xóa thành viên khỏi đội' })
  removeMember(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
  ) {
    return this.service.removeMember(user.sub, id, targetUserId);
  }
}
