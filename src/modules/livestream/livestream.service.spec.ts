import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AqvisionApiClient, AqvisionApiException } from './aqvision-api.client';
import { AqvisionPublishService } from './aqvision-publish.service';
import { AqvisionRecordingService } from './aqvision-recording.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { LivestreamRepository } from './livestream.repository';
import type {
  CameraLeaseHandle,
  LivestreamHealthQueue,
} from './livestream-health.queue';
import { LivestreamService } from './livestream.service';

type RepositoryMock = {
  findMatchWithTournament: jest.Mock;
  isTournamentStaff: jest.Mock;
  findMatchLivestream: jest.Mock;
  updateStreamStatus: jest.Mock;
  updateCameraPullProxyKey: jest.Mock;
  findStandaloneMatchPlayback: jest.Mock;
};

type RecordingCatalogService = {
  listMatchRecordingDays(matchId: string, user: JwtPayload): Promise<string[]>;
  listMatchRecordings(
    matchId: string,
    period: string,
    user: JwtPayload,
  ): Promise<{ name: string; sizeBytes?: number }[]>;
};

const owner: JwtPayload = {
  sub: 'owner-1',
  email: 'owner@example.com',
  role: 'USER',
  roles: [],
};

const assignedReferee: JwtPayload = {
  sub: 'referee-1',
  email: 'referee@example.com',
  role: 'REFEREE',
  roles: ['REFEREE'],
};

const unrelatedUser: JwtPayload = {
  sub: 'other-1',
  email: 'other@example.com',
  role: 'USER',
  roles: [],
};

const match = {
  tournamentId: 'tournament-1',
  tournamentCreatedBy: owner.sub,
  refereeId: assignedReferee.sub,
  participant1Id: 'team-1',
  participant2Id: 'team-2',
};

function makeService(
  stream: unknown = null,
  recordingServiceOverride?: AqvisionRecordingService,
) {
  let persistedStreamStatus: string | null = null;
  const repository: RepositoryMock = {
    findMatchWithTournament: jest.fn().mockResolvedValue({ ...match }),
    isTournamentStaff: jest.fn().mockResolvedValue(false),
    findMatchLivestream: jest.fn().mockResolvedValue(stream),
    updateStreamStatus: jest.fn().mockImplementation(
      async (
        matchId: string,
        streamStatus: 'IDLE' | 'LIVE' | 'OFFLINE',
        _userId: string | null,
        playbackUrl: string | null,
      ) => {
        persistedStreamStatus = streamStatus;
        return {
          id: 'stream-1',
          matchId,
          cameraId: 'camera-1',
          streamStatus,
          playbackUrl,
          recordingUrl: null,
          isFeatured: true,
        };
      },
    ),
    updateCameraPullProxyKey: jest.fn().mockResolvedValue({
      id: 'camera-1',
      pullProxyKey: 'proxy-key',
    }),
    findStandaloneMatchPlayback: jest.fn().mockResolvedValue(null),
  };
  const recordingService = {
    reconcileCamera: jest.fn().mockResolvedValue('RECORDING'),
    listRecordDays: jest.fn().mockResolvedValue([]),
    listRecordFiles: jest.fn().mockResolvedValue([]),
  };
  const livestreamHealthQueue = {
    runWithCameraLock: jest.fn(
      async (
        cameraId: string,
        operation: (lease: CameraLeaseHandle) => Promise<unknown>,
      ) => operation({ cameraId, isOwned: () => true }),
    ),
  };
  const aqvisionApiClient = {
    addStreamProxy: jest.fn().mockResolvedValue({ proxyKey: null }),
  };
  const cameraSourceCrypto = {
    encrypt: jest.fn((source: string) => `encrypted:${source}`),
    decrypt: jest.fn().mockReturnValue('rtsp://camera.local/live'),
  };
  const configService = {
    get: jest.fn((key: string, fallback?: unknown) =>
      key === 'AQVISION_PLAYBACK_BASE_URL'
        ? 'https://media.aqvision.net'
        : fallback,
    ),
  } as unknown as ConfigService;
  const LivestreamServiceConstructor = LivestreamService as unknown as {
    new (...args: unknown[]): LivestreamService;
  };
  const service = new LivestreamServiceConstructor(
    repository as unknown as LivestreamRepository,
    configService,
    {} as AqvisionPublishService,
    aqvisionApiClient as unknown as AqvisionApiClient,
    recordingServiceOverride ??
      (recordingService as unknown as AqvisionRecordingService),
    livestreamHealthQueue as unknown as LivestreamHealthQueue,
    cameraSourceCrypto,
  );
  return {
    repository,
    service,
    recordingService,
    livestreamHealthQueue,
    aqvisionApiClient,
    cameraSourceCrypto,
    getPersistedStreamStatus: () => persistedStreamStatus,
  };
}

describe('LivestreamService match stream control state', () => {
  it('returns a minimal state projection for a tournament operator', async () => {
    const { repository, service } = makeService({
      cameraId: 'camera-1',
      streamStatus: 'LIVE',
      streamKey: 'must-not-leak',
      playbackUrl: 'https://private.example/stream',
    });

    await expect(
      service.getMatchStreamControlState('match-1', owner),
    ).resolves.toEqual({
      matchId: 'match-1',
      hasCamera: true,
      streamStatus: 'LIVE',
    });
    expect(repository.findMatchLivestream).toHaveBeenCalledWith('match-1');
  });

  it('passes OFFLINE and ERROR through but withholds an undocumented status', async () => {
    const { service: offlineService } = makeService({
      cameraId: 'camera-1',
      streamStatus: 'OFFLINE',
    });
    const { service: errorService } = makeService({
      cameraId: 'camera-1',
      streamStatus: 'ERROR',
    });
    const { service: unknownService } = makeService({
      cameraId: 'camera-1',
      streamStatus: 'PREPARING',
    });

    await expect(
      offlineService.getMatchStreamControlState('match-1', owner),
    ).resolves.toEqual({
      matchId: 'match-1',
      hasCamera: true,
      streamStatus: 'OFFLINE',
    });
    await expect(
      errorService.getMatchStreamControlState('match-1', owner),
    ).resolves.toEqual({
      matchId: 'match-1',
      hasCamera: true,
      streamStatus: 'ERROR',
    });
    await expect(
      unknownService.getMatchStreamControlState('match-1', owner),
    ).resolves.toEqual({
      matchId: 'match-1',
      hasCamera: true,
      streamStatus: null,
    });
  });

  it('allows the assigned referee and normalizes legacy ENDED state', async () => {
    const { service } = makeService({
      cameraId: 'camera-1',
      streamStatus: 'ENDED',
      endedAt: new Date('2026-09-30T00:00:00.000Z'),
      playbackUrl: 'https://private.example/old-replay',
    });

    await expect(
      service.getMatchStreamControlState('match-1', assignedReferee),
    ).resolves.toEqual({
      matchId: 'match-1',
      hasCamera: true,
      // Legacy ENDED rows came from the old stop flow, so they normalize onto
      // the same explicit stopped marker the current stop writes.
      streamStatus: 'OFFLINE',
    });
  });

  it('does not report a stale LIVE row as controllable without an active camera', async () => {
    const { service } = makeService({
      cameraId: null,
      streamStatus: 'LIVE',
      streamKey: 'must-not-leak',
    });

    await expect(
      service.getMatchStreamControlState('match-1', assignedReferee),
    ).resolves.toEqual({
      matchId: 'match-1',
      hasCamera: false,
      streamStatus: null,
    });
  });

  it('rejects an unrelated user before reading stream state', async () => {
    const { repository, service } = makeService({
      cameraId: 'camera-1',
      streamStatus: 'LIVE',
    });

    repository.findMatchWithTournament.mockResolvedValue({
      ...match,
      refereeId: 'assigned-referee',
    });

    await expect(
      service.getMatchStreamControlState('match-1', unrelatedUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.findMatchLivestream).not.toHaveBeenCalled();
  });
});

const cameraStreamForRecording = {
  cameraId: 'camera-1',
  streamStatus: 'IDLE',
  streamKey: 'test-stream-key',
  streamName: 'camera-stream',
  cameraMode: 'PULL',
  cameraProtocol: 'RTMP',
  cameraPlaybackUrl: 'https://media.example.test/camera-stream/index.m3u8',
};

function makeRecordingCoordinator(isRecording: boolean) {
  const provider = {
    isMediaOnline: jest.fn().mockResolvedValue({ online: true }),
    isRecordingMp4: jest.fn().mockResolvedValue(isRecording),
    startRecordMp4: jest.fn().mockResolvedValue(undefined),
    stopRecordMp4: jest.fn().mockResolvedValue(undefined),
  };
  const targetRepository = {
    findCameraRecordingTarget: jest.fn().mockResolvedValue({
      cameraId: 'camera-1',
      streamName: 'camera-stream',
      hasLiveAssignment: true,
    }),
  };
  const jobQueue = {
    cancelCameraOfflineConfirmation: jest.fn().mockResolvedValue(undefined),
  };
  const coordinator = new AqvisionRecordingService(
    provider as unknown as AqvisionApiClient,
    targetRepository as unknown as LivestreamRepository,
    jobQueue as unknown as LivestreamHealthQueue,
  );

  return { provider, coordinator };
}

const cameraPullStreamForRecording = {
  ...cameraStreamForRecording,
  cameraPlaybackUrl: 'https://media.aqvision.net/live/camera-stream/hls.m3u8',
  cameraRtspUrlEncrypted: 'encrypted:rtsp://camera.local/live',
  cameraPullProxyKey: null,
};

describe('LivestreamService recording status on match lifecycle', () => {
  it('creates and persists the PULL proxy under the camera lease before marking LIVE', async () => {
    const {
      repository,
      service,
      livestreamHealthQueue,
      aqvisionApiClient,
      cameraSourceCrypto,
    } = makeService(cameraPullStreamForRecording);
    aqvisionApiClient.addStreamProxy.mockResolvedValue({
      proxyKey: 'proxy-key',
    });

    await service.startMatchStream('match-1', owner);

    expect(livestreamHealthQueue.runWithCameraLock).toHaveBeenCalledWith(
      'camera-1',
      expect.any(Function),
    );
    expect(cameraSourceCrypto.decrypt).toHaveBeenCalledWith(
      'encrypted:rtsp://camera.local/live',
    );
    expect(aqvisionApiClient.addStreamProxy).toHaveBeenCalledWith({
      stream: 'camera-stream',
      url: 'rtsp://camera.local/live',
      enableHls: true,
      enableMp4: true,
    });
    expect(repository.updateCameraPullProxyKey).toHaveBeenCalledWith(
      'camera-1',
      'proxy-key',
    );
    expect(repository.updateCameraPullProxyKey.mock.invocationCallOrder[0]).toBeLessThan(
      repository.updateStreamStatus.mock.invocationCallOrder[0],
    );
    expect(repository.updateStreamStatus).toHaveBeenCalledWith(
      'match-1',
      'LIVE',
      owner.sub,
      'https://media.aqvision.net/live/camera-stream/hls.m3u8',
      'camera-1',
    );
  });

  it('fails closed when the match is no longer assigned to the starting camera', async () => {
    const { repository, service, aqvisionApiClient, recordingService } =
      makeService(cameraPullStreamForRecording);
    aqvisionApiClient.addStreamProxy.mockResolvedValue({
      proxyKey: 'proxy-key',
    });
    repository.updateStreamStatus.mockResolvedValue(null);

    await expect(
      service.startMatchStream('match-1', owner),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(repository.updateStreamStatus).toHaveBeenCalledWith(
      'match-1',
      'LIVE',
      owner.sub,
      'https://media.aqvision.net/live/camera-stream/hls.m3u8',
      'camera-1',
    );
    expect(recordingService.reconcileCamera).not.toHaveBeenCalled();
  });



  it('does not mark a CAMERA PULL match LIVE when AQVision returns no proxy key', async () => {
    const { repository, service, aqvisionApiClient, recordingService } =
      makeService(cameraPullStreamForRecording);
    aqvisionApiClient.addStreamProxy.mockResolvedValue({ proxyKey: null });

    await expect(service.startMatchStream('match-1', owner)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    expect(repository.updateStreamStatus).not.toHaveBeenCalled();
    expect(repository.updateCameraPullProxyKey).not.toHaveBeenCalled();
    expect(recordingService.reconcileCamera).not.toHaveBeenCalled();
  });

  it('keeps an already-live PLAYBACK PULL source proxy-free', async () => {
    const { repository, service, aqvisionApiClient, cameraSourceCrypto } =
      makeService({
        ...cameraStreamForRecording,
        cameraPlaybackUrl: 'https://outside.example/live.m3u8',
      });

    const response = await service.startMatchStream('match-1', owner);

    expect(aqvisionApiClient.addStreamProxy).not.toHaveBeenCalled();
    expect(cameraSourceCrypto.decrypt).not.toHaveBeenCalled();
    expect(repository.updateStreamStatus).toHaveBeenCalledWith(
      'match-1',
      'LIVE',
      owner.sub,
      'https://outside.example/live.m3u8',
      'camera-1',
    );
    expect(response.playbackUrl).toBe('https://outside.example/live.m3u8');
  });

  it('does not persist the proxy key or mark LIVE after the camera lease is lost', async () => {
    const {
      repository,
      service,
      livestreamHealthQueue,
      aqvisionApiClient,
    } = makeService(cameraPullStreamForRecording);
    let leaseOwned = true;
    aqvisionApiClient.addStreamProxy.mockImplementation(async () => {
      leaseOwned = false;
      return { proxyKey: 'proxy-key' };
    });
    livestreamHealthQueue.runWithCameraLock.mockImplementation(
      async (cameraId, operation) =>
        operation({ cameraId, isOwned: () => leaseOwned }),
    );

    await expect(service.startMatchStream('match-1', owner)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    expect(aqvisionApiClient.addStreamProxy).toHaveBeenCalledTimes(1);
    expect(repository.updateCameraPullProxyKey).not.toHaveBeenCalled();
    expect(repository.updateStreamStatus).not.toHaveBeenCalled();
  });

});

describe('LivestreamService recording status on match lifecycle', () => {
  it('keeps LIVE and preserves the successful stream response when MP4 reconciliation fails', async () => {
    const {
      repository,
      service,
      recordingService,
      livestreamHealthQueue,
      getPersistedStreamStatus,
    } = makeService(cameraStreamForRecording);
    recordingService.reconcileCamera.mockRejectedValue(
      new Error('provider unavailable'),
    );

    const response = await service.startMatchStream('match-1', owner);

    expect(getPersistedStreamStatus()).toBe('LIVE');
    expect(repository.updateStreamStatus).toHaveBeenCalledWith(
      'match-1',
      'LIVE',
      owner.sub,
      'https://media.example.test/camera-stream/index.m3u8',
      'camera-1',
    );
    expect(response).toMatchObject({
      livestream: {
        streamStatus: 'LIVE',
        playbackUrl: 'https://media.example.test/camera-stream/index.m3u8',
      },
      publish: null,
      playbackUrl: 'https://media.example.test/camera-stream/index.m3u8',
      recordingStatus: 'PENDING',
    });
    expect(livestreamHealthQueue.runWithCameraLock).toHaveBeenCalledWith(
      'camera-1',
      expect.any(Function),
    );
  });

  it('returns RECORDING after AQVision starts MP4 during match start', async () => {
    const { provider, coordinator } = makeRecordingCoordinator(false);
    const {
      repository,
      service,
      getPersistedStreamStatus,
    } = makeService(cameraStreamForRecording, coordinator);

    const response = await service.startMatchStream('match-1', owner);

    expect(getPersistedStreamStatus()).toBe('LIVE');
    expect(repository.updateStreamStatus).toHaveBeenCalledWith(
      'match-1',
      'LIVE',
      owner.sub,
      'https://media.example.test/camera-stream/index.m3u8',
      'camera-1',
    );
    expect(provider.startRecordMp4).toHaveBeenCalledWith('camera-stream');
    expect(response).toMatchObject({
      livestream: {
        streamStatus: 'LIVE',
        playbackUrl: 'https://media.example.test/camera-stream/index.m3u8',
      },
      publish: null,
      playbackUrl: 'https://media.example.test/camera-stream/index.m3u8',
      recordingStatus: 'RECORDING',
    });
  });

  it('keeps LIVE and returns PENDING when the camera lease is contended', async () => {
    const {
      repository,
      service,
      recordingService,
      livestreamHealthQueue,
      getPersistedStreamStatus,
    } = makeService(cameraStreamForRecording);
    livestreamHealthQueue.runWithCameraLock.mockImplementation(
      async () => null,
    );

    const response = await service.startMatchStream('match-1', owner);

    expect(getPersistedStreamStatus()).toBe('LIVE');
    expect(repository.updateStreamStatus).toHaveBeenCalledWith(
      'match-1',
      'LIVE',
      owner.sub,
      'https://media.example.test/camera-stream/index.m3u8',
      'camera-1',
    );
    expect(response).toMatchObject({ recordingStatus: 'PENDING' });
    expect(recordingService.reconcileCamera).not.toHaveBeenCalled();
  });

  it('keeps OFFLINE and returns the existing row fields when MP4 stop reconciliation fails', async () => {
    const {
      repository,
      service,
      recordingService,
      getPersistedStreamStatus,
    } = makeService(cameraStreamForRecording);
    recordingService.reconcileCamera.mockRejectedValue(
      new Error('provider unavailable'),
    );

    const response = await service.stopMatchStream('match-1', owner);

    expect(getPersistedStreamStatus()).toBe('OFFLINE');
    expect(repository.updateStreamStatus).toHaveBeenCalledWith(
      'match-1',
      'OFFLINE',
      owner.sub,
      null,
    );
    expect(response).toEqual({
      id: 'stream-1',
      matchId: 'match-1',
      cameraId: 'camera-1',
      streamStatus: 'OFFLINE',
      playbackUrl: null,
      recordingUrl: null,
      isFeatured: true,
      recordingStatus: 'PENDING',
    });
  });

  it('keeps OFFLINE and returns PENDING when the camera lease is contended', async () => {
    const {
      repository,
      service,
      recordingService,
      livestreamHealthQueue,
      getPersistedStreamStatus,
    } = makeService(cameraStreamForRecording);
    livestreamHealthQueue.runWithCameraLock.mockImplementation(
      async () => null,
    );

    const response = await service.stopMatchStream('match-1', owner);

    expect(getPersistedStreamStatus()).toBe('OFFLINE');
    expect(repository.updateStreamStatus).toHaveBeenCalledWith(
      'match-1',
      'OFFLINE',
      owner.sub,
      null,
    );
    expect(response).toMatchObject({
      streamStatus: 'OFFLINE',
      recordingStatus: 'PENDING',
    });
    expect(recordingService.reconcileCamera).not.toHaveBeenCalled();
  });

  it('does not stop a shared camera while another LIVE assignment remains', async () => {
    const { provider, coordinator } = makeRecordingCoordinator(true);
    const { service } = makeService(cameraStreamForRecording, coordinator);

    const response = await service.stopMatchStream('match-1', owner);

    expect(response).toMatchObject({
      streamStatus: 'OFFLINE',
      recordingStatus: 'RECORDING',
    });
    expect(provider.isRecordingMp4).toHaveBeenCalledWith('camera-stream');
    expect(provider.stopRecordMp4).not.toHaveBeenCalled();
  });
});
describe('LivestreamService standalone match playback', () => {
  it('returns an ongoing PUBLIC community stream to an anonymous viewer', async () => {
    const { repository, service } = makeService();
    const startedAt = new Date('2026-10-08T10:00:00.000Z');
    repository.findStandaloneMatchPlayback.mockResolvedValue({
      communityVisibility: 'PUBLIC',
      memberStatus: null,
      status: 'ONGOING',
      playbackUrl: 'https://media.example/live/index.m3u8',
      cameraName: 'Court 1',
      startedAt,
      scoreboardVisible: false,
    });

    await expect(
      service.getStandaloneMatchPlayback('match-1', undefined),
    ).resolves.toEqual({
      matchId: 'match-1',
      streamStatus: 'LIVE',
      playbackUrl: 'https://media.example/live/index.m3u8',
      cameraName: 'Court 1',
      startedAt,
      endedAt: null,
    });
    expect(repository.findStandaloneMatchPlayback).toHaveBeenCalledWith(
      'match-1',
      undefined,
    );
  });

  it('conceals a PRIVATE community stream from a non-member', async () => {
    const { repository, service } = makeService();
    repository.findStandaloneMatchPlayback.mockResolvedValue({
      communityVisibility: 'PRIVATE',
      memberStatus: null,
      status: 'ONGOING',
      playbackUrl: 'https://media.example/private.m3u8',
      cameraName: 'Court 1',
    });

    await expect(
      service.getStandaloneMatchPlayback('match-1', unrelatedUser),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows a JOINED member to watch a PRIVATE community stream', async () => {
    const { repository, service } = makeService();
    repository.findStandaloneMatchPlayback.mockResolvedValue({
      communityVisibility: 'RESTRICTED',
      memberStatus: 'JOINED',
      status: 'ONGOING',
      playbackUrl: 'https://media.example/private.m3u8',
      cameraName: 'Court 1',
    });

    await expect(
      service.getStandaloneMatchPlayback('match-1', owner),
    ).resolves.toMatchObject({
      streamStatus: 'LIVE',
      playbackUrl: 'https://media.example/private.m3u8',
    });
  });

  it('allows an ADMIN to watch a restricted community stream', async () => {
    const { repository, service } = makeService();
    repository.findStandaloneMatchPlayback.mockResolvedValue({
      communityVisibility: 'RESTRICTED',
      memberStatus: null,
      status: 'ONGOING',
      playbackUrl: 'https://media.example/private.m3u8',
      cameraName: 'Court 1',
    });
    const admin: JwtPayload = {
      sub: 'admin-1',
      email: 'admin@example.com',
      roles: ['ADMIN'],
    };

    await expect(
      service.getStandaloneMatchPlayback('match-1', admin),
    ).resolves.toMatchObject({
      streamStatus: 'LIVE',
      playbackUrl: 'https://media.example/private.m3u8',
    });
  });

  it('withholds a configured URL until the match is ONGOING', async () => {
    const { repository, service } = makeService();
    repository.findStandaloneMatchPlayback.mockResolvedValue({
      communityVisibility: 'PUBLIC',
      memberStatus: null,
      status: 'SCHEDULED',
      playbackUrl: 'https://media.example/live/index.m3u8',
      cameraName: 'Court 1',
    });

    await expect(
      service.getStandaloneMatchPlayback('match-1', undefined),
    ).resolves.toEqual({
      matchId: 'match-1',
      streamStatus: 'OFFLINE',
      playbackUrl: null,
    });
  });

  it('returns null when the match is not standalone for existing playback routing', async () => {
    const { repository, service } = makeService();
    repository.findStandaloneMatchPlayback.mockResolvedValue(null);

    await expect(
      service.getStandaloneMatchPlayback('match-1', undefined),
    ).resolves.toBeNull();
  });
});

describe('LivestreamService match recording catalog', () => {
  const catalog = (service: LivestreamService) =>
    service as LivestreamService & RecordingCatalogService;

  it('authorizes the match before any provider catalog read', async () => {
    const { repository, recordingService, service } = makeService(
      cameraStreamForRecording,
    );
    repository.findMatchWithTournament.mockResolvedValue({
      ...match,
      refereeId: 'another-referee',
    });

    await expect(
      catalog(service).listMatchRecordingDays('match-1', unrelatedUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      catalog(service).listMatchRecordings(
        'match-1',
        '2026-10-09',
        unrelatedUser,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.findMatchLivestream).not.toHaveBeenCalled();
    expect(recordingService.listRecordDays).not.toHaveBeenCalled();
    expect(recordingService.listRecordFiles).not.toHaveBeenCalled();
  });

  it('returns valid unique days newest first for an assigned referee', async () => {
    const { recordingService, service } = makeService(cameraStreamForRecording);
    recordingService.listRecordDays.mockResolvedValue([
      '2026-10-01',
      'not-a-date',
      '2026-10-03',
      '2026-02-30',
      '2026-10-03',
      '2026-13-01',
      '2026-09-30',
    ]);

    await expect(
      catalog(service).listMatchRecordingDays('match-1', assignedReferee),
    ).resolves.toEqual(['2026-10-03', '2026-10-01', '2026-09-30']);
    expect(recordingService.listRecordDays).toHaveBeenCalledWith(
      'camera-stream',
    );
  });

  it.each(['2026-2-09', '2026-02-30', '2026-13-01', '2026-10-09T00:00:00Z'])(
    'rejects invalid recording period %s before provider access',
    async (period) => {
      const { recordingService, service } = makeService(
        cameraStreamForRecording,
      );

      await expect(
        catalog(service).listMatchRecordings('match-1', period, owner),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(recordingService.listRecordFiles).not.toHaveBeenCalled();
    },
  );

  it('returns only safe MP4 basenames and non-negative safe integer sizes', async () => {
    const { recordingService, service } = makeService(cameraStreamForRecording);
    const providerFileWithMetadata = {
      name: '20261009_120000.mp4',
      sizeBytes: 1024,
      rootPath: 'fixture-private-root',
      providerPayload: { source: 'fixture-only' },
    };
    recordingService.listRecordFiles.mockResolvedValue([
      providerFileWithMetadata,
      { name: 'size-zero.mp4', sizeBytes: 0 },
      { name: 'size-unknown.mp4' },
      { name: '../private.mp4', sizeBytes: 5 },
      { name: 'folder/file.mp4', sizeBytes: 5 },
      { name: 'folder\\private.mp4', sizeBytes: 5 },
      { name: 'not-video.mov', sizeBytes: 5 },
      { name: 'control\u0000.mp4', sizeBytes: 5 },
      { name: 'negative.mp4', sizeBytes: -1 },
      { name: 'fractional.mp4', sizeBytes: 0.5 },
      { name: 'unsafe-integer.mp4', sizeBytes: Number.MAX_SAFE_INTEGER + 1 },
      { name: 'drive:private.mp4', sizeBytes: 5 },
      { name: null as unknown as string, sizeBytes: 5 },
      { name: 'wildcard?.mp4', sizeBytes: 5 },
    ]);

    await expect(
      catalog(service).listMatchRecordings('match-1', '2026-10-09', owner),
    ).resolves.toEqual([
      { name: '20261009_120000.mp4', sizeBytes: 1024 },
      { name: 'size-zero.mp4', sizeBytes: 0 },
      { name: 'size-unknown.mp4' },
      { name: 'negative.mp4' },
      { name: 'fractional.mp4' },
      { name: 'unsafe-integer.mp4' },
    ]);
    expect(recordingService.listRecordFiles).toHaveBeenCalledWith(
      'camera-stream',
      '2026-10-09',
    );
  });

  it('returns empty results and does not call the provider without a camera', async () => {
    const noCamera = makeService(null);
    await expect(
      catalog(noCamera.service).listMatchRecordingDays('match-1', owner),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(noCamera.recordingService.listRecordDays).not.toHaveBeenCalled();

    const emptyCatalog = makeService(cameraStreamForRecording);
    await expect(
      catalog(emptyCatalog.service).listMatchRecordingDays('match-1', owner),
    ).resolves.toEqual([]);
    expect(emptyCatalog.recordingService.listRecordDays).toHaveBeenCalledTimes(
      1,
    );
  });

  it('maps provider listing failures to a generic 503 without exposing the cause', async () => {
    const secretProviderMessage = 'provider-credential-or-rootPath';
    const { recordingService, service } = makeService(
      cameraStreamForRecording,
    );
    recordingService.listRecordDays.mockRejectedValue(
      new AqvisionApiException(-1, secretProviderMessage),
    );
    recordingService.listRecordFiles.mockRejectedValue(
      new AqvisionApiException(-1, secretProviderMessage),
    );

    for (const error of [
      await catalog(service)
        .listMatchRecordingDays('match-1', owner)
        .catch((caught: unknown) => caught),
      await catalog(service)
        .listMatchRecordings('match-1', '2026-10-09', owner)
        .catch((caught: unknown) => caught),
    ]) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getStatus()).toBe(503);
      expect(
        JSON.stringify(
          (error as ServiceUnavailableException).getResponse(),
        ),
      ).not.toContain(secretProviderMessage);
    }
  });
});
