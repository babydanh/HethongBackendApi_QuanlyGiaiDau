import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AqvisionApiClient } from './aqvision-api.client';
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
  };
  const recordingService = {
    reconcileCamera: jest.fn().mockResolvedValue('RECORDING'),
  };
  const livestreamHealthQueue = {
    runWithCameraLock: jest.fn(
      async (
        cameraId: string,
        operation: (lease: CameraLeaseHandle) => Promise<unknown>,
      ) => operation({ cameraId, isOwned: () => true }),
    ),
  };
  const service = new LivestreamService(
    repository as unknown as LivestreamRepository,
    {} as ConfigService,
    {} as AqvisionPublishService,
    {} as AqvisionApiClient,
    recordingServiceOverride ??
      (recordingService as unknown as AqvisionRecordingService),
    livestreamHealthQueue as unknown as LivestreamHealthQueue,
  );
  return {
    repository,
    service,
    recordingService,
    livestreamHealthQueue,
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
