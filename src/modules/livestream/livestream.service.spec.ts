import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AqvisionApiClient } from './aqvision-api.client';
import { AqvisionPublishService } from './aqvision-publish.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { LivestreamRepository } from './livestream.repository';
import { LivestreamService } from './livestream.service';

type RepositoryMock = {
  findMatchWithTournament: jest.Mock;
  isTournamentStaff: jest.Mock;
  findMatchLivestream: jest.Mock;
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
};

function makeService(stream: unknown = null) {
  const repository: RepositoryMock = {
    findMatchWithTournament: jest.fn().mockResolvedValue({ ...match }),
    isTournamentStaff: jest.fn().mockResolvedValue(false),
    findMatchLivestream: jest.fn().mockResolvedValue(stream),
  };
  const service = new LivestreamService(
    repository as unknown as LivestreamRepository,
    {} as ConfigService,
    {} as AqvisionPublishService,
    {} as AqvisionApiClient,
  );
  return { repository, service };
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
