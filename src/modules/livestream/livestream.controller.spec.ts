import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import {
  HEADERS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
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
  };
  const controller = new LivestreamController(
    livestreamService as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    livestreamService.getMatchStreamControlState.mockResolvedValue(expected);
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
