import { ConfigService } from '@nestjs/config';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { GoogleAuthGuard } from './google-auth.guard';

describe('GoogleAuthGuard', () => {
  it('does not log the OAuth authorization code on callback failure', () => {
    const configService = {
      get: jest.fn().mockReturnValue('https://sporto.asia'),
    } as unknown as ConfigService;
    const guard = new GoogleAuthGuard(configService);
    const loggerError = jest
      .spyOn((guard as any).logger, 'error')
      .mockImplementation(() => undefined);
    const request = {
      query: { code: 'one-time-secret-code', scope: 'email' },
      path: '/api/v1/auth/google/callback',
      url: '/api/v1/auth/google/callback?code=one-time-secret-code',
    };
    const response = {
      headersSent: false,
      redirect: jest.fn(),
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;

    expect(() => guard.handleRequest(null, false, undefined, context)).toThrow(
      UnauthorizedException,
    );

    const loggedDetails = loggerError.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(loggedDetails).toMatchObject({
      hasCode: true,
      path: '/api/v1/auth/google/callback',
    });
    expect(loggedDetails).not.toHaveProperty('query');
    expect(JSON.stringify(loggedDetails)).not.toContain('one-time-secret-code');
  });
});
