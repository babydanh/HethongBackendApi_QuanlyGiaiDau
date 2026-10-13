import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AssignCameraCourtDto } from './dto/assign-camera-court.dto';
import { AssignCameraDto } from './dto/assign-camera.dto';
import { CreateCameraDto } from './dto/create-camera.dto';
import { PublishQrDto } from './dto/publish-qr.dto';
import { SetCourtPlaybackUrlDto } from './dto/set-court-playback-url.dto';
import {
  AqvisionPublishService,
  type AqvisionQrPayload,
  type PublishQrResult,
  type RtmpPublishTarget,
} from './aqvision-publish.service';
import { AqvisionApiClient, AqvisionApiException } from './aqvision-api.client';
import {
  AqvisionAgencyApiClient,
  AqvisionAgencyApiException,
  type AqvisionAgencyDeleteResult,
  type AqvisionAgencyStreamKey,
} from './aqvision-agency-api.client';
import {
  AqvisionRecordingService,
  type RecordingStatus,
} from './aqvision-recording.service';
import {
  LivestreamHealthQueue,
  type CameraLeaseHandle,
} from './livestream-health.queue';
import { LivestreamCameraSourceCryptoService } from './livestream-camera-source-crypto.service';
import {
  LivestreamMode,
  LivestreamProtocol,
  LivestreamRepository,
} from './livestream.repository';

type MatchStreamControlStatus = 'IDLE' | 'LIVE' | 'OFFLINE' | 'ERROR' | null;
type AqpStreamKeyCamera = {
  readonly id: string;
  readonly name: string;
  readonly streamName: string;
  readonly aqpStreamKeyId: string | null;
};
type AqvisionAgencyStreamKeyWithPush = AqvisionAgencyStreamKey & {
  readonly push: NonNullable<AqvisionAgencyStreamKey['push']>;
};

export interface AqpCameraStreamKeyResponse {
  readonly camera: {
    readonly id: string;
    readonly name: string;
    readonly streamName: string;
  };
  readonly streamKeyId: string | null;
  readonly status: string | null;
  readonly qrPayload: AqvisionQrPayload | null;
  readonly qrPayloadString: string | null;
  readonly rtmp: { readonly server: string; readonly streamKey: string } | null;
}

// Only the statuses the toggle understands are published. `hasCamera` stays
// true so the client knows a camera is assigned even if a row carries a status
// this contract does not cover.
function isMatchStreamControlStatus(
  status: string | null | undefined,
): status is Exclude<MatchStreamControlStatus, null> {
  return (
    status === 'IDLE' || status === 'LIVE' || status === 'OFFLINE' || status === 'ERROR'
  );
}

const DAYS_IN_COMMON_YEAR = [
  31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
] as const;

function isValidRecordingPeriod(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!parts) return false;

  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  if (year < 1 || month < 1 || month > 12) return false;

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = DAYS_IN_COMMON_YEAR[month - 1] ?? 0;
  const maxDay = month === 2 && leapYear ? 29 : daysInMonth;
  return day >= 1 && day <= maxDay;
}

function isSafeRecordingFileName(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value === '' ||
    value === '.' ||
    value === '..' ||
    value.includes('/') ||
    value.includes('\\') ||
    /[<>:"|?*]/.test(value) ||
    !/\.mp4$/i.test(value)
  ) {
    return false;
  }

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return false;
  }

  return true;
}

@Injectable()
export class LivestreamService {
  private readonly logger = new Logger(LivestreamService.name);

  constructor(
    private readonly livestreamRepository: LivestreamRepository,
    private readonly configService: ConfigService,
    private readonly aqvisionPublishService: AqvisionPublishService,
    private readonly aqvisionApiClient: AqvisionApiClient,
    private readonly aqvisionRecordingService: AqvisionRecordingService,
    private readonly livestreamHealthQueue: LivestreamHealthQueue,
    private readonly cameraSourceCrypto: LivestreamCameraSourceCryptoService,
    private readonly aqvisionAgencyApiClient: AqvisionAgencyApiClient,
  ) {}

  private isAdmin(user: JwtPayload) {
    return user.role === 'ADMIN' || user.roles?.includes('ADMIN') === true;
  }

  // ---------------------------------------------------------------------------
  // Media server RIÊNG của SportO — ĐANG ẨN, KHÔNG DÙNG.
  //
  // Giữ lại nguyên code theo yêu cầu, nhưng không còn nằm trên đường phát sóng:
  // mọi camera giờ đi qua hạ tầng AQP. Bật lại thì phải cấu hình `LIVESTREAM_*`
  // và nối lại các hàm này vào `buildPublishInfo` / `buildPlaybackUrl`.
  // ---------------------------------------------------------------------------

  private getRtmpBaseUrl() {
    return this.configService.get<string>('LIVESTREAM_RTMP_BASE_URL') || 'rtmp://sporto.asia:1935/live';
  }

  private getSrtBaseUrl() {
    return this.configService.get<string>('LIVESTREAM_SRT_BASE_URL') || 'srt://localhost:8890';
  }

  private getHlsBaseUrl() {
    return this.configService.get<string>('LIVESTREAM_HLS_PUBLIC_BASE_URL') || 'https://sporto.asia/hls';
  }

  /** ẨN/KHÔNG DÙNG cho camera mới. Chỉ còn `normalizePublicPlaybackUrl` gọi để vá hàng cũ. */
  private buildPlaybackUrl(streamKey: string) {
    return `${this.getHlsBaseUrl().replace(/\/$/, '')}/${streamKey}/index.m3u8`;
  }

  /**
   * Đích ĐẨY luồng của AQP — đường phát sóng duy nhất đang dùng.
   *
   * Chưa cấu hình host/cổng thì ném 503 kèm tên biến env, KHÔNG trả URL tạm:
   * BTC dán URL tạm vào OBS/điện thoại thì không ai xem được hình mà cũng không
   * biết vì sao.
   */
  private resolveAqvisionIngestServer(): string {
    const host = (
      this.configService.get<string>('AQVISION_PUSH_HOST') ?? ''
    ).trim();
    // Cổng RTMP tách khỏi cổng RTSP: panel AQP phát hai cổng riêng.
    const rtmpPort = String(
      this.configService.get<string | number>('AQVISION_PUSH_RTMP_PORT') ?? '',
    ).trim();

    if (host.length === 0 || rtmpPort.length === 0) {
      throw new ServiceUnavailableException(
        'Chưa cấu hình máy chủ media AQP để đẩy luồng. ' +
          'Kiểm tra AQVISION_PUSH_HOST và AQVISION_PUSH_RTMP_PORT.',
      );
    }

    return `rtmp://${host}:${rtmpPort}/live`;
  }

  /**
   * Bản không ném của `resolveAqvisionIngestServer` cho đường ĐỌC: liệt kê camera
   * không được 503 chỉ vì chưa cấu hình env — khi đó trả chuỗi rỗng để UI nói
   * "chưa cấu hình".
   */
  private tryAqvisionIngestServer(): string {
    try {
      return this.resolveAqvisionIngestServer();
    } catch {
      return '';
    }
  }

  /**
   * URL phát của stream trên media server AQP — đúng định dạng docx §4.1:
   * `https://media.aqvision.net/live/{stream}/hls.m3u8`.
   *
   * Host tách khỏi `AQVISION_API_BASE_URL` vì API nằm trên host quản trị
   * (`api.media.aqvision.net`) còn luồng phát nằm trên host media; trộn hai host
   * sẽ trả về URL mà trình duyệt khán giả không xem được.
   */
  private buildAqvisionHlsUrl(streamName: string) {
    // `||` chứ không `??`: chuỗi rỗng nghĩa là "chưa cấu hình" (xem
    // `env.validation.ts`), không phải host rỗng.
    const baseUrl = (
      this.configService.get<string>('AQVISION_PLAYBACK_BASE_URL') ||
      'https://media.aqvision.net'
    ).replace(/\/+$/, '');

    return `${baseUrl}/live/${streamName}/hls.m3u8`;
  }

  private isAqvisionGeneratedHlsUrl(
    playbackUrl: string | null | undefined,
    streamName: string | null | undefined,
  ): boolean {
    if (!playbackUrl || !streamName) return false;

    try {
      return (
        new URL(playbackUrl).pathname ===
        new URL(this.buildAqvisionHlsUrl(streamName)).pathname
      );
    } catch {
      return false;
    }
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

  /** ẨN/KHÔNG DÙNG — ingest RTMP của media server riêng; RTMP giờ dựng từ AQP. */
  private buildIngestUrl(streamKey: string) {
    return `${this.getRtmpBaseUrl().replace(/\/$/, '')}/${streamKey}`;
  }

  // ENDED was used by the old stop flow. Replay is not supported yet, so it
  // must not permanently block a match or a newly assigned camera.
  // `OFFLINE` is the explicit "the organizer pressed Stop" marker and is kept:
  // it is what separates a match whose court feed was switched off from one that
  // was merely scheduled and never started.
  private normalizeStream<T extends { streamStatus?: string | null; endedAt?: Date | null; playbackUrl?: string | null }>(stream: T): T;
  private normalizeStream<T extends { streamStatus?: string | null; endedAt?: Date | null; playbackUrl?: string | null }>(stream: T | null | undefined): T | null;
  private normalizeStream<T extends { streamStatus?: string | null; endedAt?: Date | null; playbackUrl?: string | null }>(stream: T | null | undefined): T | null {
    if (!stream) return null;
    if (stream.streamStatus !== 'ENDED') return stream;
    // Legacy ENDED rows came from the old stop flow, so they map onto the same
    // explicit stopped marker the current stop writes.
    return {
      ...stream,
      streamStatus: 'OFFLINE',
      endedAt: null,
      playbackUrl: null,
    };
  }

  /** ẨN/KHÔNG DÙNG — SRT của media server riêng. AQP không nhận SRT. */
  private buildSrtUrl(streamName: string) {
    const baseUrl = this.getSrtBaseUrl();
    return `${baseUrl.replace(/\/$/, '')}?streamid=publish:${streamName}`;
  }

  /**
   * Cặp ingest cho OBS / Camera Station.
   *
   * Nhánh RTMP đi thẳng vào hạ tầng AQP — đây là đường đang dùng. Nhánh SRT giữ
   * nguyên code cũ nhưng KHÔNG dùng: AQP không nhận SRT và UI đã ẩn lựa chọn đó.
   */
  private buildPublishInfo(protocol: 'RTMP' | 'SRT', streamName: string) {
    const rtmpUrl = `${this.resolveAqvisionIngestServer()}/${streamName}`;
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

  /**
   * Bản chiếu công khai của một camera.
   *
   * `listCameras` và `createCamera` đọc cả hàng (`select()` không cột), nên trả
   * nguyên hàng sẽ đẩy `streamKey` và ba cột `*_encrypted` (RTSP URL, tài khoản,
   * mật khẩu) ra frontend — những cột mà `LivestreamCamera` không hề mô hình hoá.
   * Liệt kê cột tường minh để một cột nhạy cảm thêm sau này không tự động rò rỉ.
   */
  private toPublicCamera(camera: {
    id: string;
    tournamentId: string;
    name: string;
    mode: string;
    courtId: string | null;
    protocol: string;
    streamName: string;
    status: string;
    playbackUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
    aqpStreamKeyId?: string | null;
  }) {
    return {
      id: camera.id,
      tournamentId: camera.tournamentId,
      name: camera.name,
      mode: camera.mode,
      courtId: camera.courtId,
      protocol: camera.protocol,
      streamName: camera.streamName,
      status: camera.status,
      playbackUrl: this.normalizePublicPlaybackUrl(camera.playbackUrl),
      // Endpoint đẩy để BTC nhập vào OBS / Camera Station. RTMP giờ trỏ vào AQP
      // (hạ tầng đang dùng); `srt` vẫn là giá trị của media server riêng đang ẨN
      // — UI đã ẩn lựa chọn SRT nên trường này không được dùng.
      ingest:
        camera.mode === 'PULL'
          ? null
          : { rtmp: this.tryAqvisionIngestServer(), srt: this.getSrtBaseUrl() },
      hasAqpStreamKey: Boolean(camera.aqpStreamKeyId),
      createdAt: camera.createdAt,
      updatedAt: camera.updatedAt,
    };
  }

  async listCameras(tournamentId: string, user: JwtPayload) {
    await this.assertTournamentOperator(tournamentId, user);
    const cameras = await this.livestreamRepository.listCameras(tournamentId);
    return cameras.map((camera) => this.toPublicCamera(camera));
  }

  /**
   * Gán camera của sân cho những trận đã xếp ở sân đó nhưng chưa có camera.
   *
   * Thiếu bước này, BTC thêm camera sau khi lịch đã xếp sẽ thấy nút "Bắt đầu"
   * sáng lên (vì sân đã có camera) nhưng API từ chối vì trận chưa được gán camera.
   * Chỉ chạm các trận CHƯA có camera nên không ghi đè lựa chọn thủ công và không
   * đụng vào luồng đang chạy.
   */
  private async backfillCourtCameraAssignments(
    courtId: string,
    tournamentId: string,
    camera: { id: string; playbackUrl: string | null },
  ) {
    const matchIds = await this.livestreamRepository.listMatchIdsWithoutCameraOnCourt(
      courtId,
      tournamentId,
    );
    if (matchIds.length === 0) return;

    const playbackUrl = this.normalizePublicPlaybackUrl(camera.playbackUrl) ?? '';
    await Promise.all(
      matchIds.map((matchId) =>
        this.livestreamRepository.assignCameraToMatch(matchId, camera.id, playbackUrl),
      ),
    );
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
    const tournamentIdsUsingCourt =
      await this.livestreamRepository.findTournamentIdsUsingCourt(courtId);
    await this.assertCourtUsableByTournament(courtId, tournamentId, tournamentIdsUsingCourt);

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

    // Lịch có thể đã xếp trước khi sân được khai URL. Gán luôn cho các trận của
    // sân để chúng phát được ngay, thay vì bắt BTC bấm gán tay từng trận.
    await this.backfillCourtCameraAssignments(courtId, tournamentId, created);

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


    // PULL có hai nguồn loại trừ lẫn nhau:
    //  - CAMERA  : lưu URL nguồn đã mã hoá; chỉ tạo proxy khi trận bắt đầu.
    //  - PLAYBACK: giữ nguyên URL phát sẵn và không gọi AQP.
    //
    // Camera PUSH nhận hình từ thiết bị đẩy lên, không nhận URL nguồn camera.
    if (mode !== 'PULL' && (data.cameraRtspUrl?.trim() ?? '').length > 0) {
      throw new BadRequestException(
        'URL camera chỉ dùng cho camera PULL. Camera PUSH nhận hình từ thiết bị đẩy lên.',
      );
    }

    const pullSource = mode === 'PULL' ? this.assertPullSource(data) : null;

    let playbackUrl: string;
    let pullProxyKey: string | null = null;
    let rtspUrlEncrypted: string | null = null;

    if (pullSource?.kind === 'CAMERA') {
      rtspUrlEncrypted = this.cameraSourceCrypto.encrypt(pullSource.url);
      playbackUrl = this.buildAqvisionHlsUrl(streamName);
    } else if (pullSource?.kind === 'PLAYBACK') {
      playbackUrl = pullSource.url;
    } else {
      playbackUrl = this.buildAqvisionHlsUrl(streamName);
    }

    const camera = await this.livestreamRepository.createCamera({
      tournamentId,
      courtId,
      name: data.name.trim(),
      mode,
      protocol,
      streamName,
      streamKey,
      playbackUrl: this.normalizePublicPlaybackUrl(playbackUrl)!,
      rtspUrlEncrypted,
      pullProxyKey,
      createdBy: user.sub,
    });

    // Cùng lý do như `setCourtPlaybackUrl`: lịch có thể đã xếp trước khi camera
    // ra đời, nên gán ngay cho các trận của sân thay vì để nút "Bắt đầu" sáng
    // nhưng API từ chối.
    if (courtId) {
      await this.backfillCourtCameraAssignments(courtId, tournamentId, camera);
    }

    return {
      ...this.toPublicCamera(camera),
      // PULL không có URL ingest để BTC cấu hình ở OBS/Camera Station.
      publish: mode === 'PULL' ? null : this.buildPublishInfo(protocol, streamName),
    };
  }

  /**
   * Đổi sân của một camera PUSH (null = bỏ gán sân).
   *
   * - Trận CHƯA có camera ở sân đích tự dùng camera này (như lúc tạo camera).
   * - Trận CHƯA phát (IDLE) ở sân cũ đang trỏ camera này quay về camera còn lại của sân
   *   cũ, hoặc bỏ gán nếu sân cũ hết camera. Trận đã/đang phát và trận ở sân khác giữ
   *   nguyên liên kết: `match_livestreams` không phân biệt gán tay với gán theo sân, và
   *   gán lại sẽ xoá `startedAt`/`endedAt` của lịch sử phát.
   * - Camera đang phát một trận LIVE thì từ chối (409).
   * - Camera PULL không dùng đường này: sân của nó đi theo URL phát của sân.
   */
  async assignCameraCourt(cameraId: string, user: JwtPayload, data: AssignCameraCourtDto) {
    const camera = await this.livestreamRepository.findCameraById(cameraId);
    if (!camera) {
      throw new NotFoundException('Camera không tồn tại');
    }

    await this.assertTournamentOperator(camera.tournamentId, user);

    if (camera.mode !== 'PUSH') {
      throw new BadRequestException(
        'Chỉ camera PUSH đổi sân được; camera PULL đi theo URL phát của sân.',
      );
    }

    const courtId = data.courtId;
    if ((camera.courtId ?? null) === courtId) {
      return this.toPublicCamera(camera);
    }
    if (courtId) {
      await this.assertCourtUsableByTournament(courtId, camera.tournamentId);
    }

    const updated = await this.livestreamHealthQueue.runWithCameraLock(
      camera.id,
      async (lease) => {
        if (!lease.isOwned()) {
          throw new ServiceUnavailableException('Đã mất quyền xử lý camera.');
        }
        if (await this.livestreamRepository.hasLiveMatchOnCamera(camera.id)) {
          throw new ConflictException('Camera đang phát một trận; dừng phát trước khi đổi sân.');
        }
        if (!lease.isOwned()) {
          throw new ServiceUnavailableException('Đã mất quyền xử lý camera.');
        }

        const moved = await this.livestreamRepository.updateCameraCourt(camera.id, courtId);
        if (!moved) {
          throw new NotFoundException('Camera không tồn tại');
        }
        if (camera.courtId) {
          await this.releaseIdleCourtMatches(camera.id, camera.courtId, camera.tournamentId);
        }
        if (courtId) {
          await this.backfillCourtCameraAssignments(courtId, camera.tournamentId, moved);
        }
        return moved;
      },
    );
    if (!updated) {
      throw new ServiceUnavailableException('Camera đang được xử lý; thử lại sau.');
    }

    return this.toPublicCamera(updated);
  }

  /**
   * Sau khi camera rời sân, các trận CHƯA phát của sân đó đang trỏ nó chuyển sang camera
   * còn lại của sân (theo quy tắc `findActiveCameraByCourt`), hoặc bỏ gán nếu hết camera.
   */
  private async releaseIdleCourtMatches(
    cameraId: string,
    oldCourtId: string,
    tournamentId: string,
  ) {
    const matchIds = await this.livestreamRepository.listIdleMatchIdsUsingCameraOnCourt(
      cameraId,
      oldCourtId,
      tournamentId,
    );
    if (matchIds.length === 0) return;

    const remaining = await this.livestreamRepository.findActiveCameraByCourt(
      oldCourtId,
      tournamentId,
    );
    const playbackUrl = remaining
      ? (this.normalizePublicPlaybackUrl(remaining.playbackUrl) ?? '')
      : '';
    for (const matchId of matchIds) {
      if (remaining) {
        await this.livestreamRepository.assignCameraToMatch(matchId, remaining.id, playbackUrl);
      } else {
        await this.livestreamRepository.clearMatchCamera(matchId);
      }
    }
  }

  /**
   * Dựng QR publish để app Camera Station của AQP quét.
   *
   * Payload trả về là ĐÚNG 5 field của docx §2.2 — app AQP parse đúng shape đó.
   * Kèm theo là cặp RTMP (`server` + `streamKey`) để người vận hành nhập tay
   * vào OBS, vì panel AQP yêu cầu dán CẢ HAI ô.
   *
   * `publishKey` đến từ request (operator dán từ panel AQP cho đúng stream),
   * KHÔNG lấy từ env dùng chung và KHÔNG lưu lại: key AQP là per-stream, một
   * biến toàn cục sẽ cho phép một ảnh chụp màn hình đẩy luồng giả cho mọi giải.
   * INV-001: giá trị này không bao giờ được ghi log.
   */
  async buildCameraPublishQr(
    cameraId: string,
    user: JwtPayload,
    dto: PublishQrDto,
  ) {
    const camera = await this.getPushCamera(cameraId, user);
    const streamId = (dto.streamId?.trim() || camera.streamName).trim();

    const result = this.buildPublishQrOrFailClosed({
      streamId,
      matchTitle: dto.matchTitle?.trim() || camera.name,
      publishKey: dto.publishKey,
      autoStart: dto.autoStart ?? false,
    });

    return {
      camera: {
        id: camera.id,
        name: camera.name,
        streamName: camera.streamName,
        mode: camera.mode,
        protocol: camera.protocol,
      },
      ...result,
    };
  }

  /**
   * Keep the legacy response shape for older clients. AQP-linked cameras rotate
   * through Agency; unlinked cameras retain local identity rotation.
   */
  async rotateCameraStreamKey(cameraId: string, user: JwtPayload) {
    const camera = await this.getPushCamera(cameraId, user);
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const streamName = camera.aqpStreamKeyId
        ? camera.streamName
        : `camera_${randomUUID().replace(/-/g, '')}`;
      const streamKey = randomUUID().replace(/-/g, '');
      try {
        const result = await this.runWithAqpCameraAndStreamNameLocks(
          camera.id,
          streamName,
          async (lease) => {
            const current = await this.getPushCamera(cameraId, user);
            this.assertAqpLeaseOwned(lease);
            if (current.aqpStreamKeyId) {
              const rotated = await this.rotateLinkedAqpStreamKey(current, lease);
              return {
                collision: false as const,
                response: {
                  ...this.toPublicCamera({ ...current, aqpStreamKeyId: rotated.id }),
                  publish: {
                    ...this.buildPublishInfo(
                      current.protocol === 'SRT' ? 'SRT' : 'RTMP',
                      current.streamName,
                    ),
                    rtmpServer: rotated.push.rtmpServer,
                    streamKey: rotated.push.streamKey,
                  },
                },
              };
            }
            if (camera.aqpStreamKeyId) {
              throw new ServiceUnavailableException(
                'Camera vừa thay đổi trạng thái AQP; vui lòng thử lại.',
              );
            }
            const nameTaken = await this.livestreamRepository.isCameraStreamNameTaken(
              streamName,
              current.id,
            );
            this.assertAqpLeaseOwned(lease);
            if (nameTaken) return { collision: true as const };

            const rotated = await this.livestreamRepository.updateCameraStreamIdentity(
              current.id,
              { streamName, streamKey, playbackUrl: this.buildAqvisionHlsUrl(streamName) },
            );
            if (!rotated) throw new NotFoundException('Camera không tồn tại');
            this.assertAqpLeaseOwned(lease);
            return {
              collision: false as const,
              response: {
                ...this.toPublicCamera(rotated),
                publish: this.buildPublishInfo(
                  rotated.protocol === 'SRT' ? 'SRT' : 'RTMP',
                  rotated.streamName,
                ),
              },
            };
          },
        );
        if (result.collision) continue;
        return result.response;
      } catch (error) {
        const isLastAttempt = attempt === maxAttempts;
        if (!this.isUniqueViolation(error) || isLastAttempt) throw error;
      }
    }

    throw new ConflictException('Không cấp được stream key mới, vui lòng thử lại.');
  }

  /**
   * Bọc `buildPublishQrResult` để lỗi CẤU HÌNH thành 503 kèm tên biến môi
   * trường cần set. Nếu để `AqvisionApiException` nổi lên, exception filter chỉ
   * trả 500 "lỗi hệ thống" và operator không biết phải sửa gì.
   *
   * Thông báo KHÔNG chứa `publishKey` (INV-001) — chỉ tên biến env.
   */
  private buildPublishQrOrFailClosed(input: {
    readonly streamId: string;
    readonly matchTitle: string;
    readonly publishKey: string;
    readonly autoStart: boolean;
  }): PublishQrResult {
    try {
      return this.aqvisionPublishService.buildPublishQrResult(input);
    } catch (error) {
      if (error instanceof AqvisionApiException) {
        throw new ServiceUnavailableException(
          'Máy chủ media AQP chưa được cấu hình đầy đủ cho giải này. ' +
            'Kiểm tra AQVISION_PUSH_HOST, AQVISION_PUSH_PORT và AQVISION_PUSH_RTMP_PORT.',
        );
      }
      throw error;
    }
  }

  /**
   * Camera dùng được cho luồng đẩy: phải tồn tại, thuộc giải người gọi quản lý,
   * và ở mode PUSH (PULL do bên ngoài phát sẵn nên không có ingest để cấu hình).
   */
  private async getPushCamera(cameraId: string, user: JwtPayload) {
    const camera = await this.livestreamRepository.findCameraById(cameraId);
    if (!camera) {
      throw new NotFoundException('Camera không tồn tại');
    }
    await this.assertTournamentOperator(camera.tournamentId, user);
    if (camera.mode !== 'PUSH') {
      throw new BadRequestException(
        'Camera PULL không đẩy luồng lên nên không có stream key để cấp.',
      );
    }
    return camera;
  }

  async getCameraAqpStreamKey(cameraId: string, user: JwtPayload): Promise<AqpCameraStreamKeyResponse> {
    const camera = await this.getPushCamera(cameraId, user);
    const streamKeyId = camera.aqpStreamKeyId;
    if (!streamKeyId) return this.toAqpCameraStreamKeyResponse(camera, null);

    return this.runWithAqpCameraLock(camera.id, async (lease) => {
      let key: AqvisionAgencyStreamKey;
      try {
        key = await this.aqvisionAgencyApiClient.getStreamKey(streamKeyId);
      } catch (error) {
        if (error instanceof AqvisionAgencyApiException && error.httpStatus === 404) {
          await this.saveAqpStreamKeyId(camera.id, null, lease);
          return this.toAqpCameraStreamKeyResponse(camera, null);
        }
        throw this.toAqpServiceUnavailable(error);
      }
      this.assertAqpCameraKeyMatches(camera.streamName, key);
      this.assertAqpLeaseOwned(lease);
      return this.toAqpCameraStreamKeyResponse(camera, key);
    });
  }

  async createCameraAqpStreamKey(
    cameraId: string,
    user: JwtPayload,
  ): Promise<AqpCameraStreamKeyResponse> {
    const camera = await this.getPushCamera(cameraId, user);
    return this.runWithAqpCameraLock(camera.id, async (lease) => {
      const key = await this.ensureCameraAqpStreamKey(camera, lease);
      return this.toAqpCameraStreamKeyResponse(camera, key);
    });
  }

  async rotateCameraAqpStreamKey(
    cameraId: string,
    user: JwtPayload,
  ): Promise<AqpCameraStreamKeyResponse> {
    const camera = await this.getPushCamera(cameraId, user);
    return this.runWithAqpCameraLock(camera.id, async (lease) => {
      const current = await this.getPushCamera(cameraId, user);
      this.assertAqpLeaseOwned(lease);
      const rotated = await this.rotateLinkedAqpStreamKey(current, lease);
      return this.toAqpCameraStreamKeyResponse(current, rotated);
    });
  }

  private async rotateLinkedAqpStreamKey(
    camera: AqpStreamKeyCamera,
    lease: CameraLeaseHandle,
  ): Promise<AqvisionAgencyStreamKeyWithPush> {
    const current = await this.ensureCameraAqpStreamKey(camera, lease);
    this.assertAqpLeaseOwned(lease);
    const rotated = await this.aqvisionAgencyApiClient.rotateStreamKey(current.id);
    this.assertAqpLeaseOwned(lease);
    this.assertAqpCameraKeyMatches(camera.streamName, rotated);
    if (!rotated.push) {
      throw new ServiceUnavailableException('AQP chưa trả cấu hình RTMP mới.');
    }
    await this.saveAqpStreamKeyId(camera.id, rotated.id, lease);
    return rotated as AqvisionAgencyStreamKeyWithPush;
  }

  async renameCameraAqpStreamKey(
    cameraId: string,
    user: JwtPayload,
    requestedStreamName: string,
  ): Promise<AqpCameraStreamKeyResponse> {
    const camera = await this.getPushCamera(cameraId, user);
    const streamName = requestedStreamName.trim();
    if (!/^[A-Za-z0-9_-]{1,255}$/.test(streamName)) {
      throw new BadRequestException('Tên stream chỉ được gồm chữ, số, gạch dưới và gạch ngang.');
    }
    if (streamName === camera.streamName) return this.getCameraAqpStreamKey(camera.id, user);
    return this.runWithAqpCameraAndStreamNameLocks(camera.id, streamName, async (lease) => {
      if (await this.livestreamRepository.hasCameraRecordings(camera.id)) {
        throw new ConflictException('Không thể đổi tên stream sau khi camera đã có bản ghi.');
      }
      if (await this.livestreamRepository.isCameraStreamNameTaken(streamName, camera.id)) {
        throw new ConflictException('Tên stream này đã được camera khác sử dụng.');
      }

      let streamKeyId = camera.aqpStreamKeyId;
      if (streamKeyId) {
        const linkedStreamKeyId = streamKeyId;
        let current: AqvisionAgencyStreamKey | null;
        try {
          current = await this.aqvisionAgencyApiClient.getStreamKey(linkedStreamKeyId);
          this.assertAqpCameraKeyMatches(camera.streamName, current);
        } catch (error) {
          if (error instanceof AqvisionAgencyApiException && error.httpStatus === 404) {
            await this.saveAqpStreamKeyId(camera.id, null, lease);
            streamKeyId = null;
            current = null;
          } else {
            throw this.toAqpServiceUnavailable(error);
          }
        }

        if (current) {
          if (current.push) await this.revokeAqpProviderStreamKey(linkedStreamKeyId, lease);
          let renamed: AqvisionAgencyStreamKey;
          this.assertAqpLeaseOwned(lease);
          try {
            renamed = await this.aqvisionAgencyApiClient.updateStreamKey(
              linkedStreamKeyId,
              { stream: streamName },
              'PATCH',
            );
          } catch (error) {
            if (error instanceof AqvisionAgencyApiException && error.httpStatus === 409) {
              throw new ConflictException('AQP không cho đổi tên stream có bản ghi.');
            }
            if (!(error instanceof AqvisionAgencyApiException) || !error.mayHaveApplied) {
              throw this.toAqpServiceUnavailable(error);
            }
            try {
              renamed = await this.aqvisionAgencyApiClient.getStreamKey(linkedStreamKeyId);
            } catch (reconcileError) {
              throw this.toAqpServiceUnavailable(reconcileError);
            }
            if (renamed.stream !== streamName) {
              throw new ServiceUnavailableException(
                'Chưa xác định được kết quả đổi tên trên AQP; tải lại trước khi thử tiếp.',
              );
            }
          }
          this.assertAqpCameraKeyMatches(streamName, renamed);
          if (renamed.push) {
            throw new ServiceUnavailableException('AQP chưa giữ key ở trạng thái thu hồi sau đổi tên.');
          }
        }
      }

      this.assertAqpLeaseOwned(lease);
      const playbackUrl = this.buildAqvisionHlsUrl(streamName);
      const updated = await this.livestreamRepository.updateCameraStreamName(
        camera.id,
        streamName,
        playbackUrl,
      );
      if (!updated) throw new NotFoundException('Camera không tồn tại');
      const renamedCamera = { ...camera, streamName };
      if (!streamKeyId) return this.toAqpCameraStreamKeyResponse(renamedCamera, null);

      const key = await this.ensureCameraAqpStreamKey(
        { ...renamedCamera, aqpStreamKeyId: streamKeyId },
        lease,
      );
      return this.toAqpCameraStreamKeyResponse(renamedCamera, key);
    });
  }

  async revokeCameraAqpStreamKey(cameraId: string, user: JwtPayload) {
    const camera = await this.getPushCamera(cameraId, user);
    const streamKeyId = camera.aqpStreamKeyId;
    if (!streamKeyId) {
      return { cameraId: camera.id, keyRevoked: false, disconnected: true };
    }

    return this.runWithAqpCameraLock(camera.id, async (lease) => {
      const result = await this.revokeAqpProviderStreamKey(streamKeyId, lease);
      return { cameraId: camera.id, ...result };
    });
  }

  private async ensureCameraAqpStreamKey(
    camera: AqpStreamKeyCamera,
    lease: CameraLeaseHandle,
  ): Promise<AqvisionAgencyStreamKey> {
    let existingId = camera.aqpStreamKeyId;
    if (existingId) {
      try {
        const current = await this.aqvisionAgencyApiClient.getStreamKey(existingId);
        this.assertAqpCameraKeyMatches(camera.streamName, current);
        this.assertAqpLeaseOwned(lease);
        if (current.push) return current;
      } catch (error) {
        if (!(error instanceof AqvisionAgencyApiException) || error.httpStatus !== 404) {
          throw this.toAqpServiceUnavailable(error);
        }
        await this.saveAqpStreamKeyId(camera.id, null, lease);
        existingId = null;
      }
    }

    if (!existingId) {
      const discovered = await this.findAqpStreamKey(camera.streamName);
      this.assertAqpLeaseOwned(lease);
      if (discovered?.push) {
        await this.saveAqpStreamKeyId(camera.id, discovered.id, lease);
        return discovered;
      }
      if (discovered) existingId = discovered.id;
    }

    this.assertAqpLeaseOwned(lease);
    let key: AqvisionAgencyStreamKey;
    try {
      key = await this.aqvisionAgencyApiClient.createStreamKey({
        app: 'live',
        stream: camera.streamName,
      });
    } catch (error) {
      if (
        !(error instanceof AqvisionAgencyApiException) ||
        (error.httpStatus !== 409 && !error.mayHaveApplied)
      ) {
        throw this.toAqpServiceUnavailable(error);
      }
      key = await this.reconcileAqpStreamKey(camera.streamName);
    }

    this.assertAqpCameraKeyMatches(camera.streamName, key);
    if (!key.push) {
      throw new ServiceUnavailableException('AQP chưa trả cấu hình RTMP cho stream key.');
    }
    await this.saveAqpStreamKeyId(camera.id, key.id, lease);
    return key;
  }

  private async findAqpStreamKey(streamName: string): Promise<AqvisionAgencyStreamKey | null> {
    try {
      const keys = await this.aqvisionAgencyApiClient.listStreamKeys();
      const existing = keys.find((key) => key.app === 'live' && key.stream === streamName);
      return existing ? await this.aqvisionAgencyApiClient.getStreamKey(existing.id) : null;
    } catch (error) {
      throw this.toAqpServiceUnavailable(error);
    }
  }

  private async reconcileAqpStreamKey(streamName: string): Promise<AqvisionAgencyStreamKey> {
    const existing = await this.findAqpStreamKey(streamName);
    if (!existing) {
      throw new ServiceUnavailableException(
        'AQP chưa xác nhận kết quả tạo stream key; tải lại trước khi thử lại.',
      );
    }
    return existing;
  }

  private async saveAqpStreamKeyId(
    cameraId: string,
    streamKeyId: string | null,
    lease: CameraLeaseHandle,
  ): Promise<void> {
    this.assertAqpLeaseOwned(lease);
    const saved = await this.livestreamRepository.setAqpStreamKeyId(cameraId, streamKeyId);
    if (!saved) throw new NotFoundException('Camera không tồn tại');
    this.assertAqpLeaseOwned(lease);
  }
  private async revokeAqpProviderStreamKey(
    streamKeyId: string,
    lease: CameraLeaseHandle,
  ): Promise<AqvisionAgencyDeleteResult> {
    const deleteKey = async (): Promise<AqvisionAgencyDeleteResult> => {
      try {
        return await this.aqvisionAgencyApiClient.deleteStreamKey(streamKeyId);
      } catch (error) {
        if (error instanceof AqvisionAgencyApiException && error.httpStatus === 404) {
          return { keyRevoked: true, disconnected: true };
        }
        throw this.toAqpServiceUnavailable(error);
      }
    };
    this.assertAqpLeaseOwned(lease);
    let result = await deleteKey();
    if (result.keyRevoked && !result.disconnected) {
      this.assertAqpLeaseOwned(lease);
      result = await deleteKey();
    }
    if (!result.keyRevoked || !result.disconnected) {
      throw new ServiceUnavailableException(
        'AQP chưa xác nhận đã thu hồi key và ngắt publisher; key vẫn được liên kết để thử lại.',
      );
    }
    this.assertAqpLeaseOwned(lease);
    return result;
  }



  private async runWithAqpCameraAndStreamNameLocks<T>(
    cameraId: string,
    streamName: string,
    operation: (lease: CameraLeaseHandle) => Promise<T>,
  ): Promise<T> {
    return this.runWithAqpStreamNameLock(cameraId, streamName, (nameLease) =>
      this.runWithAqpCameraLock(cameraId, (cameraLease) =>
        operation({
          cameraId,
          isOwned: () => nameLease.isOwned() && cameraLease.isOwned(),
        }),
      ),
    );
  }
  private async runWithAqpCameraLock<T>(
    cameraId: string,
    operation: (lease: CameraLeaseHandle) => Promise<T>,
  ): Promise<T> {
    const result = await this.livestreamHealthQueue.runWithCameraLock(cameraId, operation);
    if (result === null) {
      throw new ServiceUnavailableException('Camera đang được xử lý; vui lòng thử lại.');
    }
    return result;
  }

  private async runWithAqpStreamNameLock<T>(
    cameraId: string,
    streamName: string,
    operation: (lease: CameraLeaseHandle) => Promise<T>,
  ): Promise<T> {
    const result = await this.livestreamHealthQueue.runWithStreamNameLock(
      cameraId,
      streamName,
      operation,
    );
    if (result === null) {
      throw new ServiceUnavailableException('Tên stream đang được xử lý; vui lòng thử lại.');
    }
    return result;
  }

  private assertAqpLeaseOwned(lease: CameraLeaseHandle): void {
    if (!lease.isOwned()) {
      throw new ServiceUnavailableException('Đã mất quyền xử lý camera.');
    }
  }

  private assertAqpCameraKeyMatches(
    streamName: string,
    key: AqvisionAgencyStreamKey,
  ): void {
    if (key.app !== 'live' || key.stream !== streamName) {
      throw new ServiceUnavailableException('Stream key AQP không khớp với camera.');
    }
  }

  private toAqpCameraStreamKeyResponse(
    camera: AqpStreamKeyCamera,
    key: AqvisionAgencyStreamKey | null,
  ): AqpCameraStreamKeyResponse {
    const push = key?.push ?? null;
    let qrPayload: AqpCameraStreamKeyResponse['qrPayload'] = null;
    let qrPayloadString: string | null = null;
    let rtmp: AqpCameraStreamKeyResponse['rtmp'] = null;

    if (push) {
      const server = push.rtmpServer.replace(/\/+$/, '');
      const streamKey = push.streamKey.replace(/^\/+/, '');
      let url: URL;
      try {
        url = new URL(`${server}/${streamKey}`);
      } catch {
        throw new ServiceUnavailableException('AQP trả về URL RTMP không hợp lệ.');
      }
      if (url.protocol !== 'rtmp:' || url.username || url.password || url.hash) {
        throw new ServiceUnavailableException('AQP trả về URL RTMP không hợp lệ.');
      }
      // QR dạng RTSP theo docx §2.2 (host/cổng RTSP lấy từ env, khác cổng RTMP).
      // OBS nhập tay vẫn dùng cặp RTMP server/stream key bên dưới.
      qrPayload = this.buildAqpRtspQrPayload({
        stream: url.pathname.split('/').filter(Boolean).pop() ?? '',
        publishKey: url.searchParams.get('key') ?? '',
        matchTitle: camera.name,
      });
      qrPayloadString = JSON.stringify(qrPayload);
      rtmp = { server: push.rtmpServer, streamKey: push.streamKey };
    }

    return {
      camera: { id: camera.id, name: camera.name, streamName: camera.streamName },
      streamKeyId: key?.id ?? null,
      status: key?.status ?? null,
      qrPayload,
      qrPayloadString,
      rtmp,
    };
  }

  private buildAqpRtspQrPayload(input: {
    readonly stream: string;
    readonly publishKey: string;
    readonly matchTitle: string;
  }): AqvisionQrPayload {
    if (!input.stream || !input.publishKey) {
      throw new ServiceUnavailableException('AQP trả về stream key không có publish key.');
    }
    try {
      return this.aqvisionPublishService.buildQrPayloadFromConfig({
        matchId: input.stream,
        matchTitle: input.matchTitle,
        publishKey: input.publishKey,
        autoStart: false,
      });
    } catch (error) {
      if (error instanceof AqvisionApiException) {
        // Lỗi cấu hình: chỉ nêu tên biến env, không đưa publish key vào thông báo.
        throw new ServiceUnavailableException(
          'Chưa cấu hình máy chủ media AQP để dựng QR RTSP. ' +
            'Kiểm tra AQVISION_PUSH_HOST và AQVISION_PUSH_PORT.',
        );
      }
      throw error;
    }
  }

  private toAqpServiceUnavailable(error: unknown): ServiceUnavailableException {
    if (error instanceof ServiceUnavailableException) return error;
    if (error instanceof AqvisionAgencyApiException) {
      return new ServiceUnavailableException(error.message);
    }
    return new ServiceUnavailableException('Agency API hiện không khả dụng.');
  }

  /** Vi phạm unique index của Postgres (SQLSTATE 23505). */
  private isUniqueViolation(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('code' in error)) {
      return false;
    }
    return error.code === '23505';
  }

  /**
   * Sân phải thuộc địa điểm mà giải này dùng — qua cả venue mặc định lẫn venue
   * theo vòng — nếu không thì khai URL cho sân của giải khác sẽ lọt vào đây.
   */
  private async assertCourtUsableByTournament(
    courtId: string,
    tournamentId: string,
    precomputedTournamentIds?: string[],
  ) {
    const tournamentIds =
      precomputedTournamentIds ??
      (await this.livestreamRepository.findTournamentIdsUsingCourt(courtId));
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

  /**
   * Nguồn của camera PULL. Hai nguồn LOẠI TRỪ lẫn nhau: gửi cả hai (hoặc không
   * gửi gì) là lỗi cấu hình của người gọi, không được chọn ngầm một cái.
   */
  private assertPullSource(
    data: CreateCameraDto,
  ): { kind: 'CAMERA'; url: string } | { kind: 'PLAYBACK'; url: string } {
    const cameraUrl = data.cameraRtspUrl?.trim() ?? '';
    const playbackUrl = data.playbackUrl?.trim() ?? '';

    if (cameraUrl.length > 0 && playbackUrl.length > 0) {
      throw new BadRequestException(
        'Chỉ chọn một nguồn cho camera PULL: URL camera hoặc URL phát sẵn.',
      );
    }

    if (cameraUrl.length > 0) {
      return { kind: 'CAMERA', url: this.assertPullCameraUrl(cameraUrl) };
    }

    if (playbackUrl.length > 0) {
      return { kind: 'PLAYBACK', url: this.assertPullPlaybackUrl(playbackUrl) };
    }

    throw new BadRequestException(
      'Chế độ PULL cần URL camera (rtsp://...) hoặc URL phát trực tiếp (https://...).',
    );
  }

  /**
   * Nguồn camera phải dùng giao thức mà media server KÉO được. `https://` bị từ
   * chối vì đó là URL PHÁT cho khán giả, không phải nguồn — nhầm hai thứ này sẽ
   * đẩy URL trình phát vào lệnh kéo luồng.
   */
  private assertPullCameraUrl(cameraUrl: string) {
    let parsed: URL;
    try {
      parsed = new URL(cameraUrl);
    } catch {
      throw new BadRequestException('URL camera không hợp lệ.');
    }

    if (!['rtsp:', 'rtsps:', 'rtmp:'].includes(parsed.protocol)) {
      throw new BadRequestException(
        'URL camera phải là rtsp:// hoặc rtmp:// của camera.',
      );
    }

    return cameraUrl;
  }

  /**
   * Nhờ AQP kéo luồng từ camera. Lỗi của AQP đổi thành 503 kèm tên biến môi
   * trường cần set, giống `buildPublishQrOrFailClosed`: để nguyên
   * `AqvisionApiException` thì exception filter chỉ trả 500 và BTC không biết
   * phải sửa gì.
   *
   * KHÔNG log `cameraUrl` — địa chỉ đó chứa tài khoản/mật khẩu của camera.
   */
  private async startAqvisionPull(input: {
    readonly streamName: string;
    readonly cameraUrl: string;
  }): Promise<{ proxyKey: string }> {
    try {
      const result = await this.aqvisionApiClient.addStreamProxy({
        stream: input.streamName,
        url: input.cameraUrl,
        enableHls: true,
        enableMp4: true,
      });
      if (!result.proxyKey) {
        throw new ServiceUnavailableException(
          'Máy chủ media AQP chưa trả khoá proxy cho camera.',
        );
      }
      return { proxyKey: result.proxyKey };
    } catch (error) {
      if (error instanceof AqvisionApiException) {
        throw new ServiceUnavailableException(
          'Chưa nhờ được máy chủ media AQP kéo luồng từ camera. ' +
            'Kiểm tra AQVISION_API_SECRET và địa chỉ camera.',
        );
      }
      throw error;
    }
  }

  private async ensureAqvisionPullProxy(
    input: {
      readonly cameraId: string;
      readonly streamName: string;
      readonly pullProxyKey: string | null;
      readonly rtspUrlEncrypted: string | null;
    },
    lease: CameraLeaseHandle,
  ): Promise<void> {
    if (input.pullProxyKey) return;
    if (!input.rtspUrlEncrypted) {
      throw new ServiceUnavailableException(
        'Nguồn camera PULL chưa được lưu an toàn; cần cấu hình lại camera.',
      );
    }
    if (!lease.isOwned()) {
      throw new ServiceUnavailableException('Đã mất quyền xử lý camera.');
    }

    const cameraUrl = this.cameraSourceCrypto.decrypt(input.rtspUrlEncrypted);
    const { proxyKey } = await this.startAqvisionPull({
      streamName: input.streamName,
      cameraUrl,
    });
    if (!lease.isOwned()) {
      throw new ServiceUnavailableException('Đã mất quyền xử lý camera.');
    }

    const persisted = await this.livestreamRepository.updateCameraPullProxyKey(
      input.cameraId,
      proxyKey,
    );
    if (!persisted || !lease.isOwned()) {
      throw new ServiceUnavailableException(
        'Không thể lưu khoá proxy camera trước khi bắt đầu livestream.',
      );
    }
  }

  /**
   * Ngắt proxy kéo luồng trên AQP.
   *
   * Cố ý KHÔNG chặn việc xoá camera khi AQP lỗi hoặc chưa cấu hình: camera phải
   * xoá được kể cả khi media server sập. Proxy sót lại chỉ là một luồng thừa bên
   * AQP, không phải dữ liệu sai bên mình — đổi lại là một dòng cảnh báo.
   *
   * Không log khoá proxy: nó là định danh nội bộ của AQP, không phải thông tin
   * cần cho người vận hành.
   */
  private async stopAqvisionPull(pullProxyKey: string | null | undefined) {
    if (!pullProxyKey) return;

    try {
      await this.aqvisionApiClient.delStreamProxy(pullProxyKey);
    } catch (error) {
      this.logger.warn(
        `Không ngắt được proxy AQP khi xoá camera (code ${
          error instanceof AqvisionApiException ? error.providerCode : 'unknown'
        }).`,
      );
    }
  }

  /**
   * Trạng thái phát của một camera, đọc TRỰC TIẾP từ media server.
   *
   * `isMediaOnline` trả lời đúng câu "sân này đã có hình chưa" thay vì suy đoán
   * từ cột `status` trong DB — cột đó chỉ biết việc BTC đã bấm gì, không biết
   * luồng có thật sự lên hay không.
   */
  async getCameraLiveStatus(cameraId: string, user: JwtPayload) {
    const camera = await this.livestreamRepository.findCameraById(cameraId);
    if (!camera) {
      throw new NotFoundException('Camera không tồn tại');
    }

    await this.assertTournamentOperator(camera.tournamentId, user);

    let online: boolean;
    try {
      ({ online } = await this.aqvisionApiClient.isMediaOnline(camera.streamName));
    } catch (error) {
      if (error instanceof AqvisionApiException) {
        throw new ServiceUnavailableException(
          'Không đọc được trạng thái phát từ máy chủ media AQP. ' +
            'Kiểm tra AQVISION_API_SECRET.',
        );
      }
      throw error;
    }

    const status = online ? 'LIVE' : 'IDLE';
    if (camera.status !== status && camera.status !== 'ARCHIVED') {
      await this.livestreamRepository.updateCameraStatus(camera.id, status);
    }

    return {
      cameraId: camera.id,
      streamName: camera.streamName,
      online,
      status: camera.status === 'ARCHIVED' ? camera.status : status,
    };
  }

  async deleteCamera(cameraId: string, user: JwtPayload) {
    const camera = await this.livestreamRepository.findCameraById(cameraId);
    if (!camera) {
      throw new NotFoundException('Camera không tồn tại');
    }

    await this.assertTournamentOperator(camera.tournamentId, user);
    const result = await this.livestreamHealthQueue.runWithCameraLock(
      camera.id,
      async (lease) => {
        if (!lease.isOwned()) {
          throw new ServiceUnavailableException('Đã mất quyền xử lý camera.');
        }
        await this.stopAqvisionPull(camera.pullProxyKey);
        if (!lease.isOwned()) {
          throw new ServiceUnavailableException('Đã mất quyền xử lý camera.');
        }
        if (camera.aqpStreamKeyId) {
          await this.revokeAqpProviderStreamKey(camera.aqpStreamKeyId, lease);
        }

        const archived = await this.livestreamRepository.deleteCamera(cameraId);
        if (!lease.isOwned()) {
          throw new ServiceUnavailableException('Đã mất quyền xử lý camera.');
        }
        return { archived };
      },
    );
    if (!result) {
      throw new ServiceUnavailableException('Camera đang được xử lý; thử lại sau.');
    }

    return result.archived ? this.toPublicCamera(result.archived) : null;
  }

  async assignCamera(matchId: string, user: JwtPayload, data: AssignCameraDto) {
    const match = await this.livestreamRepository.findMatchWithTournament(matchId);
    if (!match) {
      throw new NotFoundException('Trận đấu không tồn tại');
    }

    await this.assertTournamentOperator(match.tournamentId, user);

    // Gửi null nghĩa là "bỏ gán tay": trận quay về camera của sân. Nếu sân
    // không có camera thì trận trở lại chưa gán, đúng như lúc chưa chọn gì.
    if (data.cameraId === null) {
      const courtCamera = match.courtId
        ? await this.livestreamRepository.findActiveCameraByCourt(match.courtId, match.tournamentId)
        : null;
      if (courtCamera) {
        return this.livestreamRepository.assignCameraToMatch(
          matchId,
          courtCamera.id,
          this.normalizePublicPlaybackUrl(courtCamera.playbackUrl) ?? '',
        );
      }
      return this.livestreamRepository.clearMatchCamera(matchId);
    }

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

    const camera = await this.livestreamRepository.findActiveCameraByCourt(courtId, tournamentId);
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

  async getMatchStreamControlState(
    matchId: string,
    user: JwtPayload,
  ): Promise<{
    matchId: string;
    hasCamera: boolean;
    streamStatus: MatchStreamControlStatus;
  }> {
    await this.assertCanControlMatchStream(matchId, user);
    const stream = this.normalizeStream(await this.livestreamRepository.findMatchLivestream(matchId));
    const hasCamera = Boolean(stream?.cameraId);
    const status = stream?.streamStatus;
    const streamStatus = hasCamera && isMatchStreamControlStatus(status) ? status : null;

    return { matchId, hasCamera, streamStatus };
  }

  async listMatchRecordingDays(
    matchId: string,
    user: JwtPayload,
  ): Promise<string[]> {
    const streamName = await this.getRecordingStreamName(matchId, user);
    try {
      const days = await this.aqvisionRecordingService.listRecordDays(
        streamName,
      );
      if (!Array.isArray(days)) return [];

      return [...new Set(days.filter(isValidRecordingPeriod))].sort((a, b) =>
        a < b ? 1 : a > b ? -1 : 0,
      );
    } catch (error) {
      throw this.toRecordingCatalogError(error);
    }
  }

  async listMatchRecordings(
    matchId: string,
    period: string,
    user: JwtPayload,
  ): Promise<{ name: string; sizeBytes?: number }[]> {
    const streamName = await this.getRecordingStreamName(matchId, user);
    if (!isValidRecordingPeriod(period)) {
      throw new BadRequestException('Ngày ghi MP4 không hợp lệ.');
    }

    try {
      const files = await this.aqvisionRecordingService.listRecordFiles(
        streamName,
        period,
      );
      if (!Array.isArray(files)) return [];

      return files.flatMap((file) => {
        if (!file || !isSafeRecordingFileName(file.name)) return [];
        return typeof file.sizeBytes === 'number' &&
          Number.isSafeInteger(file.sizeBytes) &&
          file.sizeBytes >= 0
          ? [{ name: file.name, sizeBytes: file.sizeBytes }]
          : [{ name: file.name }];
      });
    } catch (error) {
      throw this.toRecordingCatalogError(error);
    }
  }

  /**
   * Lỗi gọi AQP khi đọc danh mục bản ghi → 503 CHUNG, kèm mã chẩn đoán thuộc một
   * tập đóng để BTC/vận hành biết lỗi thuộc nhóm nào mà không cần log VPS.
   * TUYỆT ĐỐI không đưa message của provider vào phản hồi vì nó có thể chứa
   * credential/rootPath; chỉ có nhóm và một con số.
   *
   * Nhóm được quyết định bởi NGUỒN lỗi (`AqvisionApiException.source`), KHÔNG bởi
   * con số, vì cùng một số có thể đến từ nhiều chỗ (provider `code:404` khác HTTP
   * 404; thiếu secret cục bộ khác `code:-100` do provider trả):
   * - `config`: `AQP_NOT_CONFIGURED`. Chưa gọi AQP lần nào.
   * - `http`: `AQP_HTTP`; `providerCode` là HTTP status.
   * - `transport`: `AQP_UNREACHABLE`. Không có phản hồi sau các lần thử.
   * - không có nguồn và `providerCode === -100`: `AQP_AUTH`; AQP trả `code:-100`.
   * - còn lại: `AQP_REJECTED`; envelope khác của AQP hoặc phản hồi không đọc được
   *   (kể cả `-1`, vì client dùng `-1` cho cả thất bại chung lẫn thân không phải JSON).
   */
  private toRecordingCatalogError(error: unknown): unknown {
    if (!(error instanceof AqvisionApiException)) return error;

    const { providerCode, source } = error;
    const code =
      source === 'config'
        ? 'AQP_NOT_CONFIGURED'
        : source === 'http'
          ? 'AQP_HTTP'
          : source === 'transport'
            ? 'AQP_UNREACHABLE'
            : providerCode === -100
              ? 'AQP_AUTH'
              : 'AQP_REJECTED';

    return new ServiceUnavailableException({
      code,
      message: 'Không thể tải danh sách bản ghi MP4.',
      providerCode,
    });
  }

  private async getRecordingStreamName(
    matchId: string,
    user: JwtPayload,
  ): Promise<string> {
    await this.assertCanControlMatchStream(matchId, user);
    const stream = this.normalizeStream(
      await this.livestreamRepository.findMatchLivestream(matchId),
    );
    if (!stream?.cameraId || !stream.streamName?.trim()) {
      throw new NotFoundException('Trận này chưa có camera livestream.');
    }
    return stream.streamName;
  }

  async startMatchStream(matchId: string, user: JwtPayload) {
    const match = await this.assertCanControlMatchStream(matchId, user);
    const stream = this.normalizeStream(
      await this.livestreamRepository.findMatchLivestream(matchId),
    );

    if (!stream?.cameraId || !stream.streamKey) {
      throw new BadRequestException('Trận này chưa được BTC gán camera nên chưa thể bắt đầu livestream.');
    }

    if (!match.participant1Id || !match.participant2Id) {
      throw new BadRequestException('Trận chưa đủ hai đội nên chưa thể bắt đầu livestream.');
    }

    const cameraId = stream.cameraId;
    const cameraStreamName = stream.streamName?.trim() || null;

    const hasEncryptedCameraSource = Boolean(stream.cameraRtspUrlEncrypted?.trim());
    const hasPullProxy = Boolean(stream.cameraPullProxyKey?.trim());
    const isAqvisionCameraPull =
      stream.cameraMode === 'PULL' &&
      (hasEncryptedCameraSource || hasPullProxy);
    if (
      stream.cameraMode === 'PULL' &&
      !hasEncryptedCameraSource &&
      !hasPullProxy &&
      this.isAqvisionGeneratedHlsUrl(
        stream.cameraPlaybackUrl,
        stream.streamName,
      )
    ) {
      throw new ServiceUnavailableException(
        'Nguồn camera PULL chưa được lưu an toàn; cần cấu hình lại camera.',
      );
    }
    if (isAqvisionCameraPull && !cameraStreamName) {
      throw new ServiceUnavailableException(
        'Camera PULL chưa có tên luồng hợp lệ để khởi tạo proxy.',
      );
    }

    const aqvisionStreamName = cameraStreamName ?? stream.streamKey;

    const requestedPlaybackUrl = isAqvisionCameraPull
      ? this.buildAqvisionHlsUrl(aqvisionStreamName)
      : stream.cameraMode === 'PULL'
        ? stream.cameraPlaybackUrl
        : stream.cameraPlaybackUrl || this.buildAqvisionHlsUrl(stream.streamKey);
    const playbackUrl = this.normalizePublicPlaybackUrl(requestedPlaybackUrl);
    if (!playbackUrl) {
      throw new BadRequestException('Camera chưa có URL phát hợp lệ.');
    }

    let livestream;
    if (isAqvisionCameraPull) {
      const started = await this.livestreamHealthQueue.runWithCameraLock(
        cameraId,
        async (lease) => {
          if (!lease.isOwned()) {
            throw new ServiceUnavailableException('Đã mất quyền xử lý camera.');
          }
          await this.ensureAqvisionPullProxy(
            {
              cameraId,
              streamName: aqvisionStreamName,
              pullProxyKey: stream.cameraPullProxyKey,
              rtspUrlEncrypted: stream.cameraRtspUrlEncrypted,
            },
            lease,
          );
          if (!lease.isOwned()) {
            throw new ServiceUnavailableException('Đã mất quyền xử lý camera.');
          }

          const updated = await this.livestreamRepository.updateStreamStatus(
            matchId,
            'LIVE',
            user.sub,
            playbackUrl,
            cameraId,
          );
          if (!lease.isOwned()) {
            throw new ServiceUnavailableException('Đã mất quyền xử lý camera.');
          }
          if (!updated) {
            throw new ServiceUnavailableException(
              'Camera của trận đã thay đổi trong lúc bắt đầu livestream; vui lòng thử lại.',
            );
          }
          return updated;
        },
      );
      if (!started) {
        throw new ServiceUnavailableException(
          'Camera đang được xử lý; chưa thể bắt đầu livestream.',
        );
      }
      livestream = started;
    } else {
      livestream = await this.livestreamRepository.updateStreamStatus(
        matchId,
        'LIVE',
        user.sub,
        playbackUrl,
        cameraId,
      );
      if (!livestream) {
        throw new ServiceUnavailableException(
          'Camera của trận đã thay đổi trong lúc bắt đầu livestream; vui lòng thử lại.',
        );
      }
    }

    const recordingStatus = await this.reconcileCameraRecording(cameraId);
    const protocol = stream.cameraProtocol === 'SRT' ? 'SRT' : 'RTMP';

    return {
      livestream,
      // PULL: không có URL ingest để BTC cấu hình ở OBS.
      publish:
        stream.cameraMode === 'PULL'
          ? null
          : this.buildPublishInfo(protocol, stream.streamName ?? stream.streamKey),
      playbackUrl,
      recordingStatus,
    };
  }

  async stopMatchStream(matchId: string, user: JwtPayload) {
    await this.assertCanControlMatchStream(matchId, user);
    const stream = this.normalizeStream(await this.livestreamRepository.findMatchLivestream(matchId));

    if (!stream?.cameraId) {
      throw new BadRequestException('Trận này chưa được gán camera.');
    }

    // Stopping a broadcast is reversible. Recording/replay is a separate feature.
    //
    // Ghi OFFLINE, không phải IDLE: nhánh playback của sân đọc trạng thái này để
    // biết BTC đã bấm Dừng, nên nút Dừng mới thực sự tắt được hình của trận dùng
    // camera sân. IDLE là "chưa từng phát" — dùng nó ở đây sẽ khiến lần dừng đầu
    // tiên trông giống hệt trạng thái chưa bấm gì.
    const livestream = await this.livestreamRepository.updateStreamStatus(
      matchId,
      'OFFLINE',
      user.sub,
      null,
    );
    const recordingStatus = await this.reconcileCameraRecording(stream.cameraId);

    return { ...(livestream ?? {}), recordingStatus };
  }

  private async reconcileCameraRecording(
    cameraId: string,
  ): Promise<RecordingStatus> {
    try {
      const status = await this.livestreamHealthQueue.runWithCameraLock(
        cameraId,
        (lease) => this.aqvisionRecordingService.reconcileCamera(cameraId, lease),
      );
      return status ?? 'PENDING';
    } catch {
      this.logger.warn(
        `Camera recording reconciliation failed: camera=${cameraId}`,
      );
      return 'PENDING';
    }
  }

  async getStandaloneMatchPlayback(
    matchId: string,
    user?: JwtPayload,
  ) {
    const match = await this.livestreamRepository.findStandaloneMatchPlayback(
      matchId,
      user?.sub,
    );
    if (!match) return null;

    const isAdmin =
      user?.role === 'ADMIN' || user?.roles?.includes('ADMIN') === true;
    if (
      match.communityVisibility !== 'PUBLIC' &&
      !isAdmin &&
      match.memberStatus !== 'JOINED'
    ) {
      throw new NotFoundException('Trận đấu không tồn tại');
    }

    if (match.status !== 'ONGOING' || !match.playbackUrl) {
      return { matchId, streamStatus: 'OFFLINE', playbackUrl: null };
    }
    return {
      matchId,
      streamStatus: 'LIVE',
      playbackUrl: match.playbackUrl,
      cameraName: match.cameraName,
      startedAt: match.startedAt,
      endedAt: null,
    };
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
      ? await this.livestreamRepository.findActiveCameraByCourt(match.courtId, match.tournamentId)
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
    //
    // Trạng thái trận một mình không đủ để tắt hình: nếu BTC đã bấm Dừng (OFFLINE)
    // thì dừng phải thắng, kể cả khi trận vẫn ONGOING. Không có điều kiện này, nút
    // Dừng không có tác dụng gì với trận dùng camera sân.
    const isStoppedByOperator = stream?.streamStatus === 'OFFLINE';
    if (courtCamera?.playbackUrl && match.status === 'ONGOING' && !isStoppedByOperator) {
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
