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
      this.logger.error('Google OAuth error in guard:', {
        err: err?.message || err,
        info: info?.message || info,
        query: request.query,
        url: request.url,
      });

      if (!response.headersSent) {
        const frontendUrl =
          this.configService.get<string>('FRONTEND_URL') ||
          this.configService.get<string>('auth.frontendUrl') ||
          'https://sporto.asia';

        const rawMsg =
          err?.message ||
          (typeof info === 'object' ? info?.message : info) ||
          (typeof request.query?.error === 'string' ? request.query.error : '') ||
          '';

        let errorMessage = 'Đăng nhập Google không thành công. Vui lòng thử lại.';
        if (rawMsg.includes('access_denied')) {
          errorMessage = 'Bạn đã hủy đăng nhập Google.';
        } else if (rawMsg.includes('redirect_uri_mismatch')) {
          errorMessage = 'Lỗi cấu hình Redirect URI trên Google Cloud Console.';
        } else if (rawMsg) {
          errorMessage = `Lỗi xác thực Google: ${rawMsg}`;
        }

        response.redirect(
          `${frontendUrl}/login?error=${encodeURIComponent(errorMessage)}`,
        );
      }
      // Throw exception to stop NestJS from continuing to controller and causing ERR_HTTP_HEADERS_SENT
      throw new UnauthorizedException(err?.message || 'Google OAuth failed');
    }
    return user;
  }
}

