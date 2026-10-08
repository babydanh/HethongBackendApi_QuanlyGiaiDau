import { ForbiddenException, NotFoundException } from '@nestjs/common';
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
  findStandaloneMatchPlayback: jest.Mock;
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
    findStandaloneMatchPlayback: jest.fn().mockResolvedValue(null),
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
