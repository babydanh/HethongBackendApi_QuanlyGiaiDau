import { Injectable, ExecutionContext, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  private readonly logger = new Logger(GoogleAuthGuard.name);

  constructor(private configService: ConfigService) {
    super();
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err || !user) {
      this.logger.error('Google OAuth error in guard:', {
        err: err?.message || err,
        info: info?.message || info,
      });

      const response = context.switchToHttp().getResponse<Response>();
      const frontendUrl =
        this.configService.get<string>('FRONTEND_URL') ||
        this.configService.get<string>('auth.frontendUrl') ||
        'https://sporto.asia';

      const rawMsg =
        err?.message ||
        (typeof info === 'object' ? info?.message : info) ||
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
      return null;
    }
    return user;
  }
}

