import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import {
  HEADERS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  GUARDS_METADATA,
} from '@nestjs/common/constants';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { LivestreamController } from './livestream.controller';

describe('LivestreamController match stream control state route', () => {
  const user: JwtPayload = {
    sub: 'referee-1',
    email: 'referee@example.com',
    role: 'REFEREE',
    roles: ['REFEREE'],
  };
  const expected = {
    matchId: 'match-1',
    hasCamera: true,
    streamStatus: 'LIVE',
  };
  const livestreamService = {
    getMatchStreamControlState: jest.fn(),
    getStandaloneMatchPlayback: jest.fn(),
    getMatchPlayback: jest.fn(),
  };
  const liveSessionService = { getMatchPlayback: jest.fn() };
  const controller = new LivestreamController(
    livestreamService as never,
    liveSessionService as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    livestreamService.getMatchStreamControlState.mockResolvedValue(expected);
    livestreamService.getStandaloneMatchPlayback.mockResolvedValue(null);
  });

  it('forwards the match and authenticated user to the service', async () => {
    await expect(
      controller.getMatchStreamControlState('match-1', user),
    ).resolves.toEqual(expected);
    expect(livestreamService.getMatchStreamControlState).toHaveBeenCalledWith(
      'match-1',
      user,
    );
  });

  it('resolves standalone playback before provider and tournament playback', async () => {
    const playback = {
      matchId: 'match-1',
      streamStatus: 'LIVE',
      playbackUrl: 'https://media.example/live/index.m3u8',
    };
    livestreamService.getStandaloneMatchPlayback.mockResolvedValue(playback);

    await expect(controller.getMatchPlayback('match-1', user)).resolves.toEqual(
      playback,
    );
    expect(livestreamService.getStandaloneMatchPlayback).toHaveBeenCalledWith(
      'match-1',
      user,
    );
    expect(liveSessionService.getMatchPlayback).not.toHaveBeenCalled();
    expect(livestreamService.getMatchPlayback).not.toHaveBeenCalled();
  });

  it('continues provider playback routing when the match is not standalone', async () => {
    const playback = {
      matchId: 'match-1',
      streamStatus: 'LIVE',
      playbackUrl: 'https://provider.example/replay.m3u8',
    };
    liveSessionService.getMatchPlayback.mockResolvedValue(playback);

    await expect(
      controller.getMatchPlayback('match-1', undefined),
    ).resolves.toEqual(playback);
    expect(livestreamService.getStandaloneMatchPlayback).toHaveBeenCalledWith(
      'match-1',
      undefined,
    );
    expect(liveSessionService.getMatchPlayback).toHaveBeenCalledWith('match-1');
    expect(livestreamService.getMatchPlayback).not.toHaveBeenCalled();
  });

  it('keeps playback public and optionally authenticates members', () => {
    const handler = Object.getOwnPropertyDescriptor(
      LivestreamController.prototype,
      'getMatchPlayback',
    )?.value;

    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
      OptionalJwtAuthGuard,
    );
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
  });

  it('declares an authenticated GET route with private no-store caching', () => {
    const handler = Object.getOwnPropertyDescriptor(
      LivestreamController.prototype,
      'getMatchStreamControlState',
    )?.value;

    expect(handler).toBeDefined();
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      'matches/:matchId/control-state',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
  });
});
