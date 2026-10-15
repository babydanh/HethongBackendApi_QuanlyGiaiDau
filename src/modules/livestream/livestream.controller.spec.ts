import 'reflect-metadata';
import { ForbiddenException, RequestMethod } from '@nestjs/common';
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

  it.each([
    ['getMatchRecordingDays', 'matches/:matchId/recording-days'],
    ['getMatchRecordings', 'matches/:matchId/recordings'],
    ['getMatchRecordingPlaylist', 'matches/:matchId/recordings/playlist'],
  ])('declares %s as an authenticated private GET route', (method, route) => {
    const handler = Object.getOwnPropertyDescriptor(
      LivestreamController.prototype,
      method,
    )?.value as object | undefined;

    if (!handler) throw new Error(`Missing controller handler: ${method}`);

    const path = Reflect.getMetadata(PATH_METADATA, handler) as
      | string
      | undefined;
    const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler) as
      | RequestMethod
      | undefined;
    const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, handler) as
      | boolean
      | undefined;
    const headers = Reflect.getMetadata(HEADERS_METADATA, handler) as
      | { name: string; value: string }[]
      | undefined;

    expect(path).toBe(route);
    expect(requestMethod).toBe(RequestMethod.GET);
    expect(isPublic).not.toBe(true);
    expect(headers).toContainEqual({
      name: 'Cache-Control',
      value: 'private, no-store',
    });
  });
});

describe('LivestreamController match recording playlist route', () => {
  const user: JwtPayload = {
    sub: 'btc-1',
    email: 'btc@example.com',
    role: 'USER',
    roles: [],
  };
  const playlist = {
    period: '2026-10-15',
    expiresAt: '2026-10-15T16:22:00.000Z',
    segments: [],
  };
  const livestreamService = { getMatchRecordingPlaylist: jest.fn() };
  const controller = new LivestreamController(
    livestreamService as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it('sets the sporto_rec cookie scoped to the recordings path and returns the playlist', async () => {
    process.env.NODE_ENV = 'development';
    livestreamService.getMatchRecordingPlaylist.mockResolvedValue({
      playlist,
      sessionCookie: 'session-value',
    });
    const res = { cookie: jest.fn() };

    await expect(
      controller.getMatchRecordingPlaylist('match-1', '2026-10-15', user, res as never),
    ).resolves.toEqual(playlist);
    expect(livestreamService.getMatchRecordingPlaylist).toHaveBeenCalledWith(
      'match-1',
      '2026-10-15',
      user,
    );
    expect(res.cookie).toHaveBeenCalledWith('sporto_rec', 'session-value', {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/api/v1/livestream/recordings',
      maxAge: 600_000,
    });
  });

  it('marks the cookie Secure in production', async () => {
    process.env.NODE_ENV = 'production';
    livestreamService.getMatchRecordingPlaylist.mockResolvedValue({
      playlist,
      sessionCookie: 'session-value',
    });
    const res = { cookie: jest.fn() };

    await controller.getMatchRecordingPlaylist('match-1', '2026-10-15', user, res as never);
    expect(res.cookie).toHaveBeenCalledWith(
      'sporto_rec',
      'session-value',
      expect.objectContaining({ secure: true }),
    );
  });

  it('sets no cookie when the service refuses the caller', async () => {
    livestreamService.getMatchRecordingPlaylist.mockRejectedValue(
      new ForbiddenException(),
    );
    const res = { cookie: jest.fn() };

    await expect(
      controller.getMatchRecordingPlaylist('match-1', '2026-10-15', user, res as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(res.cookie).not.toHaveBeenCalled();
  });
});
