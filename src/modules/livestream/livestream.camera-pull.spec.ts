import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AqvisionApiClient, AqvisionApiException } from './aqvision-api.client';
import { AqvisionPublishService } from './aqvision-publish.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { LivestreamRepository } from './livestream.repository';
import type { AqvisionRecordingService } from './aqvision-recording.service';
import type { LivestreamHealthQueue } from './livestream-health.queue';
import { LivestreamService } from './livestream.service';

type RepositoryMock = {
  findTournamentById: jest.Mock;
  isTournamentStaff: jest.Mock;
  createCamera: jest.Mock;
  findCameraById: jest.Mock;
  deleteCamera: jest.Mock;
  updateCameraStatus: jest.Mock;
};

type AqvisionClientMock = {
  addStreamProxy: jest.Mock;
  delStreamProxy: jest.Mock;
  isMediaOnline: jest.Mock;
};

const owner: JwtPayload = {
  sub: 'owner-1',
  email: 'owner@example.com',
  role: 'USER',
  roles: [],
};

const tournamentId = '11111111-1111-4111-8111-111111111111';
const cameraId = '22222222-2222-4222-8222-222222222222';
const CAMERA_RTSP =
  'rtsp://admin:matkhau@192.168.1.50:554/Streaming/Channels/101';
const PROXY_KEY = 'rtsp/__defaultVhost__/live/camera_x/proxy-1';

function archivedCameraRow(overrides: Record<string, unknown> = {}) {
  return {
    id: cameraId,
    tournamentId,
    name: 'Sân 1',
    mode: 'PULL',
    courtId: null,
    protocol: 'RTMP',
    streamName: 'camera_x',
    status: 'ARCHIVED',
    playbackUrl: null,
    pullProxyKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Camera PULL có nguồn là camera IP tại sân phải nhờ AQP KÉO luồng: SportO lưu
 * khoá proxy để còn ngắt được, và URL phát trả về khán giả phải đúng định dạng
 * HLS của docx §4.1. Khác hẳn nguồn PULL "dán URL phát sẵn", nơi SportO không
 * được đụng vào URL và không được gọi AQP.
 */
describe('LivestreamService camera PULL', () => {
  function makeService(
    overrides: Partial<RepositoryMock> = {},
    configOverrides: Record<string, string> = {},
  ) {
    const repository: RepositoryMock = {
      findTournamentById: jest
        .fn()
        .mockResolvedValue({ id: tournamentId, createdBy: owner.sub }),
      isTournamentStaff: jest.fn().mockResolvedValue(false),
      createCamera: jest.fn(async (input) => ({ id: cameraId, ...input })),
      findCameraById: jest.fn().mockResolvedValue(null),
      deleteCamera: jest.fn().mockResolvedValue(archivedCameraRow()),
      updateCameraStatus: jest
        .fn()
        .mockImplementation(async (id: string, status: string) => ({ id, status })),
      ...overrides,
    };

    const config: Record<string, string> = {
      AQVISION_PLAYBACK_BASE_URL: 'https://media.aqvision.net',
      ...configOverrides,
    };
    const configService = {
      get: (key: string, fallback?: unknown) => config[key] ?? fallback,
    } as unknown as ConfigService;

    const aqvisionApiClient: AqvisionClientMock = {
      addStreamProxy: jest.fn(),
      delStreamProxy: jest.fn(),
      isMediaOnline: jest.fn(),
    };

    const service = new LivestreamService(
      repository as unknown as LivestreamRepository,
      configService,
      {} as AqvisionPublishService,
      aqvisionApiClient as unknown as AqvisionApiClient,
      {} as unknown as AqvisionRecordingService,
      {} as unknown as LivestreamHealthQueue,
    );

    return { repository, service, aqvisionApiClient };
  }

  it('kéo luồng từ camera qua AQP, lưu khoá proxy và trả URL phát HLS', async () => {
    const { repository, service, aqvisionApiClient } = makeService();
    aqvisionApiClient.addStreamProxy.mockResolvedValue({ proxyKey: PROXY_KEY });

    const created = await service.createCamera(tournamentId, owner, {
      name: 'Sân 1',
      mode: 'PULL',
      cameraRtspUrl: CAMERA_RTSP,
    });

    expect(aqvisionApiClient.addStreamProxy).toHaveBeenCalledTimes(1);
    const request = aqvisionApiClient.addStreamProxy.mock.calls[0][0];
    expect(request.url).toBe(CAMERA_RTSP);
    expect(request.stream).toBe(created.streamName);

    expect(repository.createCamera.mock.calls[0][0].pullProxyKey).toBe(
      PROXY_KEY,
    );
    expect(created.playbackUrl).toBe(
      `https://media.aqvision.net/live/${created.streamName}/hls.m3u8`,
    );
    // PULL không có ingest để BTC nhập vào OBS.
    expect(created.publish).toBeNull();
  });

  it('không gọi AQP và giữ nguyên URL khi BTC dán URL phát sẵn', async () => {
    const { repository, service, aqvisionApiClient } = makeService();

    const created = await service.createCamera(tournamentId, owner, {
      name: 'Sân 2',
      mode: 'PULL',
      playbackUrl: 'https://media.aqvision.net/live/cam2/hls.m3u8',
    });

    expect(aqvisionApiClient.addStreamProxy).not.toHaveBeenCalled();
    expect(repository.createCamera.mock.calls[0][0].pullProxyKey).toBeNull();
    expect(created.playbackUrl).toBe(
      'https://media.aqvision.net/live/cam2/hls.m3u8',
    );
  });

  it('từ chối khi gửi cả hai nguồn', async () => {
    const { service, aqvisionApiClient } = makeService();

    await expect(
      service.createCamera(tournamentId, owner, {
        name: 'Sân 3',
        mode: 'PULL',
        cameraRtspUrl: CAMERA_RTSP,
        playbackUrl: 'https://media.aqvision.net/live/cam3/hls.m3u8',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(aqvisionApiClient.addStreamProxy).not.toHaveBeenCalled();
  });

  it('từ chối khi PULL không có nguồn nào', async () => {
    const { service } = makeService();

    await expect(
      service.createCamera(tournamentId, owner, {
        name: 'Sân 4',
        mode: 'PULL',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('từ chối URL https vì đó là URL phát, không phải nguồn camera', async () => {
    const { service, aqvisionApiClient } = makeService();

    await expect(
      service.createCamera(tournamentId, owner, {
        name: 'Sân 5',
        mode: 'PULL',
        cameraRtspUrl: 'https://media.aqvision.net/live/cam5/hls.m3u8',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(aqvisionApiClient.addStreamProxy).not.toHaveBeenCalled();
  });

  it('đổi lỗi AQP thành 503 khi không nhờ được kéo luồng', async () => {
    const { repository, service, aqvisionApiClient } = makeService();
    aqvisionApiClient.addStreamProxy.mockRejectedValue(
      new AqvisionApiException(-100, 'secret sai'),
    );

    await expect(
      service.createCamera(tournamentId, owner, {
        name: 'Sân 6',
        mode: 'PULL',
        cameraRtspUrl: CAMERA_RTSP,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    // Không được ghi camera khi luồng chưa thật sự được kéo.
    expect(repository.createCamera).not.toHaveBeenCalled();
  });

  it('dùng host mặc định khi env phát bị khai rỗng', async () => {
    // `docker-compose` không dùng `env_file`: một dòng `AQVISION_PLAYBACK_BASE_URL=`
    // copy lên VPS sẽ tới container dưới dạng chuỗi rỗng. Rỗng phải nghĩa là
    // "chưa cấu hình", KHÔNG được sinh URL `//live/...` mà trình duyệt không mở được.
    const { service, aqvisionApiClient } = makeService(
      {},
      { AQVISION_PLAYBACK_BASE_URL: '' },
    );
    aqvisionApiClient.addStreamProxy.mockResolvedValue({ proxyKey: PROXY_KEY });

    const created = await service.createCamera(tournamentId, owner, {
      name: 'Sân 7',
      mode: 'PULL',
      cameraRtspUrl: CAMERA_RTSP,
    });

    expect(created.playbackUrl).toBe(
      `https://media.aqvision.net/live/${created.streamName}/hls.m3u8`,
    );
  });

  it('tôn trọng host phát khi được cấu hình', async () => {
    const { service, aqvisionApiClient } = makeService(
      {},
      { AQVISION_PLAYBACK_BASE_URL: 'https://cdn.example.com/' },
    );
    aqvisionApiClient.addStreamProxy.mockResolvedValue({ proxyKey: PROXY_KEY });

    const created = await service.createCamera(tournamentId, owner, {
      name: 'Sân 8',
      mode: 'PULL',
      cameraRtspUrl: CAMERA_RTSP,
    });

    expect(created.playbackUrl).toBe(
      `https://cdn.example.com/live/${created.streamName}/hls.m3u8`,
    );
  });

  it('từ chối URL camera ở camera PUSH', async () => {
    const { service, aqvisionApiClient } = makeService();

    await expect(
      service.createCamera(tournamentId, owner, {
        name: 'Sân 9',
        mode: 'PUSH',
        cameraRtspUrl: CAMERA_RTSP,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(aqvisionApiClient.addStreamProxy).not.toHaveBeenCalled();
  });

  it('ngắt proxy AQP khi xoá camera có khoá proxy', async () => {
    const { service, aqvisionApiClient } = makeService({
      findCameraById: jest
        .fn()
        .mockResolvedValue(archivedCameraRow({ status: 'IDLE', pullProxyKey: PROXY_KEY })),
    });
    aqvisionApiClient.delStreamProxy.mockResolvedValue(undefined);

    await service.deleteCamera(cameraId, owner);

    expect(aqvisionApiClient.delStreamProxy).toHaveBeenCalledWith(PROXY_KEY);
  });

  it('vẫn lưu trữ camera khi AQP lỗi lúc ngắt proxy', async () => {
    const { service, aqvisionApiClient } = makeService({
      findCameraById: jest
        .fn()
        .mockResolvedValue(archivedCameraRow({ status: 'IDLE', pullProxyKey: PROXY_KEY })),
    });
    aqvisionApiClient.delStreamProxy.mockRejectedValue(
      new AqvisionApiException(-1, 'AQP không khả dụng'),
    );

    await expect(service.deleteCamera(cameraId, owner)).resolves.not.toThrow();
  });

  it('không gọi ngắt proxy với camera không có proxy', async () => {
    const { service, aqvisionApiClient } = makeService({
      findCameraById: jest.fn().mockResolvedValue(archivedCameraRow()),
    });

    await service.deleteCamera(cameraId, owner);

    expect(aqvisionApiClient.delStreamProxy).not.toHaveBeenCalled();
  });

  it('đọc trạng thái phát thật và đồng bộ cột status', async () => {
    const { service, repository, aqvisionApiClient } = makeService({
      findCameraById: jest
        .fn()
        .mockResolvedValue(archivedCameraRow({ status: 'IDLE' })),
    });
    aqvisionApiClient.isMediaOnline.mockResolvedValue({ online: true });

    const status = await service.getCameraLiveStatus(cameraId, owner);

    expect(aqvisionApiClient.isMediaOnline).toHaveBeenCalledWith('camera_x');
    expect(status).toEqual({
      cameraId,
      streamName: 'camera_x',
      online: true,
      status: 'LIVE',
    });
    expect(repository.updateCameraStatus).toHaveBeenCalledWith(cameraId, 'LIVE');
  });

  it('trả IDLE khi luồng chưa lên', async () => {
    const { service, aqvisionApiClient } = makeService({
      findCameraById: jest
        .fn()
        .mockResolvedValue(archivedCameraRow({ status: 'LIVE' })),
    });
    aqvisionApiClient.isMediaOnline.mockResolvedValue({ online: false });

    const status = await service.getCameraLiveStatus(cameraId, owner);

    expect(status.online).toBe(false);
    expect(status.status).toBe('IDLE');
  });

  it('không đổi status của camera đã lưu trữ', async () => {
    const { service, repository, aqvisionApiClient } = makeService({
      findCameraById: jest
        .fn()
        .mockResolvedValue(archivedCameraRow({ status: 'ARCHIVED' })),
    });
    aqvisionApiClient.isMediaOnline.mockResolvedValue({ online: true });

    const status = await service.getCameraLiveStatus(cameraId, owner);

    expect(status.status).toBe('ARCHIVED');
    expect(repository.updateCameraStatus).not.toHaveBeenCalled();
  });

  it('đổi lỗi AQP thành 503 khi không đọc được trạng thái', async () => {
    const { service, aqvisionApiClient } = makeService({
      findCameraById: jest
        .fn()
        .mockResolvedValue(archivedCameraRow({ status: 'IDLE' })),
    });
    aqvisionApiClient.isMediaOnline.mockRejectedValue(
      new AqvisionApiException(-100, 'secret sai'),
    );

    await expect(
      service.getCameraLiveStatus(cameraId, owner),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
