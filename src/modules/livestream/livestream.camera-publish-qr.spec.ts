import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AqvisionApiClient } from './aqvision-api.client';
import { AqvisionPublishService } from './aqvision-publish.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { LivestreamRepository } from './livestream.repository';
import type { AqvisionRecordingService } from './aqvision-recording.service';
import type { LivestreamHealthQueue } from './livestream-health.queue';
import { LivestreamService } from './livestream.service';

const owner: JwtPayload = {
  sub: 'owner-1',
  email: 'owner@example.com',
  role: 'USER',
  roles: [],
};

const stranger: JwtPayload = {
  sub: 'other-1',
  email: 'other@example.com',
  role: 'USER',
  roles: [],
};

const tournamentId = '11111111-1111-4111-8111-111111111111';

const pushCamera = {
  id: 'camera-push-1',
  tournamentId,
  courtId: null,
  name: 'Camera sân 1',
  mode: 'PUSH',
  protocol: 'RTMP',
  streamName: 'camera_abc',
  streamKey: 'must-not-leak',
  status: 'IDLE',
  playbackUrl: 'https://sporto.asia/hls/camera_abc/index.m3u8',
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  updatedAt: new Date('2026-10-01T00:00:00.000Z'),
};

const pullCamera = {
  ...pushCamera,
  id: 'camera-pull-1',
  mode: 'PULL',
  streamName: 'court_abc',
  playbackUrl: 'https://cdn.example/live/cam1.m3u8',
};

const PUSH_ENV: Record<string, string> = {
  AQVISION_PUSH_HOST: 'media.aqvision.net',
  AQVISION_PUSH_PORT: '18554',
  AQVISION_PUSH_RTMP_PORT: '11935',
  LIVESTREAM_RTMP_BASE_URL: 'rtmp://sporto.asia:1935/live',
  LIVESTREAM_SRT_BASE_URL: 'srt://sporto.asia:8890',
  LIVESTREAM_HLS_PUBLIC_BASE_URL: 'https://sporto.asia/hls',
};

function makeService(options: {
  camera?: unknown;
  env?: Record<string, string>;
  isStaff?: boolean;
  onRotate?: jest.Mock;
} = {}) {
  const camera = options.camera === undefined ? pushCamera : options.camera;
  const env = options.env ?? PUSH_ENV;
  const repo = {
    findTournamentById: jest
      .fn()
      .mockResolvedValue({ id: tournamentId, name: 'Giải', createdBy: owner.sub }),
    isTournamentStaff: jest.fn().mockResolvedValue(options.isStaff ?? false),
    findCameraById: jest.fn().mockResolvedValue(camera),
    updateCameraStreamIdentity:
      options.onRotate ??
      jest.fn(async (id: string, values: Record<string, string>) => ({
        ...pushCamera,
        id,
        ...values,
      })),
  };
  const service = new LivestreamService(
    repo as unknown as LivestreamRepository,
    { get: (key: string, fallback?: unknown) => env[key] ?? fallback } as unknown as ConfigService,
    new AqvisionPublishService({
      get: (key: string, fallback?: unknown) => env[key] ?? fallback,
    } as unknown as ConfigService),
    {} as AqvisionApiClient,
    {} as unknown as AqvisionRecordingService,
    {} as unknown as LivestreamHealthQueue,
  );
  return { repo, service };
}

/**
 * QR publish gửi cho AQP Camera Station. Payload phải là ĐÚNG 5 field của docx
 * §2.2 — app của AQP parse đúng shape đó, thêm field lạ là hỏng scanner.
 */
describe('LivestreamService camera publish QR', () => {
  it('trả QR 5 field + RTMP target, và KHÔNG lộ streamKey nội bộ', async () => {
    const { service } = makeService();

    const result = await service.buildCameraPublishQr('camera-push-1', owner, {
      publishKey: 'pub-secret-abc',
      matchTitle: 'Bán kết 1',
      autoStart: true,
    });

    expect(Object.keys(result.qrPayload)).toEqual([
      'stream_url',
      'match_id',
      'match_title',
      'protocol',
      'auto_start',
    ]);
    expect(result.qrPayload).toEqual({
      stream_url:
        'rtsp://media.aqvision.net:18554/live/camera_abc?key=pub-secret-abc',
      match_id: 'camera_abc',
      match_title: 'Bán kết 1',
      protocol: 'rtsp',
      auto_start: true,
    });
    expect(result.rtmp).toEqual({
      server: 'rtmp://media.aqvision.net:11935/live',
      streamKey: 'camera_abc?pub-secret-abc',
    });
    expect(JSON.parse(result.qrPayloadString)).toEqual(result.qrPayload);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('must-not-leak');
  });

  it('streamId trong request thắng streamName của camera', async () => {
    const { service } = makeService();

    const result = await service.buildCameraPublishQr('camera-push-1', owner, {
      publishKey: 'pub-secret-abc',
      streamId: 'cameraip',
    });

    expect(result.qrPayload.match_id).toBe('cameraip');
    expect(result.qrPayload.stream_url).toContain('/live/cameraip?key=');
  });

  it('camera PULL không có ingest ⇒ BadRequest, không dựng QR', async () => {
    const { service } = makeService({ camera: pullCamera });

    await expect(
      service.buildCameraPublishQr('camera-pull-1', owner, {
        publishKey: 'pub-secret-abc',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('người ngoài giải ⇒ Forbidden', async () => {
    const { service } = makeService();

    await expect(
      service.buildCameraPublishQr('camera-push-1', stranger, {
        publishKey: 'pub-secret-abc',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('chưa cấu hình host/port AQP ⇒ 503 Service Unavailable, không trả QR thiếu credential', async () => {
    const { service } = makeService({ env: {} });

    // Lỗi cấu hình phải là 503 kèm thông báo hành động được, KHÔNG phải 500
    // "lỗi hệ thống" — nếu không operator không biết phải set env nào.
    await expect(
      service.buildCameraPublishQr('camera-push-1', owner, {
        publishKey: 'pub-secret-abc',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('env TRỐNG như .env.example ⇒ vẫn fail-closed 503, KHÔNG sinh QR thiếu credential', async () => {
    // VPS copy nguyên dòng `AQVISION_PUSH_PORT=` từ .env.example, nên giá trị
    // đến service là chuỗi rỗng chứ không phải undefined. Chuỗi rỗng phải đi
    // xuống đúng đường fail-closed, không được lọt thành URL `rtmp://host:/live`.
    const { service } = makeService({
      env: {
        AQVISION_PUSH_HOST: 'media.aqvision.net',
        AQVISION_PUSH_PORT: '',
        AQVISION_PUSH_RTMP_PORT: '',
      },
    });

    await expect(
      service.buildCameraPublishQr('camera-push-1', owner, {
        publishKey: 'pub-secret-abc',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('thiếu env ⇒ thông báo nêu đúng tên biến môi trường, không lộ key', async () => {
    const { service } = makeService({ env: {} });

    await expect(
      service.buildCameraPublishQr('camera-push-1', owner, { publishKey: 'super-secret-key' }),
    ).rejects.toThrow(/AQVISION_PUSH_RTMP_PORT/);

    await expect(
      service.buildCameraPublishQr('camera-push-1', owner, { publishKey: 'super-secret-key' }),
    ).rejects.not.toThrow(/super-secret-key/);
  });
});

/**
 * Nút "Cấp lại stream key" của pipeline SportO. Lưu ý: đây là key NỘI BỘ
 * (cột `livestream_cameras`), KHÔNG phải publish_key của AQP — key AQP do AQP
 * cấp và rotate ở panel AQP.
 */
describe('LivestreamService rotate stream key', () => {
  it('sinh streamName/streamKey mới, giữ nguyên id và trả publish info mới', async () => {
    const { repo, service } = makeService();

    const result = await service.rotateCameraStreamKey('camera-push-1', owner);

    expect(repo.updateCameraStreamIdentity).toHaveBeenCalledTimes(1);
    const [id, values] = repo.updateCameraStreamIdentity.mock.calls[0];
    expect(id).toBe('camera-push-1');
    expect(values.streamName).toMatch(/^camera_[0-9a-f]{32}$/);
    expect(values.streamKey).toMatch(/^[0-9a-f]{32}$/);
    expect(values.playbackUrl).toBe(
      `https://media.aqvision.net/live/${values.streamName}/hls.m3u8`,
    );

    expect(result.id).toBe('camera-push-1');
    expect(result.streamName).toBe(values.streamName);
    expect(result.publish?.rtmpUrl).toBe(
      `rtmp://media.aqvision.net:11935/live/${values.streamName}`,
    );
    expect(result).not.toHaveProperty('streamKey');
  });

  it('tên mới sinh ra phải KHÁC tên cũ (không cấp lại chính key đang dùng)', async () => {
    const { repo, service } = makeService();

    await service.rotateCameraStreamKey('camera-push-1', owner);

    const [, values] = repo.updateCameraStreamIdentity.mock.calls[0];
    expect(values.streamName).not.toBe(pushCamera.streamName);
  });

  it('trùng unique index streamName ⇒ thử lại rồi mới thành công', async () => {
    const onRotate = jest
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('duplicate key value'), { code: '23505' }),
      )
      .mockImplementation(async (id: string, values: Record<string, string>) => ({
        ...pushCamera,
        id,
        ...values,
      }));
    const { repo, service } = makeService({ onRotate });

    const result = await service.rotateCameraStreamKey('camera-push-1', owner);

    expect(repo.updateCameraStreamIdentity).toHaveBeenCalledTimes(2);
    const first = repo.updateCameraStreamIdentity.mock.calls[0][1].streamName;
    const second = repo.updateCameraStreamIdentity.mock.calls[1][1].streamName;
    expect(second).not.toBe(first);
    expect(result.streamName).toBe(second);
  });

  it('camera PULL ⇒ BadRequest (không có ingest để cấp lại)', async () => {
    const { service } = makeService({ camera: pullCamera });

    await expect(
      service.rotateCameraStreamKey('camera-pull-1', owner),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('người ngoài giải ⇒ Forbidden', async () => {
    const { service } = makeService();

    await expect(
      service.rotateCameraStreamKey('camera-push-1', stranger),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
