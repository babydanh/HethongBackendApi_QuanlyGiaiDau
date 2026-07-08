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
import type { Request } from 'express';
import { TournamentsService } from './tournaments.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { CreateLiteTournamentDto } from './dto/create-lite-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { QueryTournamentDto } from './dto/query-tournament.dto';
import { RegisterTournamentDto } from './dto/register-tournament.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { UploadGalleryDto } from './dto/gallery.dto';
import { CreateParentTournamentDto } from './dto/create-parent-tournament.dto';
import { UpdateParentTournamentDto } from './dto/update-parent-tournament.dto';
import { CreateDivisionDto } from './dto/create-division.dto';
import { UpdateDivisionDto } from './dto/update-division.dto';
import { AddRefereeDto } from './dto/add-referee.dto';
import { AddStaffMemberDto } from './dto/add-staff-member.dto';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/constants/enums';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('tournaments')
@Controller('tournaments')
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

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
  @Get()
  @ApiOperation({ summary: 'Lấy danh sách giải đấu' })
  async findAll(@Query() query: QueryTournamentDto) {
    return this.tournamentsService.findAll(query);
  }

  @Post('parent')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo giải đấu cha (chuỗi giải đấu / nhiều thể loại)' })
  async createParent(
    @Body() createParentTournamentDto: CreateParentTournamentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.createParent(user.sub, createParentTournamentDto);
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
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa bảng/nội dung thi đấu' })
  async removeDivision(
    @Param('divisionId', ParseUUIDPipe) divisionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.deleteDivision(divisionId, user.sub, this.getSystemRoles(user));
  }

  @Public()
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

  @Patch(':id')
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
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa giải đấu (Soft Delete)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.remove(id, user.sub, this.getSystemRoles(user));
  }



  @Post(':id/generate-bracket')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sinh nhánh đấu tự động (Bracket Generation)' })
  async generateBracket(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('divisionId') divisionId: string | undefined,
    @Body('seedingType') seedingType: 'SEEDED' | 'RANDOM' | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.generateBracket(id, user.sub, this.getSystemRoles(user), divisionId, seedingType);
  }

  @Post(':id/publish')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Công bố giải đấu từ DRAFT -> REGISTRATION_OPEN' })
  async publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.publish(id, user.sub, this.getSystemRoles(user));
  }

  @Post(':id/follow')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Theo dõi giải đấu' })
  async follow(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.followTournament(id, user.sub);
  }

  @Delete(':id/follow')
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
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Chốt danh sách VĐV, tính phí sàn và sinh bracket' })
  async lock(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.lock(id, user.sub, this.getSystemRoles(user));
  }

  @Post(':id/register')
  @ApiBearerAuth()
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
  @ApiOperation({ summary: 'Đồng đội tham gia nhóm thi đấu đánh đôi' })
  async joinTeam(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('participantId') participantId: string,
    @Body('teamInviteToken') teamInviteToken: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.joinTeam(id, user.sub, participantId, teamInviteToken);
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
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo lại mã mời mới' })
  async regenerateInvite(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.regenerateInviteCode(id, user.sub, this.getSystemRoles(user));
  }

  @Public()
  @Get(':id/gallery')
  @ApiOperation({ summary: 'Lấy danh sách ảnh gallery của giải đấu (PUBLIC)' })
  async getGallery(@Param('id', ParseUUIDPipe) id: string) {
    return this.tournamentsService.getGallery(id);
  }

  @Post(':id/gallery')
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
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy danh sách participant đầy đủ cho BTC' })
  async findParticipantsForOrganizer(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('divisionId') divisionId?: string,
  ) {
    return this.tournamentsService.findParticipantsForOrganizer(id, divisionId);
  }

  @Get(':id/referees')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy danh sách trọng tài của giải đấu' })
  async findReferees(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.findReferees(id, user.sub, this.getSystemRoles(user));
  }

  @Post(':id/referees')
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
  @Get(':id/bracket')
  @ApiOperation({ summary: 'Lấy full bracket data' })
  async findBracket(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('divisionId') divisionId?: string,
  ) {
    return this.tournamentsService.findBracket(id, divisionId);
  }

  @Patch('stages/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật cấu hình vòng đấu (Stage)' })
  async updateStage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateStageDto: UpdateStageDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.updateStage(id, user.sub, updateStageDto, this.getSystemRoles(user));
  }

  @Post(':id/mock-participants')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sinh danh sách VĐV giả lập để test' })
  async seedMockParticipants(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('names') names: string[],
    @CurrentUser() user: JwtPayload,
    @Body('divisionId') divisionId?: string
  ) {
    return this.tournamentsService.seedMockParticipants(id, user.sub, names, this.getSystemRoles(user), divisionId);
  }

  @Delete(':id/mock-participants')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa toàn bộ VĐV giả lập' })
  async clearMockParticipants(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('divisionId') divisionId: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.clearMockParticipants(id, user.sub, this.getSystemRoles(user), divisionId);
  }

  @Patch(':id/participants/:participantId')
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

  @Post(':id/reserve-slots')
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
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Hủy giải đấu / nội dung thi đấu và hoàn tiền cho mọi người' })
  async cancelTournament(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.cancelTournament(id, user.sub, this.getSystemRoles(user));
  }

  @Post(':id/playoff')
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
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ket thuc som stage (cancel cac tran con lai)' })
  async finalizeStage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stageId', ParseUUIDPipe) stageId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.finalizeStage(id, stageId, user.sub, this.getSystemRoles(user));
  }

  @Public()
  @Get(':id/staff')
  @ApiOperation({ summary: 'Lay danh sach nhan su (BTC, trong tai, khach xem)' })
  async findStaff(@Param('id', ParseUUIDPipe) id: string) {
    return this.tournamentsService.findStaffByTournament(id);
  }

  @Post(':id/staff')
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
