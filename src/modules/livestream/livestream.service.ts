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
import { AssignCameraDto } from './dto/assign-camera.dto';
import { CreateCameraDto } from './dto/create-camera.dto';
import { PublishQrDto } from './dto/publish-qr.dto';
import { SetCourtPlaybackUrlDto } from './dto/set-court-playback-url.dto';
import {
  AqvisionPublishService,
  type PublishQrResult,
  type RtmpPublishTarget,
} from './aqvision-publish.service';
import { AqvisionApiClient, AqvisionApiException } from './aqvision-api.client';
import {
  LivestreamMode,
  LivestreamProtocol,
  LivestreamRepository,
} from './livestream.repository';

type MatchStreamControlStatus = 'IDLE' | 'LIVE' | 'OFFLINE' | 'ERROR' | null;

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

@Injectable()
export class LivestreamService {
  private readonly logger = new Logger(LivestreamService.name);

  constructor(
    private readonly livestreamRepository: LivestreamRepository,
    private readonly configService: ConfigService,
    private readonly aqvisionPublishService: AqvisionPublishService,
    private readonly aqvisionApiClient: AqvisionApiClient,
  ) {}

  private isAdmin(user: JwtPayload) {
    return user.role === 'ADMIN' || user.roles?.includes('ADMIN') === true;
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

  /**
   * Endpoint ĐẨY luồng của AQP — hạ tầng phát sóng DUY NHẤT.
   *
   * Không còn media server riêng của SportO: mọi camera đẩy thẳng vào AQP. Chưa
   * cấu hình host/cổng thì **ném 503 kèm tên biến env**, KHÔNG trả URL tạm —
   * BTC dán URL tạm vào OBS/điện thoại thì không ai xem được hình mà cũng không
   * biết vì sao.
   */
  private resolveAqvisionIngestServer(): string {
    const host = (
      this.configService.get<string>('AQVISION_PUSH_HOST') ?? ''
    ).trim();
    // Cổng RTMP tách khỏi cổng RTSP: panel AQP phát hai cổng riêng, không suy
    // cổng này từ cổng kia.
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
   * Bản không ném của `resolveAqvisionIngestServer` cho đường ĐỌC.
   *
   * Liệt kê camera không được phép thất bại chỉ vì chưa cấu hình env: khi đó
   * `ingest` là `null` và UI nói "chưa cấu hình", thay vì cả màn camera 500.
   */
  private tryAqvisionIngestServer(): string | null {
    try {
      return this.resolveAqvisionIngestServer();
    } catch {
      return null;
    }
  }

  /**
   * Cặp ingest để BTC nhập vào OBS / Camera Station: đích đẩy của AQP + tên
   * stream. Stream key xác thực do AQP cấp riêng (panel AQP) và đi kèm QR —
   * không phải thứ SportO sinh ra.
   */
  private buildPublishInfo(streamName: string) {
    const rtmpUrl = `${this.resolveAqvisionIngestServer()}/${streamName}`;

    return {
      protocol: 'RTMP' as const,
      streamName,
      url: rtmpUrl,
      rtmpUrl,
    };
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
  }) {
    return {
      id: camera.id,
      tournamentId: camera.tournamentId,
      name: camera.name,
      mode: camera.mode,
      courtId: camera.courtId,
      // Hàng cũ có thể mang `SRT` của media server đã bỏ; quy về RTMP khi đọc để
      // UI không nhận một lựa chọn không còn tồn tại.
      protocol: camera.protocol === 'SRT' ? 'RTMP' : camera.protocol,
      streamName: camera.streamName,
      status: camera.status,
      playbackUrl: camera.playbackUrl,
      // Endpoint đẩy của AQP. Tính từ config mỗi lần đọc nên UI không phải ghi
      // cứng host. `null` khi chưa cấu hình — liệt kê camera không được sập vì lý
      // do đó. Tên stream chính là phần cuối URL; stream key xác thực do AQP cấp.
      ingest:
        camera.mode === 'PULL' ? null : { rtmp: this.tryAqvisionIngestServer() },
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

    const playbackUrl = camera.playbackUrl ?? '';
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
        ? { ...normalized, playbackUrl: normalized.playbackUrl }
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
        playbackUrl!,
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
      playbackUrl: playbackUrl!,
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
    //  - CAMERA  : camera IP tại sân. SportO nhờ AQP kéo luồng về
    //              (`addStreamProxy`) rồi phát lại — không cần stream key.
    //  - PLAYBACK: luồng đã phát sẵn từ bên ngoài. BTC dán URL phát và hệ thống
    //              KHÔNG sinh lại, KHÔNG chuẩn hoá — mọi hình dạng đều giữ nguyên.
    //
    // Camera PUSH lấy hình từ thiết bị đẩy lên, nên `cameraRtspUrl` gửi kèm là
    // hiểu nhầm về luồng nghiệp vụ: bỏ qua im lặng sẽ khiến BTC tưởng đã nối
    // được camera trong khi thực tế hệ thống chưa hề kéo gì.
    if (mode !== 'PULL' && (data.cameraRtspUrl?.trim() ?? '').length > 0) {
      throw new BadRequestException(
        'URL camera chỉ dùng cho camera PULL. Camera PUSH nhận hình từ thiết bị đẩy lên.',
      );
    }

    const pullSource = mode === 'PULL' ? this.assertPullSource(data) : null;

    let playbackUrl: string;
    let pullProxyKey: string | null = null;

    if (pullSource?.kind === 'CAMERA') {
      const pulled = await this.startAqvisionPull({
        streamName,
        cameraUrl: pullSource.url,
      });
      pullProxyKey = pulled.proxyKey;
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
      playbackUrl: playbackUrl!,
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
      publish: mode === 'PULL' ? null : this.buildPublishInfo(streamName),
    };
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
   * Cấp lại danh tính stream của một camera PUSH (nút "Cấp lại stream key" của
   * pipeline SportO).
   *
   * PHẠM VI: đây là key NỘI BỘ trong `livestream_cameras`, dùng cho media
   * server của SportO. Publish key của AQP (panel AQP, dạng `<stream>?<key>`)
   * do AQP cấp và chỉ rotate được ở panel/AQP — endpoint này KHÔNG đụng tới nó.
   *
   * `streamName` có unique index nên lần ghi có thể trùng; thử lại với tên mới
   * thay vì để lỗi ràng buộc nổi lên thành 500.
   */
  async rotateCameraStreamKey(cameraId: string, user: JwtPayload) {
    const camera = await this.getPushCamera(cameraId, user);
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const streamName = `camera_${randomUUID().replace(/-/g, '')}`;
      const streamKey = randomUUID().replace(/-/g, '');
      try {
        const rotated = await this.livestreamRepository.updateCameraStreamIdentity(
          camera.id,
          { streamName, streamKey, playbackUrl: this.buildAqvisionHlsUrl(streamName) },
        );
        if (!rotated) {
          throw new NotFoundException('Camera không tồn tại');
        }
        return {
          ...this.toPublicCamera(rotated),
          publish: this.buildPublishInfo(rotated.streamName),
        };
      } catch (error) {
        const isLastAttempt = attempt === maxAttempts;
        if (!this.isUniqueViolation(error) || isLastAttempt) {
          throw error;
        }
      }
    }

    // Không thể tới đây: vòng lặp hoặc return, hoặc ném ở lần thử cuối.
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
  }): Promise<{ proxyKey: string | null }> {
    try {
      return await this.aqvisionApiClient.addStreamProxy({
        stream: input.streamName,
        url: input.cameraUrl,
      });
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
    await this.stopAqvisionPull(camera.pullProxyKey);
    const archived = await this.livestreamRepository.deleteCamera(cameraId);
    return archived ? this.toPublicCamera(archived) : null;
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
          courtCamera.playbackUrl ?? '',
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
      camera.playbackUrl ?? '',
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
      camera.playbackUrl ?? '',
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

  async startMatchStream(matchId: string, user: JwtPayload) {
    const match = await this.assertCanControlMatchStream(matchId, user);
    const stream = this.normalizeStream(await this.livestreamRepository.findMatchLivestream(matchId));

    if (!stream?.cameraId || !stream.streamKey) {
      throw new BadRequestException('Trận này chưa được BTC gán camera nên chưa thể bắt đầu livestream.');
    }

    if (!match.participant1Id || !match.participant2Id) {
      throw new BadRequestException('Trận chưa đủ hai đội nên chưa thể bắt đầu livestream.');
    }

    const playbackUrl = stream.cameraPlaybackUrl || this.buildAqvisionHlsUrl(stream.streamKey);
    const livestream = await this.livestreamRepository.updateStreamStatus(matchId, 'LIVE', user.sub, playbackUrl);

    return {
      livestream,
      // PULL: luồng đã phát sẵn từ URL của sân, không có URL ingest để BTC dán
      // vào OBS — trả null để không sinh ra link RTMP gây hiểu nhầm.
      publish:
        stream.cameraMode === 'PULL'
          ? null
          : this.buildPublishInfo(stream.streamName ?? stream.streamKey),
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
    //
    // Ghi OFFLINE, không phải IDLE: nhánh playback của sân đọc trạng thái này để
    // biết BTC đã bấm Dừng, nên nút Dừng mới thực sự tắt được hình của trận dùng
    // camera sân. IDLE là "chưa từng phát" — dùng nó ở đây sẽ khiến lần dừng đầu
    // tiên trông giống hệt trạng thái chưa bấm gì.
    return this.livestreamRepository.updateStreamStatus(matchId, 'OFFLINE', user.sub, null);
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
      const playbackUrl = isLive ? stream.playbackUrl : null;

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
      const courtUrl = courtCamera.playbackUrl;
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
