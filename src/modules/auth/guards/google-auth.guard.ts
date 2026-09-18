import { Injectable, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private configService: ConfigService) {
    super();
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err || !user) {
      const response = context.switchToHttp().getResponse<Response>();
      const frontendUrl =
        this.configService.get<string>('FRONTEND_URL') ||
        this.configService.get<string>('auth.frontendUrl') ||
        'http://localhost:3001';
      const errorMessage =
        err?.message ||
        (typeof info === 'object' ? info?.message : info) ||
        'oauth_failed';
      response.redirect(
        `${frontendUrl}/login?error=${encodeURIComponent(errorMessage)}`,
      );
      return null;
    }
    return user;
  }
}

