import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseUUIDPipe,
  ParseIntPipe,
  Req,
  UnauthorizedException,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
} from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { TournamentsService } from './tournaments.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { CreateLiteTournamentDto } from './dto/create-lite-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { QueryTournamentDto } from './dto/query-tournament.dto';
import { RegisterTournamentDto } from './dto/register-tournament.dto';
import { UpdateFootballRosterDto } from './dto/update-football-roster.dto';
import { PairLiteParticipantsDto } from './dto/pair-lite-participants.dto';
import { GenerateLitePairsDto } from './dto/generate-lite-pairs.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { SeedMockParticipantsDto } from './dto/seed-mock-participants.dto';
import { ImportParticipantsDto } from './dto/import-participants.dto';
import { UploadGalleryDto } from './dto/gallery.dto';
import { CreateParentTournamentDto } from './dto/create-parent-tournament.dto';
import { UpdateParentTournamentDto } from './dto/update-parent-tournament.dto';
import { CreateDivisionDto } from './dto/create-division.dto';
import { UpdateDivisionDto } from './dto/update-division.dto';
import { UpdateBracketSlotsDto } from './dto/update-bracket-slots.dto';

import { AddRefereeDto } from './dto/add-referee.dto';
import { AddStaffMemberDto } from './dto/add-staff-member.dto';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';
import { Public } from '../../common/decorators/public.decorator';
import { Verified } from '../../common/decorators/verified.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { JwtService } from '@nestjs/jwt';

@ApiTags('tournaments')
@Controller('tournaments')
export class TournamentsController {
  constructor(
    private readonly tournamentsService: TournamentsService,
    private readonly jwtService: JwtService,
  ) {}

  private getSystemRoles(user: JwtPayload): string[] {
    if (Array.isArray(user.roles) && user.roles.length > 0) {
      return user.roles;
    }
    return user.role ? [user.role] : [];
  }

  @Public()
  @Get('fees')
  @ApiOperation({ summary: 'Lấy cấu hình các loại phí giải đấu và phí hoa hồng' })
  async getFeesConfig() {
    return this.tournamentsService.getFeesConfig();
  }

  @Public()
  @Get('public')
  @ApiOperation({ summary: 'Chỉ lấy danh sách giải đấu PUBLIC công khai' })
  async findPublic(@Query() query: QueryTournamentDto) {
    return this.tournamentsService.findPublic(query);
  }

  @Get('my')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy danh sách giải đấu người dùng tạo hoặc tham gia' })
  async findMy(@CurrentUser() user: JwtPayload) {
    return this.tournamentsService.findMy(user.sub);
  }

  @Get('workspace/me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy workspace người dùng theo vai trò: tham gia, tổ chức, trọng tài' })
  async findMyWorkspace(@CurrentUser() user: JwtPayload) {
    return this.tournamentsService.getMyWorkspace(user.sub);
  }

  @Public()
  @Get('join/:inviteCode')
  @ApiOperation({ summary: 'Xem thông tin giải đấu qua mã mời' })
  async findByInviteCode(@Param('inviteCode') inviteCode: string) {
    return this.tournamentsService.findByInviteCode(inviteCode);
  }

  @Post('join/:inviteCode')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tham gia giải đấu qua mã mời' })
  async joinByInviteCode(
    @Param('inviteCode') inviteCode: string,
    @Body() registerTournamentDto: RegisterTournamentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.joinByInviteCode(inviteCode, user.sub, registerTournamentDto);
  }

  @Public()
  @SkipThrottle()
  @Get()
  @ApiOperation({ summary: 'Lấy danh sách giải đấu' })
  async findAll(@Query() query: QueryTournamentDto) {
    return this.tournamentsService.findAll(query);
  }

  @Post('parent')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo giải đấu cha (chuỗi giải đấu / nhiều thể loại)' })
  async createParent(
    @Body() createParentTournamentDto: CreateParentTournamentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.createParent(
      user.sub,
      createParentTournamentDto,
      this.getSystemRoles(user),
    );
  }

  @Get('parent/my')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy danh sách giải đấu cha của tôi' })
  async findMyParents(@CurrentUser() user: JwtPayload) {
    return this.tournamentsService.findParentsByUser(user.sub);
  }

  @Public()
  @Get('parent/:id')
  @ApiOperation({ summary: 'Lấy chi tiết giải đấu cha kèm danh sách các thể loại/phân hạng' })
  async findOneParent(@Param('id', ParseUUIDPipe) id: string) {
    return this.tournamentsService.findParentById(id);
  }

  @Public()
  @Get('parent/:id/aggregation')
  @ApiOperation({ summary: 'Lấy thống kê tổng hợp của giải đấu cha' })
  async getParentAggregation(@Param('id', ParseUUIDPipe) id: string) {
    return this.tournamentsService.getParentWithAggregation(id);
  }

  @Patch('parent/:id')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật thông tin giải đấu cha' })
  async updateParent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateParentTournamentDto: UpdateParentTournamentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.updateParent(id, user.sub, updateParentTournamentDto, this.getSystemRoles(user));
  }

  @Delete('parent/:id')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa giải đấu cha' })
  async removeParent(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.removeParent(id, user.sub, this.getSystemRoles(user));
  }

  @Public()
  @Get(':id/divisions')
  @ApiOperation({ summary: 'Lấy danh sách bảng/nội dung thi đấu của giải' })
  async findDivisions(@Param('id', ParseUUIDPipe) id: string) {
    return this.tournamentsService.getDivisionsForTournament(id);
  }

  @Post(':id/divisions')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo bảng/nội dung thi đấu cho giải' })
  async createDivision(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() createDivisionDto: CreateDivisionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.createDivision(id, createDivisionDto, user.sub, this.getSystemRoles(user));
  }

  @Patch('divisions/:divisionId')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật bảng/nội dung thi đấu' })
  async updateDivision(
    @Param('divisionId', ParseUUIDPipe) divisionId: string,
    @Body() updateDivisionDto: UpdateDivisionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.updateDivision(divisionId, updateDivisionDto, user.sub, this.getSystemRoles(user));
  }

  @Patch(':id/divisions/:divisionId/config')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bật/tắt và cập nhật cấu hình riêng của hình thức thi đấu' })
  async updateDivisionConfig(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('divisionId', ParseUUIDPipe) divisionId: string,
    @Body() updateDivisionDto: UpdateDivisionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.updateDivisionConfig(id, divisionId, updateDivisionDto, user.sub, this.getSystemRoles(user));
  }

  @Get(':id/divisions/:divisionId/participants')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy danh sách người chơi theo hình thức thi đấu' })
  async findDivisionParticipants(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('divisionId', ParseUUIDPipe) divisionId: string,
  ) {
    return this.tournamentsService.getParticipantsByDivision(id, divisionId);
  }

  @Delete('divisions/:divisionId')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa bảng/nội dung thi đấu' })
  async removeDivision(
    @Param('divisionId', ParseUUIDPipe) divisionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.deleteDivision(divisionId, user.sub, this.getSystemRoles(user));
  }

  @Public()
  @Throttle({ default: { limit: 1800, ttl: 60000 } })
  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết giải đấu' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('invite') inviteCode?: string,
    @Query('pid') participantId?: string,
    @Query('token') teamInviteToken?: string,
    @Req() req?: Request,
  ) {
    const authInfo = this.getAuthInfoFromRequest(req);
    return this.tournamentsService.findOne(id, authInfo.userId, inviteCode, authInfo.roles, participantId, teamInviteToken);
  }

  @Public()
  @Post(':id/validate-invite')
  @ApiOperation({ summary: 'Kiểm tra mã mời giải đấu PRIVATE' })
  async validateInvite(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('inviteCode') inviteCode: string,
  ) {
    return this.tournamentsService.validateInvite(id, inviteCode);
  }

  private getAuthInfoFromRequest(request: Request | undefined): { userId: string | null; roles: string[] } {
    if (!request || !request.headers) return { userId: null, roles: [] };
    const token = this.extractAccessToken(request);
    if (!token) {
      return { userId: null, roles: [] };
    }
    try {
      const payloadPart = token.split('.')[1];
      if (!payloadPart) {
        return { userId: null, roles: [] };
      }
      const normalizedPayload = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(Buffer.from(normalizedPayload, 'base64').toString('utf8'));
      let roles: string[] = [];
      if (Array.isArray(payload.roles)) {
        roles = payload.roles;
      } else if (payload.role) {
        roles = [payload.role];
      }
      return { userId: payload.sub || null, roles };
    } catch {
      return { userId: null, roles: [] };
    }
  }

  private extractAccessToken(request: Request): string | null {
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.split(' ')[1];
    }

    const cookieToken = request.cookies?.accessToken;
    if (typeof cookieToken === 'string' && cookieToken.trim().length > 0) {
      return cookieToken.trim();
    }

    const rawCookieHeader = request.headers.cookie;
    if (typeof rawCookieHeader !== 'string' || rawCookieHeader.trim().length === 0) {
      return null;
    }

    for (const cookieChunk of rawCookieHeader.split(';')) {
      const [rawName, ...valueParts] = cookieChunk.trim().split('=');
      if (rawName !== 'accessToken' || valueParts.length === 0) {
        continue;
      }
      const rawValue = valueParts.join('=').trim();
      if (!rawValue) {
        return null;
      }
      try {
        return decodeURIComponent(rawValue);
      } catch {
        return rawValue;
      }
    }

    return null;
  }

  @Post()
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo giải đấu mới (hỗ trợ cả Web và App)' })
  async create(
    @Body() createTournamentDto: CreateTournamentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.sub) {
      throw new UnauthorizedException('Bạn cần đăng nhập để tạo giải đấu.');
    }
    return this.tournamentsService.create(
      user.sub,
      createTournamentDto,
      this.getSystemRoles(user),
    );
  }

  @Post('lite')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo giải đấu nhanh trong CLB (Lite) — chỉ cần sport slug, không cần categoryId UUID' })
  async createLite(
    @Body() dto: CreateLiteTournamentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.sub) {
      throw new UnauthorizedException('Bạn cần đăng nhập để tạo giải đấu.');
    }
    return this.tournamentsService.createLite(
      user.sub,
      dto,
      this.getSystemRoles(user),
      user.isEmailVerified,
      user.isMock,
    );
  }

  @Public()
  @Get('lite/join/:inviteCode')
  @ApiOperation({ summary: 'Kiểm tra trạng thái tham gia Lite tournament' })
  async getLiteJoinStatus(@Param('inviteCode') inviteCode: string, @CurrentUser() user: JwtPayload | null, @Req() req: any) {
    let userId = user?.sub;
    if (!userId) {
      // Web: cookie-based auth
      if (req?.cookies?.accessToken) {
        try {
          const payload = await this.jwtService.verifyAsync(req.cookies.accessToken);
          userId = payload.sub;
        } catch (_e) {}
      }
      // App: Bearer token in Authorization header
      if (!userId && req?.headers?.authorization) {
        const parts = req.headers.authorization.split(' ');
        if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
          try {
            const payload = await this.jwtService.verifyAsync(parts[1]);
            userId = payload.sub;
          } catch {}
        }
      }
    }
    return this.tournamentsService.getLiteJoinStatus(inviteCode, userId);
  }

  @Post('lite/join/:inviteCode')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tham gia Lite tournament 1 chạm' })
  async joinLite(@Param('inviteCode') inviteCode: string, @CurrentUser() user: JwtPayload) {
    return this.tournamentsService.joinLite(inviteCode, user.sub);
  }

  // ──── Lite pairing management ────

  @Get('lite/:id/participants')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy danh sách participants cho ghép cặp Lite' })
  async getLiteParticipants(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.getLiteParticipants(id, user.sub, this.getSystemRoles(user));
  }

  @Post('lite/:id/pairs')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ghép cặp 2 participant thủ công (Lite doubles)' })
  async pairLiteParticipants(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PairLiteParticipantsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.pairLiteParticipants(id, user.sub, this.getSystemRoles(user), dto);
  }

  @Post('lite/:id/pairs/generate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tự động ghép cặp (RANDOM hoặc ELO_BALANCED) cho Lite doubles' })
  async generateLitePairs(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GenerateLitePairsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.generateLitePairs(id, user.sub, this.getSystemRoles(user), dto);
  }

  @Post('lite/:id/pairs/:participantId/unpair')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tách cặp participant đã ghép (Lite doubles)' })
  async unpairLiteParticipant(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.unpairLiteParticipant(id, participantId, user.sub, this.getSystemRoles(user));
  }

  @Patch('lite/:id/divisions/:divisionId/bracket/slots')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật slot bracket cho giải Lite' })
  async updateLiteBracketSlots(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('divisionId', ParseUUIDPipe) divisionId: string,
    @Body() data: UpdateBracketSlotsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.updateLiteBracketSlots(
      id,
      divisionId,
      user.sub,
      data,
      this.getSystemRoles(user),
    );
  }

  @Post('lite/:id/bracket')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo hoặc lưu bracket cho giải Lite' })
  async generateLiteBracket(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('divisionId') divisionId: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.generateLiteBracket(
      id,
      user.sub,
      this.getSystemRoles(user),
      divisionId,
    );
  }

  @Post('lite/:id/bracket/reset')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reset bracket Lite trước khi có trận bắt đầu' })
  async resetLiteBracket(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('divisionId') divisionId: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.generateLiteBracket(
      id,
      user.sub,
      this.getSystemRoles(user),
      divisionId,
      true,
    );
  }

  @Patch(':id')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật giải đấu' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateTournamentDto: UpdateTournamentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.update(id, user.sub, updateTournamentDto, this.getSystemRoles(user));
  }

  @Delete(':id')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa giải đấu (Soft Delete)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.remove(id, user.sub, this.getSystemRoles(user));
  }



  @Post(':id/generate-bracket')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN, UserRole.PLAYER)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sinh nhánh đấu tự động (Bracket Generation)' })
  async generateBracket(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('divisionId') divisionId: string | undefined,
    @Body('seedingType') seedingType: 'SEEDED' | 'RANDOM' | undefined,
    @Body('allowReset') allowReset: boolean | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.generateBracket(
      id,
      user.sub,
      this.getSystemRoles(user),
      divisionId,
      seedingType,
      allowReset ?? true,
    );
  }

  @Patch(':id/divisions/:divisionId/bracket/slots')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN, UserRole.PLAYER)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật participant trong các slot bracket' })
  async updateBracketSlots(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('divisionId', ParseUUIDPipe) divisionId: string,
    @Body() data: UpdateBracketSlotsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.updateBracketSlots(
      id,
      divisionId,
      user.sub,
      data,
      this.getSystemRoles(user),
    );
  }

  @Post(':id/publish')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Công bố giải đấu từ DRAFT -> REGISTRATION_OPEN' })
  async publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.publish(id, user.sub, this.getSystemRoles(user));
  }

  @Post(':id/follow')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Theo dõi giải đấu' })
  async follow(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.followTournament(id, user.sub);
  }

  @Delete(':id/follow')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bỏ theo dõi giải đấu' })
  async unfollow(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.unfollowTournament(id, user.sub);
  }

  @Get('my/followed')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Danh sách giải đấu đang theo dõi' })
  async getFollowed(@CurrentUser() user: JwtPayload) {
    return this.tournamentsService.getFollowedTournaments(user.sub);
  }

  @Patch(':id/seeds')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật hạt giống hàng loạt cho các đội/VĐV' })
  async updateSeeds(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('seeds') seeds: { participantId: string; seed: number }[],
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.updateSeeds(id, seeds, user.sub, this.getSystemRoles(user));
  }

  @Post(':id/lock')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Chốt danh sách VĐV, tính phí sàn và sinh bracket' })
  async lock(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.lock(id, user.sub, this.getSystemRoles(user));
  }

  @Post(':id/confirm-roster')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Chốt danh sách hiện tại, không tự tạo bracket' })
  async confirmRoster(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.confirmRoster(id, user.sub, this.getSystemRoles(user));
  }

  @Post(':id/register')
  @ApiBearerAuth()
  @Throttle({ sensitive: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Đăng ký tham gia giải đấu' })
  async register(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() registerTournamentDto: RegisterTournamentDto,
    @CurrentUser() user: JwtPayload,
    @Query('invite') inviteCode?: string,
  ) {
    return this.tournamentsService.register(id, user.sub, registerTournamentDto, inviteCode);
  }

  @Post(':id/join-team')
  @ApiBearerAuth()
  @Throttle({ sensitive: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Đồng đội tham gia nhóm thi đấu đánh đôi' })
  async joinTeam(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('participantId') participantId: string,
    @Body('teamInviteToken') teamInviteToken: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.joinTeam(id, user.sub, participantId, teamInviteToken);
  }

  @Post('participants/:participantId/accept-partner')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Chấp nhận lời mời ghép đôi (tối đa 1 giờ hoặc đến hạn đóng đăng ký)' })
  async acceptPartnerInvite(
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.acceptPartnerInvite(participantId, user.sub);
  }

  @Post('participants/:participantId/reject-partner')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Từ chối lời mời ghép đôi' })
  async rejectPartnerInvite(
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.rejectPartnerInvite(participantId, user.sub);
  }

  @Post(':id/withdraw')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Rút lui khỏi giải đấu' })
  async withdraw(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() bankData?: {
      bankName?: string;
      bankAccountNumber?: string;
      bankAccountName?: string;
      tournamentDivisionId?: string;
    },
  ) {
    return this.tournamentsService.withdraw(id, user.sub, bankData, bankData?.tournamentDivisionId);
  }

  @Get(':id/my-registration')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Kiểm tra trạng thái đăng ký của bản thân trong giải đấu' })
  async myRegistration(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Query('divisionId') divisionId?: string,
  ) {
    return this.tournamentsService.myRegistration(id, user.sub, divisionId);
  }

  @Post(':id/regenerate-invite')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo lại mã mời mới' })
  async regenerateInvite(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.regenerateInviteCode(id, user.sub, this.getSystemRoles(user));
  }

  @Post(':id/reopen-registration')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mở lại đăng ký có kiểm soát trước khi tạo sơ đồ' })
  async reopenRegistration(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.reopenRegistration(id, user.sub, this.getSystemRoles(user));
  }



  @Public()
  @Get(':id/gallery')
  @ApiOperation({ summary: 'Lấy danh sách ảnh gallery của giải đấu (PUBLIC)' })
  async getGallery(@Param('id', ParseUUIDPipe) id: string) {
    return this.tournamentsService.getGallery(id);
  }

  @Post(':id/gallery')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thêm ảnh mới vào gallery' })
  async addGalleryImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() uploadGalleryDto: UploadGalleryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.addGalleryImage(id, user.sub, uploadGalleryDto.url, this.getSystemRoles(user));
  }

  @Delete(':id/gallery/:index')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa ảnh khỏi gallery theo index' })
  async removeGalleryImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('index', ParseIntPipe) index: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.removeGalleryImage(id, user.sub, index, this.getSystemRoles(user));
  }

  @Public()
  @Get(':id/participants')
  @ApiOperation({ summary: 'Lấy danh sách VĐV đăng ký tham gia kèm rosters' })
  async findParticipants(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('divisionId') divisionId?: string,
  ) {
    return this.tournamentsService.findParticipants(id, divisionId);
  }

  @Get(':id/manage/participants')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN, UserRole.PLAYER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy danh sách participant đầy đủ cho BTC' })
  async findParticipantsForOrganizer(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('divisionId') divisionId: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.findParticipantsForOrganizer(id, divisionId, user.sub, this.getSystemRoles(user));
  }

  @Get(':id/referees')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN, UserRole.PLAYER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy danh sách trọng tài của giải đấu' })
  async findReferees(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.findReferees(id, user.sub, this.getSystemRoles(user));
  }

  @Post(':id/referees')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mời trọng tài tham gia giải đấu bằng Email/Gmail' })
  async addReferee(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AddRefereeDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.addReferee(id, body.email, user.sub, this.getSystemRoles(user));
  }

  @Patch(':id/referees/:refereeId/respond')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Trọng tài chấp nhận/từ chối lời mời làm trọng tài' })
  @ApiResponse({ status: 200, description: 'Phản hồi lời mời thành công' })
  async respondToRefereeInvite(
    @Param('id', ParseUUIDPipe) tournamentId: string,
    @Param('refereeId', ParseUUIDPipe) refereeId: string,
    @Body('action') action: 'ACCEPT' | 'DECLINE',
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.respondToRefereeInvite(tournamentId, refereeId, user.sub, action);
  }

  @Delete(':id/referees/:refereeId')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'BTC thu hồi lời mời trọng tài đang chờ phản hồi' })
  async revokeRefereeInvite(
    @Param('id', ParseUUIDPipe) tournamentId: string,
    @Param('refereeId', ParseUUIDPipe) refereeId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.revokeRefereeInvite(
      tournamentId,
      refereeId,
      user.sub,
      this.getSystemRoles(user),
    );
  }

  @Public()
  @Throttle({ default: { limit: 1800, ttl: 60000 } })
  @Get(':id/bracket')
  @ApiOperation({ summary: 'Lấy full bracket data' })
  async findBracket(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('divisionId') divisionId?: string,
  ) {
    return this.tournamentsService.findBracket(id, divisionId);
  }

  @Patch('stages/:id')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật cấu hình vòng đấu (Stage)' })
  async updateStage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateStageDto: UpdateStageDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.updateStage(id, user.sub, updateStageDto, this.getSystemRoles(user));
  }

  @Patch('groups/:id')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật cấu hình luật cho một bảng đấu' })
  async updateGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateGroupDto: UpdateGroupDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.updateGroup(id, user.sub, updateGroupDto, this.getSystemRoles(user));
  }

  @Post(':id/mock-participants')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sinh danh sách VĐV giả lập để test' })
  async seedMockParticipants(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SeedMockParticipantsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.seedMockParticipants(
      id,
      user.sub,
      dto.names,
      this.getSystemRoles(user),
      dto.divisionId,
    );
  }

  @Post(':id/registration-attachment')
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Tải tệp đính kèm cho biểu mẫu đăng ký nâng cao' })
  @ApiResponse({ status: 201, description: 'Tệp đã được tải lên Cloudinary' })
  async uploadRegistrationAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('fieldId') fieldId: string | undefined,
    @CurrentUser() user: JwtPayload,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.tournamentsService.uploadRegistrationAttachment(
      id,
      user.sub,
      fieldId,
      file,
    );
  }

  @Post(':id/import-participants')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Nhập danh sách VĐV từ Google Form / Excel' })
  async importParticipants(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ImportParticipantsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.importParticipantsFromForm(
      id,
      user.sub,
      this.getSystemRoles(user),
      dto,
    );
  }

  @Delete(':id/mock-participants')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa toàn bộ VĐV giả lập' })
  async clearMockParticipants(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('divisionId') divisionId: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.clearMockParticipants(id, user.sub, this.getSystemRoles(user), divisionId);
  }

  @Delete(':id/participants/:participantId/mock')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa một participant giả lập' })
  async deleteMockParticipant(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.deleteMockParticipant(id, participantId, user.sub, this.getSystemRoles(user));
  }

  @Patch(':id/participants/:participantId')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Duyệt hoặc từ chối vận động viên đăng ký' })
  async updateParticipantStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @Body('status') status: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.updateParticipantStatus(id, participantId, status, user.sub, this.getSystemRoles(user));
  }

  @Post(':id/participants/:participantId/lock-roster')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Khóa roster đội trước khi lập sơ đồ thi đấu' })
  async lockParticipantRoster(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.lockParticipantRoster(
      id,
      participantId,
      user.sub,
      this.getSystemRoles(user),
    );
  }

  @Post(':id/participants/:participantId/unlock-roster')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mở khóa roster đội trước khi giải bắt đầu' })
  async unlockParticipantRoster(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.unlockParticipantRoster(
      id,
      participantId,
      user.sub,
      this.getSystemRoles(user),
    );
  }

  @Get(':id/participants/:participantId/football-roster')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy trạng thái xác nhận roster đội bóng' })
  async getFootballRosterStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.getFootballRosterStatus(
      id,
      participantId,
      user.sub,
      this.getSystemRoles(user),
    );
  }

  @Post(':id/participants/:participantId/football-roster/respond')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xác nhận hoặc từ chối roster đội bóng trong giải' })
  async respondFootballRoster(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @Body('action') action: 'CONFIRM' | 'DECLINE',
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.respondFootballRoster(id, participantId, user.sub, action);
  }

  @Patch(':id/participants/:participantId/football-roster')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật đội hình đăng ký bóng đá trước khi khóa roster' })
  async updateFootballRoster(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @Body() dto: UpdateFootballRosterDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.updateFootballRoster(
      id,
      participantId,
      dto,
      user.sub,
      this.getSystemRoles(user),
    );
  }

  @Post(':id/reserve-slots')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Gán trực tiếp người chơi vào slot giữ chỗ (Wildcard)' })
  async assignReservedSlot(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('userEmailOrPhone') userEmailOrPhone: string,
    @Body('teamName') teamName: string,
    @Body('partnerEmailOrPhone') partnerEmailOrPhone: string | undefined,
    @Body('divisionId') divisionId: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.assignReservedSlot(
      id,
      userEmailOrPhone,
      teamName,
      user.sub,
      this.getSystemRoles(user),
      partnerEmailOrPhone,
      divisionId,
    );
  }

  @Post(':id/participants/:participantId/kick')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN, UserRole.PLAYER)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Kick vận động viên/đội thi đấu khỏi giải và hoàn tiền' })
  async kickParticipant(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @Body('reason') reason: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.kickParticipant(id, participantId, user.sub, reason, this.getSystemRoles(user));
  }

  @Get(':id/ops-audit-logs')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN, UserRole.PLAYER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy nhật ký vận hành cho organizer ops panel' })
  async getOpsAuditLogs(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('divisionId') divisionId: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.getOpsAuditLogs(id, user.sub, this.getSystemRoles(user), divisionId);
  }

  @Post(':id/cancel')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Hủy giải đấu / nội dung thi đấu và hoàn tiền cho mọi người' })
  async cancelTournament(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.cancelTournament(id, user.sub, this.getSystemRoles(user));
  }

  @Post(':id/playoff')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tao tran Play-off cho Round Robin' })
  async createPlayoffMatch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('stageId') stageId: string,
    @Body('participant1Id') participant1Id: string,
    @Body('participant2Id') participant2Id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.createPlayoffMatch(
      id, { stageId, participant1Id, participant2Id }, user.sub, this.getSystemRoles(user),
    );
  }

  @Post(':id/stages/:stageId/finalize')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ket thuc som stage (cancel cac tran con lai)' })
  async finalizeStage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stageId', ParseUUIDPipe) stageId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.finalizeStage(id, stageId, user.sub, this.getSystemRoles(user));
  }

  @Post(':id/auto-seed')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tự động xếp hạt giống theo ELO' })
  async autoSeed(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('divisionId') divisionId: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.autoSeedFromElo(id, user.sub, this.getSystemRoles(user), divisionId);
  }

  @Post(':id/advance-standings')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Chot vong bang va chuyen tiep sang vong loai truc tiep' })
  async advanceStandings(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('divisionId') divisionId: string,
    @Body('stageId') stageId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.advanceStandings(id, divisionId, stageId, user.sub, this.getSystemRoles(user));
  }

  @Public()
  @Get(':id/standings')
  @ApiOperation({ summary: 'Lấy bảng xếp hạng vòng bảng (group standings) cho giải đấu' })
  async getGroupStandings(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('divisionId') divisionId?: string,
  ) {
    return this.tournamentsService.getGroupStandings(id, divisionId);
  }

  @Public()
  @Get(':id/results')
  @ApiOperation({ summary: 'Kết quả chính thức và vinh danh giải đấu' })
  async getTournamentResults(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('divisionId') divisionId?: string,
  ) {
    return this.tournamentsService.getTournamentResultsV2(id, divisionId);
  }

  @Public()
  @Get(':id/staff')
  @ApiOperation({ summary: 'Lay danh sach nhan su (BTC, trong tai, khach xem)' })
  async findStaff(@Param('id', ParseUUIDPipe) id: string) {
    return this.tournamentsService.findStaffByTournament(id);
  }

  @Post(':id/staff')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Them nhan su (CO_ORGANIZER, REFEREE, SPECTATOR)' })
  async addStaffMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AddStaffMemberDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.addStaffMember(id, body.email, body.role, user.sub, this.getSystemRoles(user));
  }

  @Delete(':id/staff/:userId')
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xoa nhan su khoi giai' })
  async removeStaffMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) staffUserId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.removeStaffMember(id, staffUserId, user.sub, this.getSystemRoles(user));
  }
}

