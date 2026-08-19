import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { SKIP_APP_KEY } from '../decorators/skip-app-key.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class AppKeyGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const skipAppKey = this.reflector.getAllAndOverride<boolean>(SKIP_APP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic || skipAppKey) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    
    // Always allow public master geographic data (regions)
    if (request.path.includes('/regions')) {
      return true;
    }
    
    // Only apply for /api/ routes
    if (!request.path.startsWith('/api/')) {
      return true;
    }

    // Always bypass OPTIONS request for CORS preflight
    if (request.method === 'OPTIONS') {
      return true;
    }

    const expectedKey = this.configService.get<string>('APP_API_KEY')?.trim();
    const nodeEnv = this.configService.get<string>('NODE_ENV') || 'development';

    if (!expectedKey) {
      if (nodeEnv === 'production') {
        throw new InternalServerErrorException(
          'Application security is misconfigured: APP_API_KEY is required in production',
        );
      }

      // Local development and tests may intentionally omit the app key.
      return true;
    }

    const providedKey = request.headers['x-app-key'];
    if (typeof providedKey === 'string' && providedKey.trim() === expectedKey) {
      return true;
    }

    // Origin, Referer, and Host are caller-controlled metadata and must never
    // be treated as a substitute for the application secret.
    throw new ForbiddenException('Unauthorized Application (Invalid App Key)');
  }
}
