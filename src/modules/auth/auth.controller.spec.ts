import { HttpException, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OAuthProfileDto } from './dto/oauth-profile.dto';

describe('AuthController Google callback', () => {
  const profile: OAuthProfileDto = {
    provider: 'GOOGLE',
    providerUserId: 'google-user-id',
    email: 'player@example.invalid',
  };

  function createController(oauthLogin: jest.Mock) {
    const authService = { oauthLogin } as unknown as AuthService;
    const configService = {
      get: jest.fn().mockReturnValue('http://localhost:3001'),
    } as unknown as ConfigService;
    const controller = new AuthController(authService, configService);
    const loggerError = jest
      .spyOn(Reflect.get(controller, 'logger') as Logger, 'error')
      .mockImplementation(() => undefined);
    const request = {
      user: profile,
      headers: { 'user-agent': 'test' },
      ip: '127.0.0.1',
    } as unknown as Request & { user: OAuthProfileDto };
    const redirect = jest.fn();
    const response = { headersSent: false, redirect } as unknown as Response;

    return { controller, request, response, redirect, loggerError };
  }

  it('does not include database query details in the frontend redirect', async () => {
    const oauthLogin = jest
      .fn()
      .mockRejectedValue(
        Object.assign(
          new Error('Failed query: select * from auth_providers; params: private-provider-id'),
          { code: '42P01' },
        ),
      );
    const { controller, request, response, redirect, loggerError } =
      createController(oauthLogin);

    await controller.googleCallback(request, response);

    const redirectUrl = redirect.mock.calls[0][0] as string;
    expect(redirectUrl).toContain(
      encodeURIComponent('Đăng nhập Google không thành công. Vui lòng thử lại.'),
    );
    expect(redirectUrl).not.toContain('Failed query');
    expect(redirectUrl).not.toContain('private-provider-id');
    const diagnosticLog = loggerError.mock.calls[0][1] as string;
    expect(diagnosticLog).toContain('42P01');
    expect(diagnosticLog).not.toContain('private-provider-id');
  });

  it('keeps intentional authentication errors readable', async () => {
    const oauthLogin = jest
      .fn()
      .mockRejectedValue(new UnauthorizedException('Email chưa được xác minh.'));
    const { controller, request, response, redirect } =
      createController(oauthLogin);

    await controller.googleCallback(request, response);

    expect(redirect.mock.calls[0][0]).toContain(
      encodeURIComponent('Email chưa được xác minh.'),
    );
  });
});
