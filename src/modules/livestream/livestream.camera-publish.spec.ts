import type { ConfigService } from '@nestjs/config';
import { AqvisionApiClient } from './aqvision-api.client';
import { AqvisionPublishService } from './aqvision-publish.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { LivestreamRepository } from './livestream.repository';
import type { AqvisionRecordingService } from './aqvision-recording.service';
import type { LivestreamHealthQueue } from './livestream-health.queue';
import type { LivestreamCameraSourceCryptoService } from './livestream-camera-source-crypto.service';
import { LivestreamService } from './livestream.service';

type RepositoryMock = {
  findTournamentById: jest.Mock;
  isTournamentStaff: jest.Mock;
  createCamera: jest.Mock;
};

const owner: JwtPayload = {
  sub: 'owner-1',
  email: 'owner@example.com',
  role: 'USER',
  roles: [],
};

const tournamentId = '11111111-1111-4111-8111-111111111111';

/**
 * BTC needs an ingest URL and stream key to configure OBS. That pair only exists
 * for a PUSH camera, so a PULL camera must never hand one back — otherwise the
 * organizer sees a stream key for a path nothing is publishing to.
 */
describe('LivestreamService camera publish info', () => {
  function makeService() {
    const repository: RepositoryMock = {
      findTournamentById: jest
        .fn()
        .mockResolvedValue({ id: tournamentId, createdBy: owner.sub }),
      isTournamentStaff: jest.fn().mockResolvedValue(false),
      createCamera: jest.fn(async (input) => ({ id: 'camera-1', ...input })),
    };
    const configService = {
      // Không override gì khác: mặc định của service vẫn dùng. Riêng đích đẩy
      // nằm ở env AQP nên phải cấp đủ để không rơi vào nhánh fail-closed.
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'AQVISION_PUSH_HOST') return 'media.aqvision.net';
        if (key === 'AQVISION_PUSH_RTMP_PORT') return 11935;
        return fallback;
      }),
    } as unknown as ConfigService;
    const service = new LivestreamService(
      repository as unknown as LivestreamRepository,
      configService,
      {} as AqvisionPublishService,
      {} as AqvisionApiClient,
      {} as unknown as AqvisionRecordingService,
      {} as unknown as LivestreamHealthQueue,
      {} as LivestreamCameraSourceCryptoService,
    );
    return { repository, service };
  }

  it('returns no publish info when BTC pastes an https m3u8 URL', async () => {
    const { service } = makeService();

    const created = await service.createCamera(tournamentId, owner, {
      name: 'Sân 1',
      mode: 'PULL',
      playbackUrl: 'https://media.example.com/hls/cam1/index.m3u8',
    });

    expect(created.publish).toBeNull();
    expect(created.playbackUrl).toBe(
      'https://media.example.com/hls/cam1/index.m3u8',
    );
  });

  it('returns an RTMP ingest URL and stream key for a PUSH camera', async () => {
    const { service } = makeService();

    const created = await service.createCamera(tournamentId, owner, {
      name: 'OBS chính',
      mode: 'PUSH',
      protocol: 'RTMP',
    });

    expect(created.publish).not.toBeNull();
    expect(created.publish?.protocol).toBe('RTMP');
    expect(created.publish?.url).toBe(
      `rtmp://media.aqvision.net:11935/live/${created.publish?.streamName}`,
    );
    // Phần cuối URL đẩy là tên stream; publish key xác thực do AQP cấp, SportO
    // không sinh ra nó.
    expect(created.publish?.rtmpUrl.split('/').pop()).toBe(
      created.publish?.streamName,
    );

    // Camera PUSH lưu URL phát trên host media của AQP, nên khi được gán cho trận
    // thì trận phát đúng thứ thiết bị đẩy lên.
    expect(created.playbackUrl).toBe(
      `https://media.aqvision.net/live/${created.publish?.streamName}/hls.m3u8`,
    );
  });
});

/**
 * A court can now serve a PUSH camera, not just PULL. The auto-assign and the
 * playback lookup both read the court camera through a lookup that ignores the
 * mode, so a match dropped on that court must pick it up.
 */
describe('LivestreamService court camera assignment', () => {
  const match = {
    id: 'match-1',
    tournamentId: 'tournament-1',
    courtId: 'court-1',
    tournamentVisibility: 'PUBLIC',
    tournamentStatus: 'REGISTRATION_CLOSED',
  };

  function makeCourtService(pushCamera: { id: string; playbackUrl: string } | null) {
    const repository = {
      findTournamentById: jest
        .fn()
        .mockResolvedValue({ id: 'tournament-1', createdBy: owner.sub }),
      isTournamentStaff: jest.fn().mockResolvedValue(false),
      findMatchWithTournament: jest.fn().mockResolvedValue(match),
      findActiveCameraByCourt: jest.fn().mockResolvedValue(pushCamera),
      findMatchLivestream: jest.fn().mockResolvedValue(null),
      assignCameraToMatch: jest.fn(async (matchId, cameraId, playbackUrl) => ({
        matchId,
        cameraId,
        playbackUrl,
      })),
      clearMatchCamera: jest.fn(async (matchId) => ({ matchId, cameraId: null })),
    };
    const service = new LivestreamService(
      repository as unknown as LivestreamRepository,
      { get: jest.fn(() => undefined) } as unknown as ConfigService,
      {} as AqvisionPublishService,
      {} as AqvisionApiClient,
      {} as unknown as AqvisionRecordingService,
      {} as unknown as LivestreamHealthQueue,
      {} as LivestreamCameraSourceCryptoService,
    );
    return { repository, service };
  }

  it('assigns the court PUSH camera to every match dropped on that court', async () => {
    const { repository, service } = makeCourtService({
      id: 'camera-push-1',
      playbackUrl: 'https://sporto.asia/hls/camera-push-1/index.m3u8',
    });

    await service.autoAssignCourtCamera('match-1', 'tournament-1', 'court-1', {
      courtChanged: true,
    });

    expect(repository.findActiveCameraByCourt).toHaveBeenCalledWith(
      'court-1',
      'tournament-1',
    );
    expect(repository.assignCameraToMatch).toHaveBeenCalledWith(
      'match-1',
      'camera-push-1',
      'https://sporto.asia/hls/camera-push-1/index.m3u8',
    );
  });

  it('sends a match back to its court camera when the manual one is removed', async () => {
    const { repository, service } = makeCourtService({
      id: 'camera-push-1',
      playbackUrl: 'https://sporto.asia/hls/camera-push-1/index.m3u8',
    });

    await service.assignCamera('match-1', owner, { cameraId: null });

    expect(repository.assignCameraToMatch).toHaveBeenCalledWith(
      'match-1',
      'camera-push-1',
      'https://sporto.asia/hls/camera-push-1/index.m3u8',
    );
    expect(repository.clearMatchCamera).not.toHaveBeenCalled();
  });

  it('clears the camera when the court has none to fall back to', async () => {
    const { repository, service } = makeCourtService(null);

    await service.assignCamera('match-1', owner, { cameraId: null });

    expect(repository.clearMatchCamera).toHaveBeenCalledWith('match-1');
    expect(repository.assignCameraToMatch).not.toHaveBeenCalled();
  });
});