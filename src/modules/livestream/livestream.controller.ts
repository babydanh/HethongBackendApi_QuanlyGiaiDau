import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FacebookPageConnectionService } from './facebook-page-connection.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Verified } from '../../common/decorators/verified.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AssignCameraDto } from './dto/assign-camera.dto';
import { CreateCameraDto } from './dto/create-camera.dto';
import { PublishQrDto } from './dto/publish-qr.dto';
import { SetCourtPlaybackUrlDto } from './dto/set-court-playback-url.dto';
import { LivestreamService } from './livestream.service';
import { LiveSessionService } from './live-session.service';
import { PrepareLiveSessionDto } from './dto/prepare-live-session.dto';
import { CameraDeviceService } from './camera-device.service';
import { CreateCameraDeviceDto } from './dto/create-camera-device.dto';
import { CreateDevicePairingTokenDto } from './dto/create-device-pairing-token.dto';
import { HeartbeatCameraDeviceDto } from './dto/heartbeat-camera-device.dto';
import { PairCameraDeviceDto } from './dto/pair-camera-device.dto';
import { UpdateCameraDeviceDto } from './dto/update-camera-device.dto';
import { SkipThrottle } from '@nestjs/throttler';
import { SkipAppKey } from '../../common/decorators/skip-app-key.decorator';
import type { Request, Response } from 'express';

@ApiTags('livestream')
@SkipThrottle()
@Controller('livestream')
export class LivestreamController {
  constructor(
    private readonly livestreamService: LivestreamService,
    private readonly liveSessionService: LiveSessionService,
    private readonly cameraDeviceService: CameraDeviceService,
    private readonly facebookPageConnectionService: FacebookPageConnectionService,
  ) {}



  @Post('sessions/prepare')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Chuẩn bị một phiên Facebook livestream cho camera đã ghép đôi',
  })
  prepareSession(
    @CurrentUser() user: JwtPayload,
    @Body() data: PrepareLiveSessionDto,
  ) {
    return this.liveSessionService.prepareSession(data, user);
  }

  @Post('sessions/:sessionId/started')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Xác nhận publisher đã khởi động và kiểm tra provider đã nhận tín hiệu',
  })
  markPublisherStarted(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.liveSessionService.markPublisherStarted(sessionId, user);
  }

  @Post('sessions/:sessionId/heartbeat')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Gửi heartbeat và cập nhật health của phiên livestream',
  })
  heartbeat(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.liveSessionService.heartbeat(sessionId, user);
  }

  @Post('sessions/:sessionId/reconnect')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Khôi phục một phiên livestream đang reconnecting' })
  reconnectSession(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.liveSessionService.reconnectSession(sessionId, user);
  }

  @Post('sessions/:sessionId/stop')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Kết thúc Facebook livestream và lưu replay nếu có',
  })
  stopSession(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.liveSessionService.stopSession(sessionId, user);
  }

  @Get('tournaments/:tournamentId/sessions')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xem các phiên livestream của một giải đấu' })
  listSessions(
    @Param('tournamentId', ParseUUIDPipe) tournamentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.liveSessionService.listSessions(tournamentId, user);
  }

  @Get('sessions/:sessionId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xem trạng thái một phiên livestream' })
  getSession(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.liveSessionService.getSession(sessionId, user);
  }

  @Get('facebook/connect')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo URL OAuth để kết nối Facebook Page' })
  connectFacebook(
    @CurrentUser() user: JwtPayload,
    @Query('communityId', ParseUUIDPipe) communityId: string,
  ) {
    return this.facebookPageConnectionService.createOAuthStart(
      communityId,
      user,
    );
  }

  @Get('facebook/callback')
  @Public()
  @SkipAppKey()
  @ApiOperation({ summary: 'Facebook OAuth callback cho Page connection' })
  async facebookCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() response: Response,
  ): Promise<void> {
    const connection = await this.facebookPageConnectionService.completeOAuth(
      code,
      state,
    );
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3001';
    response.redirect(
      `${frontendUrl}/organizer/livestream/facebook-callback?status=connected&communityId=${encodeURIComponent(connection.communityId)}`,
    );
  }

  @Get('facebook/connection')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xem trạng thái Facebook Page hiện tại' })
  getFacebookConnection(
    @CurrentUser() user: JwtPayload,
    @Query('communityId', ParseUUIDPipe) communityId: string,
  ) {
    return this.facebookPageConnectionService.getConnection(communityId, user);
  }

  @Post('facebook/validate')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xác thực lại Facebook Page connection' })
  validateFacebookConnection(
    @CurrentUser() user: JwtPayload,
    @Query('connectionId', ParseUUIDPipe) connectionId: string,
  ) {
    return this.facebookPageConnectionService.validateConnection(
      connectionId,
      user,
    );
  }

  @Delete('facebook/connection')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ngắt kết nối Facebook Page' })
  disconnectFacebookConnection(
    @CurrentUser() user: JwtPayload,
    @Query('communityId', ParseUUIDPipe) communityId: string,
  ) {
    return this.facebookPageConnectionService.disconnectConnection(
      communityId,
      user,
    );
  }

  @Get('devices')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Danh sách camera device reusable theo community' })
  listDevices(
    @CurrentUser() user: JwtPayload,
    @Query('communityId', ParseUUIDPipe) communityId: string,
  ) {
    return this.cameraDeviceService.listDevices(communityId, user);
  }

  @Post('devices')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo camera device reusable cho community' })
  createDevice(
    @CurrentUser() user: JwtPayload,
    @Body() data: CreateCameraDeviceDto,
  ) {
    return this.cameraDeviceService.createDevice(data, user);
  }

  @Post('devices/pair')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Đổi mã QR một lần lấy trạng thái thiết bị đã ghép đôi',
  })
  pairDevice(
    @CurrentUser() user: JwtPayload,
    @Body() data: PairCameraDeviceDto,
  ) {
    return this.cameraDeviceService.pairDevice(data, user);
  }

  @Post('devices/:deviceId/pairing-token')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sinh pairing token một lần cho QR camera device' })
  createPairingToken(
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @CurrentUser() user: JwtPayload,
    @Body() data: CreateDevicePairingTokenDto,
  ) {
    return this.cameraDeviceService.createPairingToken(deviceId, data, user);
  }

  @Post('devices/:deviceId/heartbeat')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cập nhật heartbeat và trạng thái online của camera device',
  })
  deviceHeartbeat(
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @CurrentUser() user: JwtPayload,
    @Body() data: HeartbeatCameraDeviceDto,
  ) {
    return this.cameraDeviceService.heartbeat(deviceId, data, user);
  }

  @Patch('devices/:deviceId')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cập nhật tên, sân, operator hoặc ghi chú của camera device',
  })
  updateDevice(
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @CurrentUser() user: JwtPayload,
    @Body() data: UpdateCameraDeviceDto,
  ) {
    return this.cameraDeviceService.updateDevice(deviceId, data, user);
  }

  @Post('devices/:deviceId/revoke')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thu hồi camera device đã ghép đôi' })
  revokeDevice(
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cameraDeviceService.revokeDevice(deviceId, user);
  }

  @Get('tournaments/:tournamentId/cameras')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Danh sách camera và phân phối livestream của giải',
  })
  listCameras(
    @Param('tournamentId', ParseUUIDPipe) tournamentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.livestreamService.listCameras(tournamentId, user);
  }

  @Get('tournaments/:tournamentId/matches')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Danh sách trạng thái livestream theo trận của giải',
  })
  listMatchLivestreams(
    @Param('tournamentId', ParseUUIDPipe) tournamentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.livestreamService.listMatchLivestreams(tournamentId, user);
  }

  @Put('tournaments/:tournamentId/courts/:courtId/playback-url')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Khai URL phát trực tiếp cho một sân (đặt trong setting sân)',
    description:
      'Gửi playbackUrl rỗng để xoá URL và ngừng phát sân này. Mọi trận diễn tại sân sẽ tự dùng URL này.',
  })
  setCourtPlaybackUrl(
    @Param('tournamentId', ParseUUIDPipe) tournamentId: string,
    @Param('courtId', ParseUUIDPipe) courtId: string,
    @CurrentUser() user: JwtPayload,
    @Body() data: SetCourtPlaybackUrlDto,
  ) {
    return this.livestreamService.setCourtPlaybackUrl(tournamentId, courtId, user, data);
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

  @Post('cameras/:cameraId/publish-qr')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Dựng QR publish (docx §2.2) + cặp RTMP cho camera PUSH',
    description:
      'Trả payload 5 field để app Camera Station của AQP quét, kèm cặp RTMP ' +
      '(server + streamKey) để nhập tay vào OBS. `publishKey` do AQP cấp và ' +
      'phải gửi trong request: key là per-stream, KHÔNG lưu lại, KHÔNG ghi log.',
  })
  buildPublishQr(
    @Param('cameraId', ParseUUIDPipe) cameraId: string,
    @CurrentUser() user: JwtPayload,
    @Body() data: PublishQrDto,
  ) {
    return this.livestreamService.buildCameraPublishQr(cameraId, user, data);
  }

  @Post('cameras/:cameraId/rotate-stream-key')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cấp lại stream key nội bộ của camera PUSH (pipeline SportO)',
    description:
      'Sinh streamName/streamKey mới cho media server của SportO. KHÔNG phải ' +
      'publish key của AQP — key AQP được cấp và rotate tại panel AQP.',
  })
  rotateStreamKey(
    @Param('cameraId', ParseUUIDPipe) cameraId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.livestreamService.rotateCameraStreamKey(cameraId, user);
  }

  @Get('cameras/:cameraId/status')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Trạng thái phát thật của camera, đọc từ media server',
    description:
      'Gọi AQP `isMediaOnline` cho stream của camera và đồng bộ cột status. ' +
      'Dùng để BTC biết camera đã lên hình chưa thay vì suy đoán.',
  })
  getCameraStatus(
    @Param('cameraId', ParseUUIDPipe) cameraId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.livestreamService.getCameraLiveStatus(cameraId, user);
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

  @Header('Cache-Control', 'private, no-store')
  @Get('matches/:matchId/control-state')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Kiểm tra trạng thái livestream có thể điều khiển của trận',
    description:
      'Chỉ trả trạng thái điều khiển tối thiểu; không bao gồm mã camera, stream key hoặc URL phát.',
  })
  getMatchStreamControlState(
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.livestreamService.getMatchStreamControlState(matchId, user);
  }

  @Post('matches/:matchId/start')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'BTC hoặc trọng tài được phân công bắt đầu livestream nếu trận đã có camera',
  })
  startMatchStream(
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.livestreamService.startMatchStream(matchId, user);
  }

  @Post('matches/:matchId/stop')
  @Verified()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'BTC hoặc trọng tài được phân công dừng livestream',
  })
  stopMatchStream(
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.livestreamService.stopMatchStream(matchId, user);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('matches/:matchId/playback')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary:
      'Người chơi/khán giả xem playback livestream, không trả stream key',
  })
  async getMatchPlayback(
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    const standalonePlayback =
      await this.livestreamService.getStandaloneMatchPlayback(matchId, user);
    if (standalonePlayback) return standalonePlayback;

    const providerPlayback =
      await this.liveSessionService.getMatchPlayback(matchId);
    if (providerPlayback?.playbackUrl || providerPlayback?.replayUrl) {
      return providerPlayback;
    }
    return this.livestreamService.getMatchPlayback(matchId);
  }
}
