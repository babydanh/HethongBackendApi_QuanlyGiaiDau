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
} from '@nestjs/common';
import type { Request } from 'express';
import { TournamentsService } from './tournaments.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { QueryTournamentDto } from './dto/query-tournament.dto';
import { RegisterTournamentDto } from './dto/register-tournament.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { UploadGalleryDto } from './dto/gallery.dto';
import { CreateParentTournamentDto } from './dto/create-parent-tournament.dto';
import { UpdateParentTournamentDto } from './dto/update-parent-tournament.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/constants/enums';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('tournaments')
@Controller('tournaments')
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

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

  @Patch('parent/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật thông tin giải đấu cha' })
  async updateParent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateParentTournamentDto: UpdateParentTournamentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.updateParent(id, user.sub, updateParentTournamentDto, [user.role]);
  }

  @Delete('parent/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa giải đấu cha' })
  async removeParent(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.removeParent(id, user.sub, [user.role]);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết giải đấu' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('invite') inviteCode?: string,
    @Req() req?: Request,
  ) {
    const userId = this.getUserIdFromRequest(req);
    return this.tournamentsService.findOne(id, userId, inviteCode);
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

  private getUserIdFromRequest(request: Request | undefined): string | null {
    if (!request || !request.headers) return null;
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    const token = authHeader.split(' ')[1];
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('ascii'));
      return payload.sub || null;
    } catch {
      return null;
    }
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo giải đấu mới' })
  async create(
    @Body() createTournamentDto: CreateTournamentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.create(user.sub, createTournamentDto, [user.role]);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật giải đấu' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateTournamentDto: UpdateTournamentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.update(id, user.sub, updateTournamentDto, [user.role]);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa giải đấu (Soft Delete)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.remove(id, user.sub, [user.role]);
  }



  @Post(':id/generate-bracket')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sinh nhánh đấu tự động (Bracket Generation)' })
  async generateBracket(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.generateBracket(id, user.sub, [user.role]);
  }

  @Post(':id/publish')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Công bố giải đấu từ DRAFT -> REGISTRATION_OPEN' })
  async publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.publish(id, user.sub, [user.role]);
  }

  @Post(':id/lock')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Chốt danh sách VĐV, tính phí sàn và sinh bracket' })
  async lock(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.lock(id, user.sub, [user.role]);
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
  ) {
    return this.tournamentsService.withdraw(id, user.sub);
  }

  @Get(':id/my-registration')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Kiểm tra trạng thái đăng ký của bản thân trong giải đấu' })
  async myRegistration(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.myRegistration(id, user.sub);
  }

  @Post(':id/regenerate-invite')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo lại mã mời mới' })
  async regenerateInvite(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.regenerateInviteCode(id, user.sub, [user.role]);
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
    return this.tournamentsService.addGalleryImage(id, user.sub, uploadGalleryDto.url, [user.role]);
  }

  @Delete(':id/gallery/:index')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa ảnh khỏi gallery theo index' })
  async removeGalleryImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('index', ParseIntPipe) index: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.removeGalleryImage(id, user.sub, index, [user.role]);
  }

  @Public()
  @Get(':id/participants')
  @ApiOperation({ summary: 'Lấy danh sách VĐV đăng ký tham gia kèm rosters' })
  async findParticipants(@Param('id', ParseUUIDPipe) id: string) {
    return this.tournamentsService.findParticipants(id);
  }

  @Public()
  @Get(':id/bracket')
  @ApiOperation({ summary: 'Lấy full bracket data' })
  async findBracket(@Param('id', ParseUUIDPipe) id: string) {
    return this.tournamentsService.findBracket(id);
  }

  @Patch('stages/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật cấu hình vòng đấu (Stage)' })
  async updateStage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateStageDto: UpdateStageDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.updateStage(id, user.sub, updateStageDto, [user.role]);
  }

  @Post(':id/mock-participants')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sinh danh sách VĐV giả lập để test' })
  async seedMockParticipants(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('names') names: string[],
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.seedMockParticipants(id, user.sub, names, [user.role]);
  }

  @Delete(':id/mock-participants')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa toàn bộ VĐV giả lập' })
  async clearMockParticipants(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.clearMockParticipants(id, user.sub, [user.role]);
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
    return this.tournamentsService.updateParticipantStatus(id, participantId, status, user.sub, [user.role]);
  }

  @Post(':id/reserve-slots')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Gán trực tiếp người chơi vào slot giữ chỗ (Wildcard)' })
  async assignReservedSlot(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('userEmailOrPhone') userEmailOrPhone: string,
    @Body('teamName') teamName: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.assignReservedSlot(id, userEmailOrPhone, teamName, user.sub, [user.role]);
  }
}
