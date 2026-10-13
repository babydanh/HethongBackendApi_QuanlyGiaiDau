import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import type { ConfigService } from '@nestjs/config';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AssignCameraCourtDto } from './dto/assign-camera-court.dto';
import type { CameraLeaseHandle } from './livestream-health.queue';
import { LivestreamService } from './livestream.service';

const owner: JwtPayload = {
  sub: 'owner-1',
  email: 'owner@example.com',
  role: 'USER',
  roles: [],
};
const stranger: JwtPayload = {
  sub: 'stranger-1',
  email: 'stranger@example.com',
  role: 'USER',
  roles: [],
};

const baseCamera = {
  id: 'camera-1',
  tournamentId: 'tournament-1',
  courtId: 'court-a' as string | null,
  name: 'danh',
  mode: 'PUSH',
  protocol: 'RTMP',
  streamName: 'camera_abc',
  status: 'IDLE',
  playbackUrl: 'https://media.aqvision.net/live/camera_abc/hls.m3u8',
  createdAt: new Date('2026-10-13T00:00:00Z'),
  updatedAt: new Date('2026-10-13T00:00:00Z'),
  aqpStreamKeyId: null,
};

type Options = {
  camera?: typeof baseCamera | null;
  courtTournamentIds?: string[];
  hasLiveMatch?: boolean;
  oldCourtIdleMatches?: string[];
  remainingOldCourtCamera?: { id: string; playbackUrl: string | null } | null;
  newCourtMatchesWithoutCamera?: string[];
  lock?: 'owned' | 'busy' | 'lost';
};

function makeService(options: Options = {}) {
  const camera = options.camera === undefined ? baseCamera : options.camera;
  const repository = {
    findCameraById: jest.fn().mockResolvedValue(camera),
    findTournamentById: jest
      .fn()
      .mockResolvedValue({ id: 'tournament-1', createdBy: owner.sub }),
    isTournamentStaff: jest.fn().mockResolvedValue(false),
    findTournamentIdsUsingCourt: jest
      .fn()
      .mockResolvedValue(options.courtTournamentIds ?? ['tournament-1']),
    hasLiveMatchOnCamera: jest.fn().mockResolvedValue(options.hasLiveMatch ?? false),
    updateCameraCourt: jest
      .fn()
      .mockImplementation((_id: string, courtId: string | null) =>
        Promise.resolve({ ...baseCamera, courtId }),
      ),
    listIdleMatchIdsUsingCameraOnCourt: jest
      .fn()
      .mockResolvedValue(options.oldCourtIdleMatches ?? []),
    findActiveCameraByCourt: jest
      .fn()
      .mockResolvedValue(options.remainingOldCourtCamera ?? null),
    listMatchIdsWithoutCameraOnCourt: jest
      .fn()
      .mockResolvedValue(options.newCourtMatchesWithoutCamera ?? []),
    assignCameraToMatch: jest.fn().mockResolvedValue({}),
    clearMatchCamera: jest.fn().mockResolvedValue({}),
  };
  const lock = options.lock ?? 'owned';
  const livestreamHealthQueue = {
    runWithCameraLock: jest.fn(
      (
        cameraId: string,
        operation: (lease: CameraLeaseHandle) => Promise<unknown>,
      ) =>
        lock === 'busy'
          ? Promise.resolve(null)
          : operation({ cameraId, isOwned: () => lock === 'owned' }),
    ),
  };
  const configService = {
    get: jest.fn((key: string, fallback?: unknown) =>
      key === 'AQVISION_PLAYBACK_BASE_URL'
        ? 'https://media.aqvision.net'
        : fallback,
    ),
  } as unknown as ConfigService;
  const Ctor = LivestreamService as unknown as {
    new (...args: unknown[]): LivestreamService;
  };
  const service = new Ctor(
    repository,
    configService,
    {},
    {},
    {},
    livestreamHealthQueue,
    { encrypt: jest.fn(), decrypt: jest.fn() },
  );
  return { service, repository, livestreamHealthQueue };
}

describe('LivestreamService.assignCameraCourt', () => {
  it('rejects a missing camera without changing anything', async () => {
    const { service, repository } = makeService({ camera: null });

    await expect(
      service.assignCameraCourt('camera-1', owner, { courtId: 'court-b' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.updateCameraCourt).not.toHaveBeenCalled();
  });

  it('rejects a user who does not operate the tournament', async () => {
    const { service, repository } = makeService();

    await expect(
      service.assignCameraCourt('camera-1', stranger, { courtId: 'court-b' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.updateCameraCourt).not.toHaveBeenCalled();
  });

  it('rejects a court that belongs to another tournament or does not exist', async () => {
    const other = makeService({ courtTournamentIds: ['tournament-2'] });
    await expect(
      other.service.assignCameraCourt('camera-1', owner, { courtId: 'court-b' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(other.repository.updateCameraCourt).not.toHaveBeenCalled();

    const missing = makeService({ courtTournamentIds: [] });
    await expect(
      missing.service.assignCameraCourt('camera-1', owner, { courtId: 'court-b' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(missing.repository.updateCameraCourt).not.toHaveBeenCalled();
  });

  it('refuses a PULL camera, whose court comes from the court playback URL', async () => {
    const { service, repository } = makeService({
      camera: { ...baseCamera, mode: 'PULL' },
    });

    await expect(
      service.assignCameraCourt('camera-1', owner, { courtId: 'court-b' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.updateCameraCourt).not.toHaveBeenCalled();
  });

  it('returns the camera unchanged, without locking or writing, when the court is the same', async () => {
    const { service, repository, livestreamHealthQueue } = makeService();

    const result = await service.assignCameraCourt('camera-1', owner, {
      courtId: 'court-a',
    });

    expect(result).toMatchObject({ id: 'camera-1', courtId: 'court-a' });
    expect(livestreamHealthQueue.runWithCameraLock).not.toHaveBeenCalled();
    expect(repository.updateCameraCourt).not.toHaveBeenCalled();
  });

  it('refuses to move a camera that is streaming a LIVE match', async () => {
    const { service, repository } = makeService({ hasLiveMatch: true });

    await expect(
      service.assignCameraCourt('camera-1', owner, { courtId: 'court-b' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.updateCameraCourt).not.toHaveBeenCalled();
  });

  it('answers 503 and writes nothing when the camera is busy or the lock is lost', async () => {
    const busy = makeService({ lock: 'busy' });
    await expect(
      busy.service.assignCameraCourt('camera-1', owner, { courtId: 'court-b' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(busy.repository.updateCameraCourt).not.toHaveBeenCalled();

    const lost = makeService({ lock: 'lost' });
    await expect(
      lost.service.assignCameraCourt('camera-1', owner, { courtId: 'court-b' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(lost.repository.updateCameraCourt).not.toHaveBeenCalled();
  });

  it('moves the camera: idle matches left on the old court fall back to its other camera and matches without a camera on the new court adopt this one', async () => {
    const { service, repository } = makeService({
      oldCourtIdleMatches: ['m-old-1', 'm-old-2'],
      remainingOldCourtCamera: {
        id: 'camera-2',
        playbackUrl: 'https://media.aqvision.net/live/camera_two/hls.m3u8',
      },
      newCourtMatchesWithoutCamera: ['m-new-1'],
    });

    const result = await service.assignCameraCourt('camera-1', owner, {
      courtId: 'court-b',
    });

    expect(result).toMatchObject({ id: 'camera-1', courtId: 'court-b' });
    expect(repository.updateCameraCourt).toHaveBeenCalledWith('camera-1', 'court-b');
    expect(repository.listIdleMatchIdsUsingCameraOnCourt).toHaveBeenCalledWith(
      'camera-1',
      'court-a',
      'tournament-1',
    );
    expect(repository.assignCameraToMatch).toHaveBeenCalledWith(
      'm-old-1',
      'camera-2',
      'https://media.aqvision.net/live/camera_two/hls.m3u8',
    );
    expect(repository.assignCameraToMatch).toHaveBeenCalledWith(
      'm-old-2',
      'camera-2',
      'https://media.aqvision.net/live/camera_two/hls.m3u8',
    );
    expect(repository.assignCameraToMatch).toHaveBeenCalledWith(
      'm-new-1',
      'camera-1',
      'https://media.aqvision.net/live/camera_abc/hls.m3u8',
    );
    expect(repository.clearMatchCamera).not.toHaveBeenCalled();
  });

  it('un-binds idle matches of the old court when no other camera is left there', async () => {
    const { service, repository } = makeService({
      oldCourtIdleMatches: ['m-old-1'],
      remainingOldCourtCamera: null,
    });

    await service.assignCameraCourt('camera-1', owner, { courtId: 'court-b' });

    expect(repository.clearMatchCamera).toHaveBeenCalledWith('m-old-1');
    expect(repository.assignCameraToMatch).not.toHaveBeenCalledWith(
      'm-old-1',
      expect.anything(),
      expect.anything(),
    );
  });

  it('clearing the court releases the old court and never backfills a new one', async () => {
    const { service, repository } = makeService({
      oldCourtIdleMatches: ['m-old-1'],
      newCourtMatchesWithoutCamera: ['must-not-be-touched'],
    });

    const result = await service.assignCameraCourt('camera-1', owner, {
      courtId: null,
    });

    expect(result).toMatchObject({ id: 'camera-1', courtId: null });
    expect(repository.updateCameraCourt).toHaveBeenCalledWith('camera-1', null);
    expect(repository.clearMatchCamera).toHaveBeenCalledWith('m-old-1');
    expect(repository.listMatchIdsWithoutCameraOnCourt).not.toHaveBeenCalled();
    expect(repository.assignCameraToMatch).not.toHaveBeenCalled();
  });

  it('a camera that was on no court has no old court to release', async () => {
    const { service, repository } = makeService({
      camera: { ...baseCamera, courtId: null },
      newCourtMatchesWithoutCamera: ['m-new-1'],
    });

    await service.assignCameraCourt('camera-1', owner, { courtId: 'court-b' });

    expect(repository.listIdleMatchIdsUsingCameraOnCourt).not.toHaveBeenCalled();
    expect(repository.assignCameraToMatch).toHaveBeenCalledWith(
      'm-new-1',
      'camera-1',
      expect.any(String),
    );
  });
});

describe('AssignCameraCourtDto', () => {
  const errorsFor = (payload: Record<string, unknown>) =>
    validateSync(plainToInstance(AssignCameraCourtDto, payload));

  it('accepts a UUID or an explicit null', () => {
    expect(errorsFor({ courtId: '3f0f6b52-2c7a-4a64-9d4e-7a0b5cb0a111' })).toHaveLength(0);
    expect(errorsFor({ courtId: null })).toHaveLength(0);
  });

  it('rejects a missing field, so an empty body cannot silently un-assign the court', () => {
    expect(errorsFor({}).length).toBeGreaterThan(0);
  });

  it('rejects a value that is not a UUID', () => {
    expect(errorsFor({ courtId: 'court-b' }).length).toBeGreaterThan(0);
  });
});
