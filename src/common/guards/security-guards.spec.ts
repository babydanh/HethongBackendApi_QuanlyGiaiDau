import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppKeyGuard } from './app-key.guard';
import { VerifiedGuard } from './verified.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SKIP_APP_KEY } from '../decorators/skip-app-key.decorator';
import { VERIFIED_KEY } from '../decorators/verified.decorator';

const createContext = (options: {
  path?: string;
  method?: string;
  headers?: Record<string, string>;
  user?: Record<string, unknown>;
}) => {
  const handler = {};
  const controller = {};
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => ({
        path: options.path ?? '/api/v1/protected',
        method: options.method ?? 'GET',
        headers: options.headers ?? {},
        user: options.user,
      }),
    }),
  } as unknown as ExecutionContext;
};

describe('AppKeyGuard', () => {
  const createReflector = () =>
    ({
      getAllAndOverride: jest.fn((key: string) => {
        if (key === IS_PUBLIC_KEY || key === SKIP_APP_KEY) return false;
        return undefined;
      }),
    }) as unknown as Reflector;

  it('rejects production startup configuration when the key is missing', () => {
    const guard = new AppKeyGuard(
      createReflector(),
      { get: jest.fn((key: string) => (key === 'NODE_ENV' ? 'production' : undefined)) } as unknown as ConfigService,
    );

    expect(() => guard.canActivate(createContext({}))).toThrow(
      'APP_API_KEY is required in production',
    );
  });

  it('does not treat a caller-controlled official-looking origin as authentication', () => {
    const guard = new AppKeyGuard(
      createReflector(),
      {
        get: jest.fn((key: string) => {
          if (key === 'APP_API_KEY') return 'server-secret-123456';
          return 'production';
        }),
      } as unknown as ConfigService,
    );

    expect(() =>
      guard.canActivate(
        createContext({
          headers: { origin: 'https://sporto.asia.attacker.example' },
        }),
      ),
    ).toThrow('Invalid App Key');
  });

  it('accepts the exact configured app key', () => {
    const guard = new AppKeyGuard(
      createReflector(),
      {
        get: jest.fn((key: string) => {
          if (key === 'APP_API_KEY') return 'server-secret-123456';
          return 'production';
        }),
      } as unknown as ConfigService,
    );

    expect(
      guard.canActivate(
        createContext({ headers: { 'x-app-key': 'server-secret-123456' } }),
      ),
    ).toBe(true);
  });
});

describe('VerifiedGuard', () => {
  const createReflector = (isVerifiedRoute: boolean) =>
    ({
      getAllAndOverride: jest.fn((key: string) => {
        if (key === VERIFIED_KEY) return isVerifiedRoute;
        if (key === IS_PUBLIC_KEY) return false;
        return false;
      }),
    }) as unknown as Reflector;

  it('rejects an authenticated user whose email is not verified', () => {
    const guard = new VerifiedGuard(createReflector(true));

    expect(() =>
      guard.canActivate(
        createContext({ user: { isEmailVerified: false, isMock: false } }),
      ),
    ).toThrow('Email verification is required');
  });

  it('accepts a verified user and preserves the mock-account exception', () => {
    const verifiedGuard = new VerifiedGuard(createReflector(true));
    expect(
      verifiedGuard.canActivate(
        createContext({ user: { isEmailVerified: true, isMock: false } }),
      ),
    ).toBe(true);

    const mockGuard = new VerifiedGuard(createReflector(true));
    expect(
      mockGuard.canActivate(
        createContext({ user: { isEmailVerified: false, isMock: true } }),
      ),
    ).toBe(true);
  });
});
