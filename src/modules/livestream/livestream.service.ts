import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AssignCameraDto } from './dto/assign-camera.dto';
import { CreateCameraDto } from './dto/create-camera.dto';
import { SetCourtPlaybackUrlDto } from './dto/set-court-playback-url.dto';
import {
  LivestreamMode,
  LivestreamProtocol,
  LivestreamRepository,
} from './livestream.repository';

@Injectable()
export class LivestreamService {
  constructor(
    private readonly livestreamRepository: LivestreamRepository,
    private readonly configService: ConfigService,
  ) {}

  private isAdmin(user: JwtPayload) {
    return user.role === 'ADMIN' || user.roles?.includes('ADMIN') === true;
  }

  private getMediaServerHost() {
    return this.configService.get<string>('LIVESTREAM_MEDIA_SERVER_HOST') || 'media.aqvision.net';
  }

  private getRtmpBaseUrl() {
    return this.configService.get<string>('LIVESTREAM_RTMP_BASE_URL') || 'rtmp://sporto.asia:1935/live';
  }

  private getHlsBaseUrl() {
    return this.configService.get<string>('LIVESTREAM_HLS_PUBLIC_BASE_URL') || 'https://sporto.asia/hls';
  }

  private buildPlaybackUrl(streamKey: string) {
    return `${this.getHlsBaseUrl().replace(/\/$/, '')}/${streamKey}/index.m3u8`;
  }

  /**
   * MediaMTX serves HLS over plain HTTP on 8888. Public pages are HTTPS, so
   * production must use the reverse-proxied HTTPS path instead of exposing
   * the media port directly. Normalize legacy rows created with :8888 too.
   */
  private normalizePublicPlaybackUrl(url: string | null | undefined) {
    if (!url) return url ?? null;

    try {
      const parsed = new URL(url);
      if (
        (parsed.hostname === 'giaidau.vnvar.com' || parsed.hostname === 'sporto.asia') &&
        parsed.port === '8888'
      ) {
        // Old rows stored MediaMTX's plain HTTP port. Rebuild from the key so
        // playback goes through the public HTTPS reverse proxy, regardless of
        // whether the old path was /live or /hls.
        const parts = parsed.pathname.split('/').filter(Boolean);
        const indexPosition = parts.lastIndexOf('index.m3u8');
        const streamKey = indexPosition > 0 ? parts[indexPosition - 1] : null;
        if (streamKey) return this.buildPlaybackUrl(streamKey);

        parsed.protocol = 'https:';
        parsed.port = '';
      }
      return parsed.toString();
    } catch {
      return url;
    }
  }

  private buildIngestUrl(streamKey: string) {
    return `${this.getRtmpBaseUrl().replace(/\/$/, '')}/${streamKey}`;
  }

  // ENDED was used by the old stop flow. Replay is not supported yet, so it
  // must not permanently block a match or a newly assigned camera.
  private normalizeStream<T extends { streamStatus?: string | null; endedAt?: Date | null; playbackUrl?: string | null }>(stream: T): T;
  private normalizeStream<T extends { streamStatus?: string | null; endedAt?: Date | null; playbackUrl?: string | null }>(stream: T | null | undefined): T | null;
  private normalizeStream<T extends { streamStatus?: string | null; endedAt?: Date | null; playbackUrl?: string | null }>(stream: T | null | undefined): T | null {
    if (!stream) return null;
    if (stream.streamStatus !== 'ENDED') return stream;
    return {
      ...stream,
      streamStatus: 'IDLE',
      endedAt: null,
      playbackUrl: null,
    };
  }

  private buildSrtUrl(streamName: string) {
    const baseUrl = this.configService.get<string>('LIVESTREAM_SRT_BASE_URL') || 'srt://localhost:8890';
    return `${baseUrl.replace(/\/$/, '')}?streamid=publish:${streamName}`;
  }

  private buildPublishInfo(protocol: 'RTMP' | 'SRT', streamName: string) {
    const rtmpUrl = this.buildIngestUrl(streamName);
    const srtUrl = this.buildSrtUrl(streamName);

    return {
      protocol,
      streamName,
      url: protocol === 'SRT' ? srtUrl : rtmpUrl,
      rtmpUrl,
      srtUrl,
    };
  }

  private async assertTournamentOperator(tournamentId: string, user: JwtPayload) {
    const tournament = await this.livestreamRepository.findTournamentById(tournamentId);
    if (!tournament) {
      throw new NotFoundException('Giải đấu không tồn tại');
    }

    if (this.isAdmin(user) || tournament.createdBy === user.sub) {
      return tournament;
    }

    const isStaff = await this.livestreamRepository.isTournamentStaff(tournamentId, user.sub);
    if (!isStaff) {
      throw new ForbiddenException('Chỉ chủ giải, đồng tổ chức hoặc admin được cấu hình camera.');
    }

    return tournament;
  }

  private async assertCanControlMatchStream(matchId: string, user: JwtPayload) {
    const match = await this.livestreamRepository.findMatchWithTournament(matchId);
    if (!match) {
      throw new NotFoundException('Trận đấu không tồn tại');
    }

    const isOperator =
      this.isAdmin(user) ||
      match.tournamentCreatedBy === user.sub ||
      (await this.livestreamRepository.isTournamentStaff(match.tournamentId, user.sub));
    const isAssignedReferee = match.refereeId === user.sub;

    if (!isOperator && !isAssignedReferee) {
      throw new ForbiddenException('Bạn không có quyền điều khiển livestream trận này.');
    }

    return match;
  }

  async listCameras(tournamentId: string, user: JwtPayload) {
    await this.assertTournamentOperator(tournamentId, user);
    const cameras = await this.livestreamRepository.listCameras(tournamentId);
    return cameras.map((camera) => ({
      ...camera,
      playbackUrl: this.normalizePublicPlaybackUrl(camera.playbackUrl),
    }));
  }

  async listMatchLivestreams(tournamentId: string, user: JwtPayload) {
    await this.assertTournamentOperator(tournamentId, user);
    const streams = await this.livestreamRepository.listMatchLivestreams(tournamentId);
    return streams.map((stream) => {
      const normalized = this.normalizeStream(stream);
      if (!normalized) return stream;
      // A soft-deleted camera is intentionally treated as unassigned, even
      // when an old match row still contains its cameraId.
      return normalized.cameraName
        ? { ...normalized, playbackUrl: this.normalizePublicPlaybackUrl(normalized.playbackUrl) }
        : { ...normalized, cameraId: null, streamStatus: 'IDLE', playbackUrl: null, endedAt: null };
    });
  }

  /**
   * Lưu (hoặc xoá) URL phát của một sân. Đây là đường BTC khai URL một lần trong
   * setting sân; mọi trận diễn tại sân đó tự dùng URL này, không cần tạo camera.
   *
   * Xoá URL không xoá camera: set deleted_at để URL cũ còn truy vết được thay vì
   * biến mất vĩnh viễn, đúng quy ước soft delete của các bảng chính.
   */
  async setCourtPlaybackUrl(
    tournamentId: string,
    courtId: string,
    user: JwtPayload,
    data: SetCourtPlaybackUrlDto,
  ) {
    await this.assertTournamentOperator(tournamentId, user);
    await this.assertCourtUsableByTournament(courtId, tournamentId);

    const trimmed = data.playbackUrl?.trim();
    const existing = await this.livestreamRepository.findPullCameraByCourt(courtId, tournamentId);

    if (!trimmed) {
      if (!existing) {
        return { courtId, playbackUrl: null, cameraId: null };
      }
      await this.livestreamRepository.archiveCamera(existing.id);
      return { courtId, playbackUrl: null, cameraId: null };
    }

    const playbackUrl = this.assertPullPlaybackUrl(trimmed);
    const name = data.name?.trim() || existing?.name || 'Camera sân';

    if (existing) {
      const updated = await this.livestreamRepository.updatePullCameraUrl(
        existing.id,
        name,
        this.normalizePublicPlaybackUrl(playbackUrl)!,
      );
      return { courtId, playbackUrl: updated.playbackUrl, cameraId: updated.id };
    }

    const created = await this.livestreamRepository.createCamera({
      tournamentId,
      courtId,
      name,
      mode: 'PULL',
      protocol: 'RTMP',
      streamName: `court_${courtId.replace(/-/g, '')}_${randomUUID().replace(/-/g, '').slice(0, 8)}`,
      streamKey: randomUUID().replace(/-/g, ''),
      playbackUrl: this.normalizePublicPlaybackUrl(playbackUrl)!,
      createdBy: user.sub,
    });

    return { courtId, playbackUrl: created.playbackUrl, cameraId: created.id };
  }


  async createCamera(tournamentId: string, user: JwtPayload, data: CreateCameraDto) {
    await this.assertTournamentOperator(tournamentId, user);
    const streamName = `camera_${randomUUID().replace(/-/g, '')}`;
    const streamKey = randomUUID().replace(/-/g, '');
    const mode: LivestreamMode = data.mode === 'PULL' ? 'PULL' : 'PUSH';
    const protocol: LivestreamProtocol = data.protocol ?? 'RTMP';
    const courtId = data.courtId ?? null;
    if (courtId) {
      await this.assertCourtUsableByTournament(courtId, tournamentId);
    }


    // PULL: luồng đã được phát sẵn từ bên ngoài, BTC dán URL phát vào.
    // Không sinh và không chuẩn hoá lại URL đó — mọi hình dạng đều phải giữ nguyên.
    const playbackUrl =
      mode === 'PULL'
        ? this.assertPullPlaybackUrl(data.playbackUrl)
        : this.buildPlaybackUrl(streamName);

    const camera = await this.livestreamRepository.createCamera({
      tournamentId,
      courtId,
      name: data.name.trim(),
      mode,
      protocol,
      streamName,
      streamKey,
      playbackUrl: this.normalizePublicPlaybackUrl(playbackUrl)!,
      createdBy: user.sub,
    });

    return {
      ...camera,
      // PULL không có URL ingest để BTC cấu hình ở OBS/Camera Station.
      publish: mode === 'PULL' ? null : this.buildPublishInfo(protocol, streamName),
    };
  }

  /**
   * Sân phải thuộc địa điểm mà giải này dùng — qua cả venue mặc định lẫn venue
   * theo vòng — nếu không thì khai URL cho sân của giải khác sẽ lọt vào đây.
   */
  private async assertCourtUsableByTournament(courtId: string, tournamentId: string) {
    const tournamentIds = await this.livestreamRepository.findTournamentIdsUsingCourt(courtId);
    if (tournamentIds.length === 0) {
      throw new NotFoundException('Sân không tồn tại');
    }
    if (!tournamentIds.includes(tournamentId)) {
      throw new BadRequestException('Sân không thuộc giải đấu này.');
    }
  }

  private assertPullPlaybackUrl(playbackUrl: string | undefined) {
    const trimmed = playbackUrl?.trim();
    if (!trimmed) {
      throw new BadRequestException('Chế độ PULL cần URL phát trực tiếp của sân.');
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new BadRequestException('URL phát trực tiếp không hợp lệ.');
    }

    // Chỉ nhận https://. Trang live phục vụ qua HTTPS nên nguồn http:// bị trình
    // duyệt chặn mixed content và khán giả chỉ thấy màn hình đen — từ chối ngay
    // lúc lưu thay vì để BTC nhập xong mới phát hiện.
    if (parsed.protocol !== 'https:') {
      throw new BadRequestException('URL phát phải dùng https://.');
    }

    return trimmed;
  }

  async deleteCamera(cameraId: string, user: JwtPayload) {
    const camera = await this.livestreamRepository.findCameraById(cameraId);
    if (!camera) {
      throw new NotFoundException('Camera không tồn tại');
    }

    await this.assertTournamentOperator(camera.tournamentId, user);
    return this.livestreamRepository.deleteCamera(cameraId);
  }

  async assignCamera(matchId: string, user: JwtPayload, data: AssignCameraDto) {
    const match = await this.livestreamRepository.findMatchWithTournament(matchId);
    if (!match) {
      throw new NotFoundException('Trận đấu không tồn tại');
    }

    await this.assertTournamentOperator(match.tournamentId, user);

    const camera = await this.livestreamRepository.findCameraById(data.cameraId);
    if (!camera || camera.tournamentId !== match.tournamentId) {
      throw new BadRequestException('Camera không thuộc giải đấu của trận này.');
    }

    return this.livestreamRepository.assignCameraToMatch(
      matchId,
      data.cameraId,
      this.normalizePublicPlaybackUrl(camera.playbackUrl) ?? '',
    );
  }

  /**
   * Dọn camera của sân trước khi sân bị xoá.
   *
   * `livestream_cameras.court_id` là `ON DELETE SET NULL`, nên phải gọi hàm này
   * TRƯỚC khi xoá sân, không thể làm sau. Xoá dòng gán trong `match_livestreams`
   * để trận không còn phát nhầm camera của sân đã bị xoá.
   */
  async detachCamerasForCourt(courtId: string) {
    return this.livestreamRepository.detachCamerasForCourt(courtId);
  }

  /**
   * Gán camera PULL của sân cho trận khi BTC xếp trận vào sân đó.
   *
   * Sân có khai URL phát thì mọi trận xếp vào sân đó tự chạy, không cần BTC
   * chọn camera tay. Trận đã được gán camera tay vẫn giữ nguyên, trừ khi BTC vừa
   * đổi sân: lúc đó camera cũ không còn đúng nên phải gán lại camera của sân mới.
   */
  async autoAssignCourtCamera(
    matchId: string,
    tournamentId: string,
    courtId: string | null,
    options: { courtChanged: boolean },
  ) {
    if (!courtId) return null;

    const camera = await this.livestreamRepository.findPullCameraByCourt(courtId, tournamentId);
    if (!camera) return null;

    if (!options.courtChanged) {
      const current = await this.livestreamRepository.findMatchLivestream(matchId);
      if (current?.cameraId) return null;
    }

    return this.livestreamRepository.assignCameraToMatch(
      matchId,
      camera.id,
      this.normalizePublicPlaybackUrl(camera.playbackUrl) ?? '',
    );
  }

  async startMatchStream(matchId: string, user: JwtPayload) {
    const match = await this.assertCanControlMatchStream(matchId, user);
    const stream = this.normalizeStream(await this.livestreamRepository.findMatchLivestream(matchId));

    if (!stream?.cameraId || !stream.streamKey) {
      throw new BadRequestException('Trận này chưa được BTC gán camera nên chưa thể bắt đầu livestream.');
    }

    if (!match.participant1Id || !match.participant2Id) {
      throw new BadRequestException('Trận chưa đủ hai đội nên chưa thể bắt đầu livestream.');
    }

    const playbackUrl = this.normalizePublicPlaybackUrl(
      stream.cameraPlaybackUrl || this.buildPlaybackUrl(stream.streamKey),
    )!;
    const livestream = await this.livestreamRepository.updateStreamStatus(matchId, 'LIVE', user.sub, playbackUrl);

    const protocol = stream.cameraProtocol === 'SRT' ? 'SRT' : 'RTMP';

    return {
      livestream,
      // PULL: luồng đã phát sẵn từ URL của sân, không có URL ingest để BTC dán
      // vào OBS — trả null để không sinh ra link RTMP gây hiểu nhầm.
      publish:
        stream.cameraMode === 'PULL'
          ? null
          : this.buildPublishInfo(protocol, stream.streamName ?? stream.streamKey),
      playbackUrl,
    };
  }

  async stopMatchStream(matchId: string, user: JwtPayload) {
    await this.assertCanControlMatchStream(matchId, user);
    const stream = this.normalizeStream(await this.livestreamRepository.findMatchLivestream(matchId));

    if (!stream?.cameraId) {
      throw new BadRequestException('Trận này chưa được gán camera.');
    }

    // Stopping a broadcast is reversible. Recording/replay is a separate feature.
    return this.livestreamRepository.updateStreamStatus(matchId, 'IDLE', user.sub, null);
  }

  async getMatchPlayback(matchId: string) {
    const match = await this.livestreamRepository.findMatchWithTournament(matchId);
    if (!match) {
      throw new NotFoundException('Trận đấu không tồn tại');
    }
    if (
      match.tournamentVisibility !== 'PUBLIC' ||
      ['DRAFT', 'PENDING_APPROVAL', 'SUSPENDED', 'CANCELLED', 'PENDING_DELETE', 'pending_delete'].includes(
        match.tournamentStatus,
      )
    ) {
      throw new NotFoundException('Trận đấu không tồn tại');
    }

    // Camera của sân xếp vào trận, trận nào xếp vào sân đó tự dùng.
    const courtCamera = match.courtId
      ? await this.livestreamRepository.findPullCameraByCourt(match.courtId, match.tournamentId)
      : null;

    const stream = this.normalizeStream(await this.livestreamRepository.findMatchLivestream(matchId));

    // Camera BTC gán TAY (khác camera của sân) là lựa chọn cụ thể nên nó thắng.
    // Riêng camera của sân thì phải rơi xuống nhánh sân bên dưới: nó được gán khi
    // xếp lịch với streamStatus IDLE, nếu ở lại đây sẽ chặn URL sân và làm trận
    // ONGOING mất video.
    const isManualCamera = Boolean(
      stream?.cameraId && stream.cameraName && stream.cameraId !== courtCamera?.id,
    );
    if (isManualCamera && stream) {
      const isLive = stream.streamStatus === 'LIVE';
      const playbackUrl = isLive ? this.normalizePublicPlaybackUrl(stream.playbackUrl) : null;

      return {
        matchId,
        streamStatus: stream.streamStatus,
        playbackUrl,
        cameraName: stream.cameraName,
        startedAt: stream.startedAt,
        endedAt: stream.endedAt,
      };
    }

    // Sân có URL KHÔNG có nghĩa là đang phát. Chỉ trận đã bắt đầu (ONGOING) mới
    // được trả playbackUrl, nếu không thì khán giả sẽ thấy video dù BTC chưa bấm
    // "Bắt đầu" — đúng triệu chứng "có URL nhưng màn hình đen/ảo" khó chẩn đoán.
    if (courtCamera?.playbackUrl && match.status === 'ONGOING') {
      const courtUrl = this.normalizePublicPlaybackUrl(courtCamera.playbackUrl);
      return {
        matchId,
        streamStatus: 'LIVE',
        playbackUrl: courtUrl,
        cameraName: courtCamera.name,
        startedAt: null,
        endedAt: null,
      };
    }

    return { matchId, streamStatus: 'OFFLINE', playbackUrl: null };
  }


}
