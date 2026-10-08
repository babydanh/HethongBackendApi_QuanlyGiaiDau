import type { ConfigService } from '@nestjs/config';
import { AqvisionApiClient } from './aqvision-api.client';
import { AqvisionPublishService } from './aqvision-publish.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { LivestreamRepository } from './livestream.repository';
import { LivestreamService } from './livestream.service';

const owner: JwtPayload = {
  sub: 'owner-1',
  email: 'owner@example.com',
  role: 'USER',
  roles: [],
};

const tournamentId = '11111111-1111-4111-8111-111111111111';
const courtId = '22222222-2222-4222-8222-222222222222';

function makeService(overrides: Record<string, unknown> = {}) {
  const repository = {
    findTournamentById: jest
      .fn()
      .mockResolvedValue({ id: tournamentId, createdBy: owner.sub }),
    isTournamentStaff: jest.fn().mockResolvedValue(false),
    findTournamentIdsUsingCourt: jest.fn().mockResolvedValue([tournamentId]),
    listCameras: jest.fn().mockResolvedValue([]),
    findPullCameraByCourt: jest.fn().mockResolvedValue(null),
    updatePullCameraUrl: jest.fn(),
    archiveCamera: jest.fn(),
    findActiveCameraByCourt: jest.fn().mockResolvedValue(null),
    createCamera: jest.fn(async (input) => ({
      id: 'camera-1',
      status: 'IDLE',
      createdAt: new Date('2026-10-01T00:00:00.000Z'),
      updatedAt: new Date('2026-10-01T00:00:00.000Z'),
      ...input,
    })),
    listMatchIdsWithoutCameraOnCourt: jest.fn().mockResolvedValue([]),
    assignCameraToMatch: jest.fn(async (matchId, cameraId, playbackUrl) => ({
      matchId,
      cameraId,
      playbackUrl,
    })),
    ...overrides,
  };
  const config: Record<string, string | number> = {
    // Media server riêng đang ẨN: giá trị vẫn cấu hình được nhưng không dùng cho
    // đường phát sóng nữa.
    LIVESTREAM_RTMP_BASE_URL: 'rtmp://media.test:1935/live',
    LIVESTREAM_SRT_BASE_URL: 'srt://media.test:8890',
    // Hạ tầng thật đang dùng.
    AQVISION_PUSH_HOST: 'media.test',
    AQVISION_PUSH_RTMP_PORT: 11935,
    AQVISION_PLAYBACK_BASE_URL: 'https://media.test',
  };
  const service = new LivestreamService(
    repository as unknown as LivestreamRepository,
    { get: (key: string) => config[key] } as unknown as ConfigService,
    {} as AqvisionPublishService,
    {} as AqvisionApiClient,
  );
  return { repository, service };
}

/**
 * `listCameras` reads whole rows, so a raw spread would ship the stream key and
 * the three encrypted RTSP/credential columns to every tournament operator.
 */
describe('LivestreamService camera projection', () => {
  it('never exposes the stream key or the encrypted RTSP columns', async () => {
    const { service } = makeService({
      listCameras: jest.fn().mockResolvedValue([
        {
          id: 'camera-1',
          tournamentId,
          courtId,
          name: 'Sân 1',
          mode: 'PULL',
          protocol: 'RTMP',
          streamName: 'camera_abc',
          streamKey: 'must-not-leak',
          status: 'IDLE',
          playbackUrl: 'https://media.example.com/hls/cam1/index.m3u8',
          rtspUrlEncrypted: 'enc:rtsp',
          usernameEncrypted: 'enc:user',
          passwordEncrypted: 'enc:pass',
          createdBy: owner.sub,
          createdAt: new Date('2026-10-01T00:00:00.000Z'),
          updatedAt: new Date('2026-10-01T00:00:00.000Z'),
          deletedAt: null,
        },
      ]),
    });

    const cameras = await service.listCameras(tournamentId, owner);
    const camera = cameras[0] as Record<string, unknown>;

    expect(camera).not.toHaveProperty('streamKey');
    expect(camera).not.toHaveProperty('rtspUrlEncrypted');
    expect(camera).not.toHaveProperty('usernameEncrypted');
    expect(camera).not.toHaveProperty('passwordEncrypted');
    expect(camera).not.toHaveProperty('createdBy');
    expect(camera).toEqual({
      id: 'camera-1',
      tournamentId,
      courtId,
      name: 'Sân 1',
      mode: 'PULL',
      protocol: 'RTMP',
      streamName: 'camera_abc',
      status: 'IDLE',
      playbackUrl: 'https://media.example.com/hls/cam1/index.m3u8',
      // PULL has no ingest: the broadcaster publishes elsewhere.
      ingest: null,
      createdAt: new Date('2026-10-01T00:00:00.000Z'),
      updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    });
  });

  it('also projects the create response, keeping the publish info on top', async () => {
    const { service } = makeService();

    const created = await service.createCamera(tournamentId, owner, {
      name: 'OBS chính',
      mode: 'PUSH',
      protocol: 'RTMP',
    });

    expect(created).not.toHaveProperty('streamKey');
    expect(created).not.toHaveProperty('rtspUrlEncrypted');
    expect(created.publish?.streamName).toBe(created.streamName);
  });

  it('hands the configured ingest host to the UI instead of a hardcoded one', async () => {
    const { service } = makeService();

    const created = await service.createCamera(tournamentId, owner, {
      name: 'OBS chính',
      mode: 'PUSH',
      protocol: 'RTMP',
    });

    // Đích đẩy RTMP là hạ tầng AQP. `srt` vẫn mang giá trị của media server riêng
    // đang ẩn — UI đã ẩn lựa chọn này nên không ai dùng.
    expect(created.ingest).toEqual({
      rtmp: 'rtmp://media.test:11935/live',
      srt: 'srt://media.test:8890',
    });
    expect(created.publish?.url).toBe(
      `rtmp://media.test:11935/live/${created.streamName}`,
    );
  });
});

/**
 * A court can be given a camera after the schedule was already drawn up. Without
 * the backfill the board shows the Start button enabled (the court has a camera)
 * while the API refuses the start (the match itself has no camera).
 */
describe('LivestreamService court camera backfill', () => {
  it('assigns the new court camera to matches that had none', async () => {
    const { repository, service } = makeService({
      listMatchIdsWithoutCameraOnCourt: jest
        .fn()
        .mockResolvedValue(['match-1', 'match-2']),
    });

    await service.setCourtPlaybackUrl(tournamentId, courtId, owner, {
      playbackUrl: 'https://media.example.com/hls/cam1/index.m3u8',
    });

    expect(repository.listMatchIdsWithoutCameraOnCourt).toHaveBeenCalledWith(
      courtId,
      tournamentId,
    );
    expect(repository.assignCameraToMatch).toHaveBeenCalledTimes(2);
    expect(repository.assignCameraToMatch).toHaveBeenCalledWith(
      'match-1',
      'camera-1',
      'https://media.example.com/hls/cam1/index.m3u8',
    );
  });

  it('does not touch assignments when a PUSH camera is created without a court', async () => {
    const { repository, service } = makeService();

    await service.createCamera(tournamentId, owner, {
      name: 'OBS chính',
      mode: 'PUSH',
      protocol: 'RTMP',
    });

    expect(repository.listMatchIdsWithoutCameraOnCourt).not.toHaveBeenCalled();
    expect(repository.assignCameraToMatch).not.toHaveBeenCalled();
  });

  it('backfills only when a camera is bound to a court', async () => {
    const { repository, service } = makeService({
      listMatchIdsWithoutCameraOnCourt: jest.fn().mockResolvedValue(['match-1']),
    });

    await service.createCamera(tournamentId, owner, {
      name: 'Sân 1',
      mode: 'PULL',
      playbackUrl: 'https://media.example.com/hls/cam1/index.m3u8',
      courtId,
    });

    expect(repository.listMatchIdsWithoutCameraOnCourt).toHaveBeenCalledWith(
      courtId,
      tournamentId,
    );
    expect(repository.assignCameraToMatch).toHaveBeenCalledWith(
      'match-1',
      'camera-1',
      'https://media.example.com/hls/cam1/index.m3u8',
    );
  });
});
