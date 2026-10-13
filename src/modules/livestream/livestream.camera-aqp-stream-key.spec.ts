import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { AqvisionAgencyApiClient, AqvisionAgencyStreamKey } from './aqvision-agency-api.client';
import { AqvisionAgencyApiException } from './aqvision-agency-api.client';
import { AqvisionApiClient } from './aqvision-api.client';
import { AqvisionPublishService } from './aqvision-publish.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { LivestreamRepository } from './livestream.repository';
import type { AqvisionRecordingService } from './aqvision-recording.service';
import type { LivestreamHealthQueue } from './livestream-health.queue';
import type { LivestreamCameraSourceCryptoService } from './livestream-camera-source-crypto.service';
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
const camera = {
  id: 'camera-1',
  tournamentId,
  courtId: null,
  name: 'Camera sân 1',
  mode: 'PUSH',
  protocol: 'RTMP',
  streamName: 'camera_abc',
  streamKey: 'internal-secret-must-not-leak',
  aqpStreamKeyId: null as string | null,
  status: 'IDLE',
  playbackUrl: 'https://media.aqvision.net/live/camera_abc/hls.m3u8',
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  updatedAt: new Date('2026-10-01T00:00:00.000Z'),
};
const activeKey: AqvisionAgencyStreamKey = {
  id: 'aqp-key-1',
  app: 'live',
  stream: 'camera_abc',
  status: 'Offline',
  push: {
    rtmpServer: 'rtmp://push.aqvision.net:11935/live',
    streamKey: 'camera_abc?key=provider-secret',
  },
};

function makeService(options: {
  camera?: typeof camera;
  staff?: boolean;
  lockResult?: boolean;
  agency?: Partial<Record<keyof AqvisionAgencyApiClient, jest.Mock>>;
} = {}) {
  const currentCamera = options.camera ?? camera;
  const repository = {
    findCameraById: jest.fn().mockResolvedValue(currentCamera),
    findTournamentById: jest
      .fn()
      .mockResolvedValue({ id: tournamentId, name: 'Giải', createdBy: owner.sub }),
    isTournamentStaff: jest.fn().mockResolvedValue(options.staff ?? false),
    setAqpStreamKeyId: jest.fn().mockResolvedValue(true),
    hasCameraRecordings: jest.fn().mockResolvedValue(false),
    isCameraStreamNameTaken: jest.fn().mockResolvedValue(false),
    updateCameraStreamName: jest.fn().mockResolvedValue({
      ...currentCamera,
      streamName: 'camera_new',
      playbackUrl: 'https://media.aqvision.net/live/camera_new/hls.m3u8',
    }),
    deleteCamera: jest.fn().mockResolvedValue(currentCamera),
  };
  const agencyClient = {
    createStreamKey: jest.fn().mockResolvedValue(activeKey),
    listStreamKeys: jest.fn().mockResolvedValue([]),
    getStreamKey: jest.fn().mockResolvedValue(activeKey),
    updateStreamKey: jest.fn().mockResolvedValue({
      ...activeKey,
      stream: 'camera_new',
      push: null,
    }),
    rotateStreamKey: jest.fn().mockResolvedValue(activeKey),
    deleteStreamKey: jest.fn().mockResolvedValue({ keyRevoked: true, disconnected: true }),
    ...options.agency,
  };
  const lock = {
    isOwned: jest.fn().mockReturnValue(options.lockResult ?? true),
  };
  const healthQueue = {
    runWithCameraLock: jest.fn(async (_cameraId: string, operation: (lease: typeof lock) => Promise<unknown>) =>
      options.lockResult === false ? null : operation(lock),
    ),
    runWithStreamNameLock: jest.fn(async (_cameraId: string, _streamName: string, operation: (lease: typeof lock) => Promise<unknown>) =>
      options.lockResult === false ? null : operation(lock),
    ),
  };
  const service = new LivestreamService(
    repository as unknown as LivestreamRepository,
    { get: jest.fn((_key: string, fallback?: unknown) => fallback) } as unknown as ConfigService,
    {} as AqvisionPublishService,
    {} as AqvisionApiClient,
    {} as unknown as AqvisionRecordingService,
    healthQueue as unknown as LivestreamHealthQueue,
    {} as LivestreamCameraSourceCryptoService,
    agencyClient as unknown as AqvisionAgencyApiClient,
  );
  return { service, repository, agencyClient, healthQueue, lock };
}

describe('LivestreamService AQP stream-key lifecycle', () => {
  it('creates a provider key, stores only its ID, and returns the RTMP QR from data.push', async () => {
    const { service, repository, agencyClient } = makeService();

    const result = await service.createCameraAqpStreamKey('camera-1', owner);

    expect(agencyClient.createStreamKey).toHaveBeenCalledWith({ app: 'live', stream: 'camera_abc' });
    expect(repository.setAqpStreamKeyId).toHaveBeenCalledWith('camera-1', activeKey.id);
    expect(result.rtmp).toEqual({
      server: activeKey.push?.rtmpServer,
      streamKey: activeKey.push?.streamKey,
    });
    expect(result.qrPayload).toEqual({
      stream_url: 'rtmp://push.aqvision.net:11935/live/camera_abc?key=provider-secret',
      match_id: 'camera_abc',
      match_title: 'Camera sân 1',
      protocol: 'rtmp',
      auto_start: false,
    });
    expect(JSON.stringify(result)).not.toContain('internal-secret-must-not-leak');
  });
  it('reuses the exact provider stream found by the preflight list before POST', async () => {
    const { service, repository, agencyClient } = makeService({
      agency: {
        listStreamKeys: jest.fn().mockResolvedValue([
          {
            id: activeKey.id,
            app: activeKey.app,
            stream: activeKey.stream,
            status: activeKey.status,
            push: null,
          },
        ]),
        getStreamKey: jest.fn().mockResolvedValue(activeKey),
      },
    });

    const result = await service.createCameraAqpStreamKey('camera-1', owner);

    expect(agencyClient.listStreamKeys).toHaveBeenCalledTimes(1);
    expect(agencyClient.createStreamKey).not.toHaveBeenCalled();
    expect(repository.setAqpStreamKeyId).toHaveBeenCalledWith('camera-1', activeKey.id);
    expect(result.streamKeyId).toBe(activeKey.id);
  });

  it('does not POST when the provider preflight list cannot be read', async () => {
    const { service, agencyClient } = makeService({
      agency: {
        listStreamKeys: jest
          .fn()
          .mockRejectedValue(new AqvisionAgencyApiException('unavailable', 503)),
      },
    });

    await expect(service.createCameraAqpStreamKey('camera-1', owner)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(agencyClient.createStreamKey).not.toHaveBeenCalled();
  });

  it('reconciles a timed-out POST through list/detail without issuing a duplicate POST', async () => {
    const providerError = new AqvisionAgencyApiException('timeout', null, true);
    const { service, repository, agencyClient } = makeService({
      agency: {
        createStreamKey: jest.fn().mockRejectedValue(providerError),
        listStreamKeys: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            { id: activeKey.id, app: activeKey.app, stream: activeKey.stream, status: activeKey.status, push: null },
          ]),
        getStreamKey: jest.fn().mockResolvedValue(activeKey),
      },
    });

    const result = await service.createCameraAqpStreamKey('camera-1', owner);

    expect(agencyClient.createStreamKey).toHaveBeenCalledTimes(1);
    expect(agencyClient.getStreamKey).toHaveBeenCalledWith(activeKey.id);
    expect(repository.setAqpStreamKeyId).toHaveBeenCalledWith('camera-1', activeKey.id);
    expect(result.streamKeyId).toBe(activeKey.id);
  });

  it('reads a linked key without creating another provider key', async () => {
    const linkedCamera = { ...camera, aqpStreamKeyId: activeKey.id };
    const { service, agencyClient } = makeService({ camera: linkedCamera });

    const result = await service.getCameraAqpStreamKey('camera-1', owner);

    expect(agencyClient.getStreamKey).toHaveBeenCalledWith(activeKey.id);
    expect(agencyClient.createStreamKey).not.toHaveBeenCalled();
    expect(result.status).toBe('Offline');
  });
  it('clears a stale local link when the provider no longer has the key', async () => {
    const linkedCamera = { ...camera, aqpStreamKeyId: activeKey.id };
    const { service, repository, agencyClient } = makeService({
      camera: linkedCamera,
      agency: {
        getStreamKey: jest.fn().mockRejectedValue(new AqvisionAgencyApiException('missing', 404)),
      },
    });

    const result = await service.getCameraAqpStreamKey('camera-1', owner);

    expect(result.streamKeyId).toBeNull();
    expect(repository.setAqpStreamKeyId).toHaveBeenCalledWith('camera-1', null);
    expect(agencyClient.createStreamKey).not.toHaveBeenCalled();
  });
  it('revokes, renames, then reissues the provider key under the new stream name', async () => {
    const linkedCamera = { ...camera, aqpStreamKeyId: activeKey.id };
    const { service, repository, agencyClient } = makeService({ camera: linkedCamera });
    const order: string[] = [];
    const renamedActiveKey = {
      ...activeKey,
      stream: 'camera_new',
      push: { rtmpServer: 'rtmp://push.example/live', streamKey: 'camera_new?key=new-secret' },
    };
    agencyClient.deleteStreamKey = jest.fn(async () => {
      order.push('revoke');
      return { keyRevoked: true, disconnected: true };
    });
    agencyClient.updateStreamKey = jest.fn(async () => {
      order.push('rename');
      return { ...activeKey, stream: 'camera_new', push: null };
    });
    agencyClient.getStreamKey = jest
      .fn()
      .mockResolvedValueOnce(activeKey)
      .mockResolvedValue({ ...activeKey, stream: 'camera_new', push: null });
    agencyClient.createStreamKey = jest.fn(async () => {
      order.push('reissue');
      return renamedActiveKey;
    });
    repository.updateCameraStreamName = jest.fn(async () => {
      order.push('save');
      return { ...linkedCamera, streamName: 'camera_new' };
    });

    const result = await service.renameCameraAqpStreamKey('camera-1', owner, 'camera_new');

    expect(order).toEqual(['revoke', 'rename', 'save', 'reissue']);
    expect(agencyClient.updateStreamKey).toHaveBeenCalledWith(
      activeKey.id,
      { stream: 'camera_new' },
      'PATCH',
    );
    expect(agencyClient.createStreamKey).toHaveBeenCalledWith({
      app: 'live',
      stream: 'camera_new',
    });
    expect(result.camera.streamName).toBe('camera_new');
    expect(result.streamKeyId).toBe(activeKey.id);
    expect(result.rtmp?.streamKey).toBe('camera_new?key=new-secret');
  });

  it('reconciles a possibly applied rename before saving the local stream name', async () => {
    const linkedCamera = { ...camera, aqpStreamKeyId: activeKey.id };
    const { service, repository, agencyClient } = makeService({ camera: linkedCamera });
    const renamedRevokedKey = { ...activeKey, stream: 'camera_new', push: null };
    const renamedActiveKey = {
      ...activeKey,
      stream: 'camera_new',
      push: { rtmpServer: 'rtmp://push.example/live', streamKey: 'camera_new?key=rotated' },
    };
    agencyClient.deleteStreamKey = jest
      .fn()
      .mockResolvedValue({ keyRevoked: true, disconnected: true });
    agencyClient.updateStreamKey = jest
      .fn()
      .mockRejectedValue(new AqvisionAgencyApiException('unknown update outcome', null, true));
    agencyClient.getStreamKey = jest
      .fn()
      .mockResolvedValueOnce(activeKey)
      .mockResolvedValue(renamedRevokedKey);
    agencyClient.createStreamKey = jest.fn().mockResolvedValue(renamedActiveKey);
    repository.updateCameraStreamName = jest.fn().mockResolvedValue({
      ...linkedCamera,
      streamName: 'camera_new',
    });

    const result = await service.renameCameraAqpStreamKey('camera-1', owner, 'camera_new');

    expect(agencyClient.getStreamKey).toHaveBeenCalledTimes(3);
    expect(repository.updateCameraStreamName).toHaveBeenCalledWith(
      'camera-1',
      'camera_new',
      expect.any(String),
    );
    expect(agencyClient.createStreamKey).toHaveBeenCalledWith({
      app: 'live',
      stream: 'camera_new',
    });
    expect(result.camera.streamName).toBe('camera_new');
    expect(result.rtmp?.streamKey).toBe('camera_new?key=rotated');
  });

  it('rejects a stream rename when the camera has a recording', async () => {
    const { service, repository, agencyClient } = makeService({
      camera: { ...camera, aqpStreamKeyId: activeKey.id },
    });
    repository.hasCameraRecordings = jest.fn().mockResolvedValue(true);

    await expect(
      service.renameCameraAqpStreamKey('camera-1', owner, 'camera_new'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(agencyClient.deleteStreamKey).not.toHaveBeenCalled();
    expect(agencyClient.updateStreamKey).not.toHaveBeenCalled();
  });

  it('rejects rename while another camera holds the target-name lease', async () => {
    const { service, healthQueue, agencyClient } = makeService();
    healthQueue.runWithStreamNameLock.mockResolvedValue(null);

    await expect(
      service.renameCameraAqpStreamKey('camera-1', owner, 'camera_new'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(healthQueue.runWithStreamNameLock).toHaveBeenCalledWith(
      'camera-1',
      'camera_new',
      expect.any(Function),
    );
    expect(agencyClient.deleteStreamKey).not.toHaveBeenCalled();
    expect(agencyClient.updateStreamKey).not.toHaveBeenCalled();
    expect(agencyClient.createStreamKey).not.toHaveBeenCalled();
  });

  it('rejects a stream name already assigned to another camera before provider calls', async () => {
    const { service, repository, agencyClient } = makeService();
    repository.isCameraStreamNameTaken = jest.fn().mockResolvedValue(true);

    await expect(
      service.renameCameraAqpStreamKey('camera-1', owner, 'camera_new'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(agencyClient.updateStreamKey).not.toHaveBeenCalled();
  });


  it('rotates the provider key and exposes the newly returned RTMP config', async () => {
    const linkedCamera = { ...camera, aqpStreamKeyId: activeKey.id };
    const rotated = {
      ...activeKey,
      push: { rtmpServer: 'rtmp://push2.aqvision.net/live', streamKey: 'camera_abc?key=new-secret' },
    };
    const { service, agencyClient } = makeService({
      camera: linkedCamera,
      agency: { rotateStreamKey: jest.fn().mockResolvedValue(rotated) },
    });

    const result = await service.rotateCameraAqpStreamKey('camera-1', owner);

    expect(agencyClient.rotateStreamKey).toHaveBeenCalledWith(activeKey.id);
    expect(result.rtmp).toEqual({ server: rotated.push?.rtmpServer, streamKey: rotated.push?.streamKey });
    expect(result.qrPayload?.stream_url).toContain('key=new-secret');
  });

  it('retries only the vendor-confirmed revoked-but-not-disconnected DELETE outcome', async () => {
    const linkedCamera = { ...camera, aqpStreamKeyId: activeKey.id };
    const deleteStreamKey = jest
      .fn()
      .mockResolvedValueOnce({ keyRevoked: true, disconnected: false })
      .mockResolvedValueOnce({ keyRevoked: true, disconnected: true });
    const { service, repository, agencyClient } = makeService({
      camera: linkedCamera,
      agency: { deleteStreamKey },
    });

    await expect(service.revokeCameraAqpStreamKey('camera-1', owner)).resolves.toEqual({
      cameraId: 'camera-1',
      keyRevoked: true,
      disconnected: true,
    });

    expect(deleteStreamKey).toHaveBeenCalledTimes(2);
    expect(repository.setAqpStreamKeyId).not.toHaveBeenCalled();
    expect(agencyClient.rotateStreamKey).not.toHaveBeenCalled();
  });
  it('revokes and disconnects the provider key before archiving its camera', async () => {
    const linkedCamera = { ...camera, aqpStreamKeyId: activeKey.id };
    const { service, repository, agencyClient } = makeService({ camera: linkedCamera });
    const order: string[] = [];
    agencyClient.deleteStreamKey = jest.fn(async () => {
      order.push('revoke');
      return { keyRevoked: true, disconnected: true };
    });
    repository.deleteCamera.mockImplementation(async () => {
      order.push('archive');
      return { ...linkedCamera };
    });

    await service.deleteCamera('camera-1', owner);

    expect(order).toEqual(['revoke', 'archive']);
    expect(repository.setAqpStreamKeyId).not.toHaveBeenCalled();
  });

  it('does not archive a camera while its provider publisher may still be connected', async () => {
    const linkedCamera = { ...camera, aqpStreamKeyId: activeKey.id };
    const { service, repository, agencyClient } = makeService({ camera: linkedCamera });
    agencyClient.deleteStreamKey = jest.fn().mockResolvedValue({
      keyRevoked: true,
      disconnected: false,
    });

    await expect(service.deleteCamera('camera-1', owner)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(repository.deleteCamera).not.toHaveBeenCalled();
  });


  it('keeps the local link when AQP cannot confirm publisher disconnection', async () => {
    const linkedCamera = { ...camera, aqpStreamKeyId: activeKey.id };
    const { service, repository } = makeService({
      camera: linkedCamera,
      agency: {
        deleteStreamKey: jest.fn().mockResolvedValue({ keyRevoked: true, disconnected: false }),
      },
    });

    await expect(service.revokeCameraAqpStreamKey('camera-1', owner)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(repository.setAqpStreamKeyId).not.toHaveBeenCalled();
  });

  it('refuses provider operations for PULL cameras or users without tournament access', async () => {
    const pullCamera = { ...camera, mode: 'PULL' };
    const pull = makeService({ camera: pullCamera });
    await expect(pull.service.createCameraAqpStreamKey('camera-1', owner)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(pull.agencyClient.createStreamKey).not.toHaveBeenCalled();

    const privateTournament = makeService({ staff: false });
    await expect(
      privateTournament.service.createCameraAqpStreamKey('camera-1', stranger),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(privateTournament.agencyClient.createStreamKey).not.toHaveBeenCalled();
  });

  it('fails without calling AQP when the per-camera distributed lock is unavailable', async () => {
    const { service, agencyClient } = makeService({ lockResult: false });

    await expect(service.createCameraAqpStreamKey('camera-1', owner)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(agencyClient.createStreamKey).not.toHaveBeenCalled();
  });
});
