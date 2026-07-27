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
} from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { TournamentsService } from './tournaments.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { CreateLiteTournamentDto } from './dto/create-lite-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { QueryTournamentDto } from './dto/query-tournament.dto';
import { RegisterTournamentDto } from './dto/register-tournament.dto';
import { PairLiteParticipantsDto } from './dto/pair-lite-participants.dto';
import { GenerateLitePairsDto } from './dto/generate-lite-pairs.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { UploadGalleryDto } from './dto/gallery.dto';
import { CreateParentTournamentDto } from './dto/create-parent-tournament.dto';
import { UpdateParentTournamentDto } from './dto/update-parent-tournament.dto';
import { CreateDivisionDto } from './dto/create-division.dto';
import { UpdateDivisionDto } from './dto/update-division.dto';
import { AddRefereeDto } from './dto/add-referee.dto';
import { AddStaffMemberDto } from './dto/add-staff-member.dto';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
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
  @ApiOperation({ summary: 'Láº¥y cáº¥u hÃ¬nh cÃ¡c loáº¡i phÃ­ giáº£i Ä‘áº¥u vÃ  phÃ­ hoa há»“ng' })
  async getFeesConfig() {
    return this.tournamentsService.getFeesConfig();
  }

  @Public()
  @Get('public')
  @ApiOperation({ summary: 'Chá»‰ láº¥y danh sÃ¡ch giáº£i Ä‘áº¥u PUBLIC cÃ´ng khai' })
  async findPublic(@Query() query: QueryTournamentDto) {
    return this.tournamentsService.findPublic(query);
  }

  @Get('my')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Láº¥y danh sÃ¡ch giáº£i Ä‘áº¥u ngÆ°á»i dÃ¹ng táº¡o hoáº·c tham gia' })
  async findMy(@CurrentUser() user: JwtPayload) {
    return this.tournamentsService.findMy(user.sub);
  }

  @Get('workspace/me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Láº¥y workspace ngÆ°á»i dÃ¹ng theo vai trÃ²: tham gia, tá»• chá»©c, trá»ng tÃ i' })
  async findMyWorkspace(@CurrentUser() user: JwtPayload) {
    return this.tournamentsService.getMyWorkspace(user.sub);
  }

  @Public()
  @Get('join/:inviteCode')
  @ApiOperation({ summary: 'Xem thÃ´ng tin giáº£i Ä‘áº¥u qua mÃ£ má»i' })
  async findByInviteCode(@Param('inviteCode') inviteCode: string) {
    return this.tournamentsService.findByInviteCode(inviteCode);
  }

  @Post('join/:inviteCode')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tham gia giáº£i Ä‘áº¥u qua mÃ£ má»i' })
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
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Táº¡o giáº£i Ä‘áº¥u cha (chuá»—i giáº£i Ä‘áº¥u / nhiá»u thá»ƒ loáº¡i)' })
  async createParent(
    @Body() createParentTournamentDto: CreateParentTournamentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.createParent(user.sub, createParentTournamentDto);
  }

  @Get('parent/my')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Láº¥y danh sÃ¡ch giáº£i Ä‘áº¥u cha cá»§a tÃ´i' })
  async findMyParents(@CurrentUser() user: JwtPayload) {
    return this.tournamentsService.findParentsByUser(user.sub);
  }

  @Public()
  @Get('parent/:id')
  @ApiOperation({ summary: 'Láº¥y chi tiáº¿t giáº£i Ä‘áº¥u cha kÃ¨m danh sÃ¡ch cÃ¡c thá»ƒ loáº¡i/phÃ¢n háº¡ng' })
  async findOneParent(@Param('id', ParseUUIDPipe) id: string) {
    return this.tournamentsService.findParentById(id);
  }

  @Public()
  @Get('parent/:id/aggregation')
  @ApiOperation({ summary: 'Láº¥y thá»‘ng kÃª tá»•ng há»£p cá»§a giáº£i Ä‘áº¥u cha' })
  async getParentAggregation(@Param('id', ParseUUIDPipe) id: string) {
    return this.tournamentsService.getParentWithAggregation(id);
  }

  @Patch('parent/:id')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cáº­p nháº­t thÃ´ng tin giáº£i Ä‘áº¥u cha' })
  async updateParent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateParentTournamentDto: UpdateParentTournamentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.updateParent(id, user.sub, updateParentTournamentDto, this.getSystemRoles(user));
  }

  @Delete('parent/:id')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'XÃ³a giáº£i Ä‘áº¥u cha' })
  async removeParent(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.removeParent(id, user.sub, this.getSystemRoles(user));
  }

  @Public()
  @Get(':id/divisions')
  @ApiOperation({ summary: 'Láº¥y danh sÃ¡ch báº£ng/ná»™i dung thi Ä‘áº¥u cá»§a giáº£i' })
  async findDivisions(@Param('id', ParseUUIDPipe) id: string) {
    return this.tournamentsService.getDivisionsForTournament(id);
  }

  @Post(':id/divisions')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Táº¡o báº£ng/ná»™i dung thi Ä‘áº¥u cho giáº£i' })
  async createDivision(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() createDivisionDto: CreateDivisionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.createDivision(id, createDivisionDto, user.sub, this.getSystemRoles(user));
  }

  @Patch('divisions/:divisionId')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cáº­p nháº­t báº£ng/ná»™i dung thi Ä‘áº¥u' })
  async updateDivision(
    @Param('divisionId', ParseUUIDPipe) divisionId: string,
    @Body() updateDivisionDto: UpdateDivisionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.updateDivision(divisionId, updateDivisionDto, user.sub, this.getSystemRoles(user));
  }

  @Patch(':id/divisions/:divisionId/config')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Báº­t/táº¯t vÃ  cáº­p nháº­t cáº¥u hÃ¬nh riÃªng cá»§a hÃ¬nh thá»©c thi Ä‘áº¥u' })
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
  @ApiOperation({ summary: 'Láº¥y danh sÃ¡ch ngÆ°á»i chÆ¡i theo hÃ¬nh thá»©c thi Ä‘áº¥u' })
  async findDivisionParticipants(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('divisionId', ParseUUIDPipe) divisionId: string,
  ) {
    return this.tournamentsService.getParticipantsByDivision(id, divisionId);
  }

  @Delete('divisions/:divisionId')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'XÃ³a báº£ng/ná»™i dung thi Ä‘áº¥u' })
  async removeDivision(
    @Param('divisionId', ParseUUIDPipe) divisionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.deleteDivision(divisionId, user.sub, this.getSystemRoles(user));
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Láº¥y chi tiáº¿t giáº£i Ä‘áº¥u' })
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
  @ApiOperation({ summary: 'Kiá»ƒm tra mÃ£ má»i giáº£i Ä‘áº¥u PRIVATE' })
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
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Táº¡o giáº£i Ä‘áº¥u má»›i (há»— trá»£ cáº£ Web vÃ  App)' })
  async create(
    @Body() createTournamentDto: CreateTournamentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user?.sub) {
      throw new UnauthorizedException('Báº¡n cáº§n Ä‘Äƒng nháº­p Ä‘á»ƒ táº¡o giáº£i Ä‘áº¥u.');
    }
    return this.tournamentsService.create(
      user.sub,
      createTournamentDto,
      this.getSystemRoles(user),
    );
  }

  @Post('lite')
  @Verified()
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
        } catch {}
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
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tham gia Lite tournament 1 chạm' })
  async joinLite(@Param('inviteCode') inviteCode: string, @CurrentUser() user: JwtPayload) {
    return this.tournamentsService.joinLite(inviteCode, user.sub);
  }

  // ──── Lite pairing management ────

  @Get('lite/:id/participants')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy danh sách participants cho ghép cặp Lite' })
  async getLiteParticipants(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.getLiteParticipants(id, user.sub, this.getSystemRoles(user));
  }

  @Post('lite/:id/pairs')
  @Verified()
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
  @Verified()
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
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tách cặp participant đã ghép (Lite doubles)' })
  async unpairLiteParticipant(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.unpairLiteParticipant(id, participantId, user.sub, this.getSystemRoles(user));
  }

  @Patch(':id')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cáº­p nháº­t giáº£i Ä‘áº¥u' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateTournamentDto: UpdateTournamentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.update(id, user.sub, updateTournamentDto, this.getSystemRoles(user));
  }

  @Delete(':id')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'XÃ³a giáº£i Ä‘áº¥u (Soft Delete)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.remove(id, user.sub, this.getSystemRoles(user));
  }



  @Post(':id/generate-bracket')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sinh nhÃ¡nh Ä‘áº¥u tá»± Ä‘á»™ng (Bracket Generation)' })
  async generateBracket(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('divisionId') divisionId: string | undefined,
    @Body('seedingType') seedingType: 'SEEDED' | 'RANDOM' | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.generateBracket(id, user.sub, this.getSystemRoles(user), divisionId, seedingType);
  }

  @Post(':id/publish')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'CÃ´ng bá»‘ giáº£i Ä‘áº¥u tá»« DRAFT -> REGISTRATION_OPEN' })
  async publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.publish(id, user.sub, this.getSystemRoles(user));
  }

  @Post(':id/follow')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Theo dÃµi giáº£i Ä‘áº¥u' })
  async follow(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.followTournament(id, user.sub);
  }

  @Delete(':id/follow')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bá» theo dÃµi giáº£i Ä‘áº¥u' })
  async unfollow(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.unfollowTournament(id, user.sub);
  }

  @Get('my/followed')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Danh sÃ¡ch giáº£i Ä‘áº¥u Ä‘ang theo dÃµi' })
  async getFollowed(@CurrentUser() user: JwtPayload) {
    return this.tournamentsService.getFollowedTournaments(user.sub);
  }

  @Patch(':id/seeds')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cáº­p nháº­t háº¡t giá»‘ng hÃ ng loáº¡t cho cÃ¡c Ä‘á»™i/VÄV' })
  async updateSeeds(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('seeds') seeds: { participantId: string; seed: number }[],
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.updateSeeds(id, seeds, user.sub, this.getSystemRoles(user));
  }

  @Post(':id/lock')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Chá»‘t danh sÃ¡ch VÄV, tÃ­nh phÃ­ sÃ n vÃ  sinh bracket' })
  async lock(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.lock(id, user.sub, this.getSystemRoles(user));
  }

  @Post(':id/register')
  @Verified()
  @ApiBearerAuth()
  @Throttle({ sensitive: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'ÄÄƒng kÃ½ tham gia giáº£i Ä‘áº¥u' })
  async register(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() registerTournamentDto: RegisterTournamentDto,
    @CurrentUser() user: JwtPayload,
    @Query('invite') inviteCode?: string,
  ) {
    return this.tournamentsService.register(id, user.sub, registerTournamentDto, inviteCode);
  }

  @Post(':id/join-team')
  @Verified()
  @ApiBearerAuth()
  @Throttle({ sensitive: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Äá»“ng Ä‘á»™i tham gia nhÃ³m thi Ä‘áº¥u Ä‘Ã¡nh Ä‘Ã´i' })
  async joinTeam(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('participantId') participantId: string,
    @Body('teamInviteToken') teamInviteToken: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.joinTeam(id, user.sub, participantId, teamInviteToken);
  }

  @Post(':id/withdraw')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'RÃºt lui khá»i giáº£i Ä‘áº¥u' })
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
  @ApiOperation({ summary: 'Kiá»ƒm tra tráº¡ng thÃ¡i Ä‘Äƒng kÃ½ cá»§a báº£n thÃ¢n trong giáº£i Ä‘áº¥u' })
  async myRegistration(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Query('divisionId') divisionId?: string,
  ) {
    return this.tournamentsService.myRegistration(id, user.sub, divisionId);
  }

  @Post(':id/regenerate-invite')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Táº¡o láº¡i mÃ£ má»i má»›i' })
  async regenerateInvite(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.regenerateInviteCode(id, user.sub, this.getSystemRoles(user));
  }

  @Public()
  @Get(':id/gallery')
  @ApiOperation({ summary: 'Láº¥y danh sÃ¡ch áº£nh gallery cá»§a giáº£i Ä‘áº¥u (PUBLIC)' })
  async getGallery(@Param('id', ParseUUIDPipe) id: string) {
    return this.tournamentsService.getGallery(id);
  }

  @Post(':id/gallery')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'ThÃªm áº£nh má»›i vÃ o gallery' })
  async addGalleryImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() uploadGalleryDto: UploadGalleryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.addGalleryImage(id, user.sub, uploadGalleryDto.url, this.getSystemRoles(user));
  }

  @Delete(':id/gallery/:index')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'XÃ³a áº£nh khá»i gallery theo index' })
  async removeGalleryImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('index', ParseIntPipe) index: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.removeGalleryImage(id, user.sub, index, this.getSystemRoles(user));
  }

  @Public()
  @Get(':id/participants')
  @ApiOperation({ summary: 'Láº¥y danh sÃ¡ch VÄV Ä‘Äƒng kÃ½ tham gia kÃ¨m rosters' })
  async findParticipants(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('divisionId') divisionId?: string,
  ) {
    return this.tournamentsService.findParticipants(id, divisionId);
  }

  @Get(':id/manage/participants')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Láº¥y danh sÃ¡ch participant Ä‘áº§y Ä‘á»§ cho BTC' })
  async findParticipantsForOrganizer(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('divisionId') divisionId?: string,
  ) {
    return this.tournamentsService.findParticipantsForOrganizer(id, divisionId);
  }

  @Get(':id/referees')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Láº¥y danh sÃ¡ch trá»ng tÃ i cá»§a giáº£i Ä‘áº¥u' })
  async findReferees(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.findReferees(id, user.sub, this.getSystemRoles(user));
  }

  @Post(':id/referees')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Má»i trá»ng tÃ i tham gia giáº£i Ä‘áº¥u báº±ng Email/Gmail' })
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
  @ApiOperation({ summary: 'Trá»ng tÃ i cháº¥p nháº­n/tá»« chá»‘i lá»i má»i lÃ m trá»ng tÃ i' })
  @ApiResponse({ status: 200, description: 'Pháº£n há»“i lá»i má»i thÃ nh cÃ´ng' })
  async respondToRefereeInvite(
    @Param('id', ParseUUIDPipe) tournamentId: string,
    @Param('refereeId', ParseUUIDPipe) refereeId: string,
    @Body('action') action: 'ACCEPT' | 'DECLINE',
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.respondToRefereeInvite(tournamentId, refereeId, user.sub, action);
  }

  @Delete(':id/referees/:refereeId')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'BTC thu há»“i lá»i má»i trá»ng tÃ i Ä‘ang chá» pháº£n há»“i' })
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
  @Get(':id/bracket')
  @ApiOperation({ summary: 'Láº¥y full bracket data' })
  async findBracket(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('divisionId') divisionId?: string,
  ) {
    return this.tournamentsService.findBracket(id, divisionId);
  }

  @Patch('stages/:id')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cáº­p nháº­t cáº¥u hÃ¬nh vÃ²ng Ä‘áº¥u (Stage)' })
  async updateStage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateStageDto: UpdateStageDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.updateStage(id, user.sub, updateStageDto, this.getSystemRoles(user));
  }

  @Post(':id/mock-participants')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sinh danh sÃ¡ch VÄV giáº£ láº­p Ä‘á»ƒ test' })
  async seedMockParticipants(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('names') names: string[],
    @CurrentUser() user: JwtPayload,
    @Body('divisionId') divisionId?: string
  ) {
    return this.tournamentsService.seedMockParticipants(id, user.sub, names, this.getSystemRoles(user), divisionId);
  }

  @Delete(':id/mock-participants')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'XÃ³a toÃ n bá»™ VÄV giáº£ láº­p' })
  async clearMockParticipants(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('divisionId') divisionId: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.clearMockParticipants(id, user.sub, this.getSystemRoles(user), divisionId);
  }

  @Delete(':id/participants/:participantId/mock')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'XÃ³a má»™t participant giáº£ láº­p' })
  async deleteMockParticipant(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.deleteMockParticipant(id, participantId, user.sub, this.getSystemRoles(user));
  }

  @Patch(':id/participants/:participantId')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Duyá»‡t hoáº·c tá»« chá»‘i váº­n Ä‘á»™ng viÃªn Ä‘Äƒng kÃ½' })
  async updateParticipantStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @Body('status') status: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.updateParticipantStatus(id, participantId, status, user.sub, this.getSystemRoles(user));
  }

  @Post(':id/reserve-slots')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'GÃ¡n trá»±c tiáº¿p ngÆ°á»i chÆ¡i vÃ o slot giá»¯ chá»— (Wildcard)' })
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
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Kick váº­n Ä‘á»™ng viÃªn/Ä‘á»™i thi Ä‘áº¥u khá»i giáº£i vÃ  hoÃ n tiá»n' })
  async kickParticipant(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @Body('reason') reason: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.kickParticipant(id, participantId, user.sub, reason, this.getSystemRoles(user));
  }

  @Get(':id/ops-audit-logs')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Láº¥y nháº­t kÃ½ váº­n hÃ nh cho organizer ops panel' })
  async getOpsAuditLogs(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('divisionId') divisionId: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.getOpsAuditLogs(id, user.sub, this.getSystemRoles(user), divisionId);
  }

  @Post(':id/cancel')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Há»§y giáº£i Ä‘áº¥u / ná»™i dung thi Ä‘áº¥u vÃ  hoÃ n tiá»n cho má»i ngÆ°á»i' })
  async cancelTournament(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.cancelTournament(id, user.sub, this.getSystemRoles(user));
  }

  @Post(':id/playoff')
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
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tá»± Ä‘á»™ng xáº¿p háº¡t giá»‘ng theo ELO' })
  async autoSeed(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('divisionId') divisionId: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.autoSeedFromElo(id, user.sub, this.getSystemRoles(user), divisionId);
  }

  @Post(':id/advance-standings')
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
  @Get(':id/staff')
  @ApiOperation({ summary: 'Lay danh sach nhan su (BTC, trong tai, khach xem)' })
  async findStaff(@Param('id', ParseUUIDPipe) id: string) {
    return this.tournamentsService.findStaffByTournament(id);
  }

  @Post(':id/staff')
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

