import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Verified } from '../../common/decorators/verified.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AssignCameraDto } from './dto/assign-camera.dto';
import { CreateCameraDto } from './dto/create-camera.dto';
import { LivestreamService } from './livestream.service';

@ApiTags('livestream')
@Controller('livestream')
export class LivestreamController {
  constructor(private readonly livestreamService: LivestreamService) {}

  @Get('tournaments/:tournamentId/cameras')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Danh sách camera và phân phối livestream của giải' })
  listCameras(
    @Param('tournamentId', ParseUUIDPipe) tournamentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.livestreamService.listCameras(tournamentId, user);
  }

  @Get('tournaments/:tournamentId/matches')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Danh sách trạng thái livestream theo trận của giải' })
  listMatchLivestreams(
    @Param('tournamentId', ParseUUIDPipe) tournamentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.livestreamService.listMatchLivestreams(tournamentId, user);
  }

  @Post('tournaments/:tournamentId/cameras')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo camera/stream key cho giải' })
  createCamera(
    @Param('tournamentId', ParseUUIDPipe) tournamentId: string,
    @CurrentUser() user: JwtPayload,
    @Body() data: CreateCameraDto,
  ) {
    return this.livestreamService.createCamera(tournamentId, user, data);
  }

  @Delete('cameras/:cameraId')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lưu trữ camera, không xoá cứng dữ liệu' })
  deleteCamera(
    @Param('cameraId', ParseUUIDPipe) cameraId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.livestreamService.deleteCamera(cameraId, user);
  }

  @Post('matches/:matchId/assign-camera')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'BTC gán camera cho trận' })
  assignCamera(
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @CurrentUser() user: JwtPayload,
    @Body() data: AssignCameraDto,
  ) {
    return this.livestreamService.assignCamera(matchId, user, data);
  }

  @Post('matches/:matchId/start')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'BTC hoặc trọng tài được phân công bắt đầu livestream nếu trận đã có camera' })
  startMatchStream(
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.livestreamService.startMatchStream(matchId, user);
  }

  @Post('matches/:matchId/stop')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'BTC hoặc trọng tài được phân công dừng livestream' })
  stopMatchStream(
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.livestreamService.stopMatchStream(matchId, user);
  }

  @Public()
  @Get('matches/:matchId/playback')
  @ApiOperation({ summary: 'Người chơi/khán giả xem playback livestream, không trả stream key' })
  getMatchPlayback(@Param('matchId', ParseUUIDPipe) matchId: string) {
    return this.livestreamService.getMatchPlayback(matchId);
  }
}
