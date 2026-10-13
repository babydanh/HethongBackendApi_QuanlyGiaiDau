import { Injectable, ExecutionContext, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  private readonly logger = new Logger(GoogleAuthGuard.name);

  constructor(private configService: ConfigService) {
    super();
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    if (err || !user) {
      const error =
        typeof err === 'object' && err !== null
          ? (err as {
              name?: unknown;
              code?: unknown;
              cause?: { code?: unknown };
            })
          : undefined;
      const errorCode = [error?.code, error?.cause?.code].find(
        (code): code is string =>
          typeof code === 'string' && /^[A-Z0-9]{5}$/.test(code),
      );
      const rawMsg =
        error && 'message' in error && typeof error.message === 'string'
          ? error.message
          : typeof info === 'string'
            ? info
            : info && typeof info.message === 'string'
              ? info.message
              : typeof request.query?.error === 'string'
                ? request.query.error
                : '';

      this.logger.error('Google OAuth authentication failed', {
        errorName: typeof error?.name === 'string' ? error.name : undefined,
        errorCode,
        hasCode:
          typeof request.query.code === 'string' &&
          request.query.code.length > 0,
        path: request.path,
      });

      if (!response.headersSent) {
        const frontendUrl =
          this.configService.get<string>('FRONTEND_URL') ||
          this.configService.get<string>('auth.frontendUrl') ||
          'https://sporto.asia';
        let errorMessage =
          'Đăng nhập Google không thành công. Vui lòng thử lại.';
        if (rawMsg.includes('access_denied')) {
          errorMessage = 'Bạn đã hủy đăng nhập Google.';
        } else if (rawMsg.includes('redirect_uri_mismatch')) {
          errorMessage =
            'Lỗi cấu hình Redirect URI trên Google Cloud Console.';
        }

        response.redirect(
          `${frontendUrl}/login?error=${encodeURIComponent(errorMessage)}`,
        );
      }
      // Throw exception to stop NestJS from continuing to controller and causing ERR_HTTP_HEADERS_SENT
      throw new UnauthorizedException('Google OAuth failed');
    }
    return user;
  }
}
