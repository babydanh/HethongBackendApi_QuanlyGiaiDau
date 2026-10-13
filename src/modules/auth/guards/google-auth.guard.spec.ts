import { ExecutionContext, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuthGuard } from './google-auth.guard';

describe('GoogleAuthGuard', () => {
  it('hides database query details from the OAuth redirect and logs only the SQLSTATE', () => {
    const configService = {
      get: jest.fn().mockReturnValue('https://sporto.asia'),
    } as unknown as ConfigService;
    const guard = new GoogleAuthGuard(configService);
    const loggerError = jest
      .spyOn(Reflect.get(guard, 'logger') as Logger, 'error')
      .mockImplementation(() => undefined);
    const sqlError = Object.assign(
      new Error('Failed query: select * from auth_providers; params: GOOGLE, private-provider-id'),
      { code: '42P01' },
    );
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

    expect(() => guard.handleRequest(sqlError, false, undefined, context)).toThrow(
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
    const redirectUrl = (response.redirect as jest.Mock).mock.calls[0][0] as string;
    expect(redirectUrl).not.toContain('Failed query');
    expect(redirectUrl).not.toContain('private-provider-id');
    expect(JSON.stringify(loggedDetails)).not.toContain('private-provider-id');
    expect(loggedDetails).toMatchObject({
      errorCode: '42P01',
    });
  });
});
